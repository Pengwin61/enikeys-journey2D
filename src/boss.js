/* Enikey Journey — bosses.
   SRE-дежурный (scenes.yaml «duty»), Team Lead-гидра and CEO (battle.go bosses / IDEAS.md §2). */
'use strict';
(() => {
  const { dist, norm, rand, clamp } = EJ;
  const sfx = n => EJ.audio.play(n);
  const ent = () => EJ.ent;
  const fx = () => EJ.fx;

  // ---------------------------------------------------------------- shared: sweeping beams & ripples
  // beam: { x, y, a, a1, warn, t, dur, len, width, dmg, color }
  function updateBeams(G, dt) {
    const P = G.player;
    for (const b of G.beams) {
      if (b.warn > 0) { b.warn -= dt; continue; }
      b.t += dt;
      b.cur = b.a + (b.a1 - b.a) * Math.min(1, b.t / b.dur);
      b.tick = (b.tick || 0) - dt;
      // distance from player to the beam segment
      const ex = b.x + Math.cos(b.cur) * b.len, ey = b.y + Math.sin(b.cur) * b.len;
      const vx = ex - b.x, vy = ey - b.y, wx = P.x - b.x, wy = P.y - b.y;
      const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
      const d = Math.hypot(P.x - (b.x + vx * t), P.y - (b.y + vy * t));
      if (d < b.width + P.r * 0.5 && b.tick <= 0 && P.dashT <= 0) { if (ent().hurtPlayer(G, b.dmg, b.x, b.y)) b.tick = 0.45; }
      if (Math.random() < 0.5) G.particles.push({ kind: 'spark', x: ex - Math.cos(b.cur) * Math.random() * b.len, y: ey - Math.sin(b.cur) * Math.random() * b.len, z: 4, vx: 0, vy: 0, vz: 30, life: 0.3, max: 0.3, color: b.color, size: 1, nograv: true });
    }
    G.beams = G.beams.filter(b => b.warn > 0 || b.t < b.dur);
  }
  function updateWaves(G, dt) {
    const P = G.player;
    for (const w of G.waves) {
      w.r += w.speed * dt;
      if (!w.hit && Math.abs(dist(P.x, P.y, w.x, w.y) - w.r) < w.width && P.dashT <= 0) { if (ent().hurtPlayer(G, w.dmg, w.x, w.y)) w.hit = true; }
    }
    G.waves = G.waves.filter(w => w.r < w.maxR);
  }
  const ripple = (G, x, y, color, dmg, speed = 5.5, maxR = 7.5) => G.waves.push({ x, y, r: 0.3, speed, maxR, width: 0.32, color, dmg, hit: false });
  const beam = (G, e, a, a1, dur, color, dmg, warn = 0.7) => G.beams.push({ x: e.x, y: e.y, a, a1, warn, warnMax: warn, t: 0, dur, len: 9, width: 0.32, dmg, color, cur: a });

  function phaseCheck(G, e, thresholds, onPhase) {
    const ratio = e.hp / e.maxHp;
    let want = 1;
    thresholds.forEach((t, i) => { if (ratio < t) want = i + 2; });
    if (want > e.phase) {
      e.phase = want; e.inv = 1.6; e.action = null; e.idleT = 1.6;
      G.bullets = G.bullets.filter(b => b.team !== 'e'); G.hazards = []; G.beams = [];
      fx().ring(G, e.x, e.y, 5, e.color || '#ff2b47', 0.6, 2); fx().shake(G, 10);
      sfx('phase');
      const P = G.player, [nx, ny] = norm(P.x - e.x, P.y - e.y);
      P.vx += nx * 10; P.vy += ny * 10;
      onPhase(want);
      return true;
    }
    return false;
  }
  const pickAction = (e, list) => {
    const opts = list.filter(([a]) => a !== e.lastAction || list.length < 2);
    let r = rand() * opts.reduce((s, [, w]) => s + w, 0);
    for (const [a, w] of opts) if ((r -= w) <= 0) return a;
    return opts[0][0];
  };

  // ================================================================ SRE-дежурный (golem)
  const GOLEM_PHASES = [null,
    { name: 'ПРОВЕРКА ДОСТУПА', line: '«НАЧИНАЮ ПРОВЕРКУ ДОСТУПА. СОПРОТИВЛЕНИЕ БУДЕТ ЗАЛОГИРОВАНО.»', acts: [['scan', 3], ['stomp', 2], ['eyes', 2]], idle: 1.1 },
    { name: 'ИНЦИДЕНТ NIGHT-451', line: '«ВЫ НЕ ДОЛЖНЫ ЗДЕСЬ НАХОДИТЬСЯ.»', acts: [['scan', 2], ['stomp', 2], ['eyes', 2], ['incident', 3]], idle: 0.9 },
    { name: 'ВЫ. НЕ. ГОТОВЫ.', line: '«ВЫ НЕ ГОТОВЫ К ДЕЖУРСТВУ.»', acts: [['double', 3], ['stomp', 2], ['incident', 2], ['eyes', 1]], idle: 0.65 },
  ];
  function golem(G, e, dt, d, ang) {
    const P = G.player;
    e.inv -= dt;
    if (phaseCheck(G, e, [0.6, 0.25], ph => G.hud.banner(GOLEM_PHASES[ph].name, GOLEM_PHASES[ph].line, '#3a8bff', 2.6))) return;
    if (e.inv > 0) { e.cast = 1; return; }
    e.cast = Math.max(0, (e.cast || 0) - dt * 2);
    const ph = GOLEM_PHASES[e.phase];
    if (!e.action) {
      // slow, heavy walk toward the player; every step sends a ripple in phase 3
      if (d > 3) { const [mx, my] = ent().chaseDir(G, e); ent().moveActor(G.L, e, mx * e.speed * dt, my * e.speed * dt); e.moving = true; }
      e.stepT = (e.stepT || 0) - dt;
      if (e.moving && e.stepT <= 0) { e.stepT = 0.6; fx().shake(G, 1.5); sfx('step'); if (e.phase >= 3) ripple(G, e.x, e.y, '#3a8bff', { hp: 2 }, 4.5, 4); }
      if ((e.idleT -= dt) <= 0) { e.action = pickAction(e, ph.acts); e.lastAction = e.action; e.actT = 0; e.step = 0; }
      return;
    }
    e.actT += dt;
    const t = e.actT;
    switch (e.action) {
      case 'scan': {
        if (e.step === 0) { e.step = 1; const sweep = 1.3 * (rand() < 0.5 ? 1 : -1); beam(G, e, ang - sweep / 2, ang + sweep / 2, 1.3, '#5ab4ff', { hp: 4 }, 0.75); e.cast = 1; G.hud.alert('СКАНИРОВАНИЕ'); sfx('charge'); }
        if (t > 2.3) end(e, ph.idle);
        break;
      }
      case 'double': {
        if (e.step === 0) { e.step = 1; beam(G, e, ang - 1.4, ang + 0.2, 1.6, '#5ab4ff', { hp: 4 }, 0.7); beam(G, e, ang + 1.4, ang - 0.2, 1.6, '#5ab4ff', { hp: 4 }, 0.7); e.cast = 1; sfx('charge'); }
        if (t > 2.6) end(e, ph.idle);
        break;
      }
      case 'stomp': {
        if (e.step < 3 && t > 0.45 + e.step * 0.55) {
          e.step++; fx().shake(G, 6); sfx('boom');
          ripple(G, e.x, e.y, '#9fd8ff', { hp: 4 }, 5.5, 8);
          fx().debris(G, e.x, e.y, 2, ['#1b1e29', '#3a8bff'], 8);
        }
        if (t > 2.2) end(e, ph.idle);
        break;
      }
      case 'eyes': {
        e.cast = 0.7;
        if (e.step < 3 && t > 0.3 + e.step * 0.45) {
          e.step++;
          const n = 14 + e.phase * 2, off = e.step * 0.2;
          for (let i = 0; i < n; i++) ent().enemyShot(G, e, off + (i / n) * Math.PI * 2, 4.2, { hp: 3 }, '#5ab4ff', 1.2);
          sfx('enemyShot');
        }
        if (t > 1.8) end(e, ph.idle);
        break;
      }
      case 'incident': {
        if (e.step === 0) {
          e.step = 1; G.hud.alert('INCIDENT NIGHT-451'); sfx('alarm');
          const room = G.L.rooms[e.room];
          const alive = G.enemies.filter(x => x.type !== 'golem').length;
          for (let i = 0; i < Math.min(4, 7 - alive); i++) {
            const x = room.x + 1 + rand() * (room.w - 2), y = room.y + 1 + rand() * (room.h - 2);
            if (!EJ.level.solidAt(G.L, x, y, 0.3) && dist(x, y, P.x, P.y) > 2.5) ent().makeEnemy(G, rand() < 0.5 ? 'bug' : 'spirit', x, y, { room: e.room });
          }
          ent().addHazard(G, P.x, P.y, 1.2, 1.1, 2, { hp: 3, burn: 3 }, 'incident');
        }
        if (t > 1.2) end(e, ph.idle);
        break;
      }
    }
  }

  // ================================================================ Team Lead-гидра
  const HEAD_KINDS = [
    { name: 'Срочный баг в проде!', color: '#ffb03a' },
    { name: 'Созвон на час', color: '#8f63ff' },
    { name: 'Дедлайн вчера', color: '#ff2d55' },
    { name: 'Ретро', color: '#3dffb0' },
    { name: 'Оценка в попугаях', color: '#ff3df0' },
  ];
  function spawnHead(G, body, k) {
    const hk = HEAD_KINDS[k];
    const h = ent().makeEnemy(G, 'head', body.x, body.y, { room: body.room, hp: 70, extra: { body, k, hk, color: hk.color, slot: k, down: 0, cd: 1 + rand() * 2, anchored: true, noContact: true } });
    h.onZero = headDown;
    body.heads.push(h);
    return h;
  }
  function setupHydra(G, body) {
    body.heads = [];
    body.untouchable = true; body.anchored = true; body.cycles = 0; body.stun = 0;
    for (let k = 0; k < 3; k++) spawnHead(G, body, k);
  }
  function headDown(G, h) {
    h.hp = 0; h.down = 6.5; h.untargetable = true; h.untouchable = true;
    fx().debris(G, h.x, h.y, h.z, ['#14151d', h.color, '#fff'], 16); fx().sparks(G, h.x, h.y, h.z, h.color, 16, 4);
    sfx('kill'); fx().shake(G, 4);
    fx().floater(G, h.x, h.y, 'Проект закрыт', h.color, true);
    const body = h.body;
    if (body.heads.every(x => x.down > 0) && body.stun <= 0) {
      body.stun = 4.5; body.untouchable = false;
      G.hud.banner('ВСЕ ПРОЕКТЫ ЗАКРЫТЫ', 'Team Lead беззащитен — бей!', '#3dffb0', 2);
      sfx('phase'); fx().shake(G, 8);
    }
  }
  function hydra(G, e, dt) {
    if (!e.heads) setupHydra(G, e);
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.stun <= 0) {
        e.untouchable = true; e.cycles++;
        // regrow everything, plus one more head (max 5)
        for (const h of e.heads) { h.down = 0.01; }
        if (e.heads.length < 5) spawnHead(G, e, e.heads.length);
        G.hud.banner('ПРОЕКТЫ ПЕРЕОТКРЫТЫ', e.heads.length > 3 ? `Новая голова: «${HEAD_KINDS[e.heads.length - 1].name}»` : 'Руби все головы за один цикл', '#ff3df0', 2.2);
        sfx('alarm');
      }
    }
  }
  function head(G, h, dt, d, ang) {
    const body = h.body;
    if (!body || body.dead) { ent().killEnemy(G, h); return; }
    // neck anchors spread above the body
    const n = body.heads.length, i = body.heads.indexOf(h);
    const spread = (i - (n - 1) / 2) * 1.25;
    const sway = Math.sin(h.anim * 1.3 + i) * 0.35;
    const tx = body.x + spread + sway, ty = body.y + 1.1 + Math.cos(h.anim * 0.9 + i) * 0.4 - Math.abs(spread) * 0.25;
    h.x += (tx - h.x) * Math.min(1, dt * 3); h.y += (ty - h.y) * Math.min(1, dt * 3);
    h.z = 26 + Math.sin(h.anim * 2 + i) * 4;
    if (h.down > 0) {
      h.down -= dt;
      if (h.down <= 0 && body.stun <= 0) { h.hp = h.maxHp; h.untargetable = false; h.untouchable = false; fx().ring(G, h.x, h.y, 1, h.color, 0.4); fx().floater(G, h.x, h.y, 'Переоткрыт', h.color); sfx('spawn'); }
      else if (h.down <= 0) h.down = 0.2;
      return;
    }
    if (body.stun > 0) return;
    h.cd -= dt;
    if (h.cd > 0) return;
    const P = G.player;
    switch (h.k) {
      case 0: for (let j = -1; j <= 1; j++) ent().enemyShot(G, h, ang + j * 0.16, 6.5, { hp: 1, burn: 4 }, h.color, 1.1, { ghost: true }); h.cd = 1.6 + rand(); break;
      case 1: for (let j = 0; j < 14; j++) ent().enemyShot(G, h, (j / 14) * Math.PI * 2 + h.anim, 3.4, { hp: 2 }, h.color, 1.2, { ghost: true, slow: true }); h.cd = 2.8 + rand(); break;
      case 2: ent().addHazard(G, P.x, P.y, 1.2, 1.0, 0.3, { hp: 4, burn: 2 }, 'incident'); h.cd = 2.2 + rand(); break;
      case 3: for (const o of body.heads) if (o !== h && o.down <= 0) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25); fx().floater(G, o.x, o.y, '+ретро', h.color); } h.cd = 4.5; break;
      case 4: for (let j = 0; j < 6; j++) ent().enemyShot(G, h, h.anim * 3 + j * 1.05, 4.5, { hp: 2, burn: 1 }, h.color, 1, { ghost: true }); h.cd = 0.9; break;
    }
    if (h.k !== 3) sfx('enemyShot');
  }

  // ================================================================ CEO
  const CEO_PHASES = [null,
    { name: 'СОВЕТ ДИРЕКТОРОВ', line: '«Компания всегда должна иметь CEO.»', acts: [['fan', 3], ['guards', 2], ['dash', 1]], idle: 1.0 },
    { name: 'ОПТИМИЗАЦИЯ РАСХОДОВ', line: '«Человеческий ресурс признан возобновляемым.»', acts: [['fan', 2], ['optimize', 3], ['sweep', 2], ['dash', 2]], idle: 0.8 },
    { name: 'ВЕЧНЫЙ КВАРТАЛ', line: '«Отказ не предусмотрен контрактом.»', acts: [['spiral', 3], ['optimize', 2], ['dash', 2], ['mark', 1], ['guards', 1]], idle: 0.55 },
  ];
  function ceo(G, e, dt, d, ang) {
    const P = G.player;
    e.inv -= dt;
    if (phaseCheck(G, e, [0.66, 0.33], ph => G.hud.banner(`ФАЗА ${ph}: ${CEO_PHASES[ph].name}`, CEO_PHASES[ph].line, '#ffc04a', 2.6))) return;
    if (e.inv > 0) { e.cast = 1; return; }
    e.cast = Math.max(0, (e.cast || 0) - dt * 2);
    const ph = CEO_PHASES[e.phase];
    if (!e.action) {
      ent().strafeMove(G, e, dt, d, ang, 3, 5.5);
      if ((e.idleT -= dt) <= 0) { e.action = pickAction(e, ph.acts); e.lastAction = e.action; e.actT = 0; e.step = 0; }
      return;
    }
    e.actT += dt;
    const t = e.actT;
    const prev = e.prevHero;
    const col = prev ? '#ff2b47' : '#ffc04a';
    switch (e.action) {
      case 'fan': {
        e.cast = 0.8;
        if (e.step < 4 && t > 0.3 + e.step * 0.3) {
          e.step++;
          const a = Math.atan2(P.y + P.vy * 0.2 - e.y, P.x + P.vx * 0.2 - e.x);
          if (prev) for (let j = -1; j <= 1; j++) ent().enemyShot(G, e, a + j * 0.08, 12, { hp: 3 }, col, 1, { streak: true });
          else for (let j = -2; j <= 2; j++) ent().enemyShot(G, e, a + j * 0.15, 6.5, { hp: 3, burn: 1 }, col, 1.2);
          sfx('enemyShot');
        }
        if (t > 1.6) end(e, ph.idle);
        break;
      }
      case 'guards': {
        if (e.step === 0) {
          e.step = 1; G.hud.alert('СОВЕТ ДИРЕКТОРОВ: ОХРАНА'); sfx('alarm');
          const alive = G.enemies.filter(x => x !== e).length;
          for (let i = 0; i < Math.min(2, 4 - alive); i++) {
            const a = rand() * Math.PI * 2, x = e.x + Math.cos(a) * 2, y = e.y + Math.sin(a) * 2;
            if (!EJ.level.solidAt(G.L, x, y, 0.35)) ent().makeEnemy(G, rand() < 0.6 ? 'guard' : 'drone', x, y, { room: e.room });
          }
        }
        if (t > 1) end(e, ph.idle);
        break;
      }
      case 'optimize': {
        e.cast = 1;
        if (e.step === 0) {
          e.step = 1; G.hud.alert('ОПТИМИЗАЦИЯ РАСХОДОВ'); sfx('alarm');
          const R = G.L.rooms[e.room];
          ent().addHazard(G, P.x, P.y, 1.3, 1.1, 2.2, { burn: 6, drain: 2 }, 'incident');
          for (let i = 0; i < 3 + e.phase; i++) ent().addHazard(G, R.x + 1 + rand() * (R.w - 2), R.y + 1 + rand() * (R.h - 2), 1.2, 1.1 + rand() * 0.5, 2.2, { burn: 6, drain: 2 }, 'incident');
          ripple(G, e.x, e.y, col, { drain: 3, burn: 3 }, 5, 8);
        }
        if (t > 1.3) end(e, ph.idle);
        break;
      }
      case 'sweep': {
        if (e.step === 0) { e.step = 1; const s = 1.6 * (rand() < 0.5 ? 1 : -1); beam(G, e, ang - s / 2, ang + s / 2, 1.4, col, { hp: 5 }, 0.7); sfx('charge'); }
        if (t > 2.4) end(e, ph.idle);
        break;
      }
      case 'spiral': {
        e.cast = 1;
        e.tick = (e.tick || 0) - dt;
        if (t > 0.4 && t < 3.4 && e.tick <= 0) {
          e.tick = 0.08; e.spiralA = (e.spiralA || 0) + 0.29;
          for (let k = 0; k < 3; k++) ent().enemyShot(G, e, e.spiralA + (k * Math.PI * 2) / 3, 4.2, { hp: 3 }, k === 1 ? '#ffc04a' : '#ff2b47', 1);
          EJ.audio.play('enemyShot', 0.12);
        }
        if (t > 3.7) end(e, ph.idle);
        break;
      }
      case 'dash': {
        if (e.step === 0) { e.step = 1; e.dashA = ang; e.cast = 1; sfx('charge'); }
        if (t > 0.45 && t < 0.75) {
          ent().moveActor(G.L, e, Math.cos(e.dashA) * 14 * dt, Math.sin(e.dashA) * 14 * dt);
          if (Math.random() < 0.8) G.particles.push({ kind: 'smoke', x: e.x, y: e.y, z: 4, vx: 0, vy: 0, vz: 4, life: 0.4, max: 0.4, color: 'rgba(255,43,71,0.3)', size: 4 });
        }
        if (t > 0.75 && e.step === 1) { e.step = 2; for (let i = 0; i < 12; i++) ent().enemyShot(G, e, (i / 12) * Math.PI * 2, 5, { hp: 3 }, col, 1); sfx('boom'); fx().shake(G, 4); }
        if (t > 1.3) end(e, ph.idle);
        break;
      }
      case 'mark': {
        if (e.step === 0) { e.step = 1; P.marked = 5; fx().floater(G, P.x, P.y, prev ? 'Я ЗНАЮ ТВОИ УЯЗВИМОСТИ' : 'ВЫ — РАСХОДЫ', '#ff2d55', true); sfx('telegraph'); }
        if (t > 0.6) end(e, ph.idle);
        break;
      }
    }
  }

  function end(e, idle) { e.action = null; e.idleT = idle + rand() * 0.4; }

  EJ.boss = { golem, hydra, head, ceo, updateBeams, updateWaves, GOLEM_PHASES, CEO_PHASES, HEAD_KINDS };
})();
