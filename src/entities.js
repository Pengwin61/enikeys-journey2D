/* Enikey Journey — player (canon resources), enemies & elites, projectiles, hazards, drops, particles. */
'use strict';
(() => {
  const { clamp, dist, norm, lerp, rand } = EJ;
  const LV = () => EJ.level;
  const sfx = n => EJ.audio.play(n);

  // ================================================================ fx helpers
  const fx = {
    sparks(G, x, y, z, color, n = 8, speed = 4, life = 0.35) {
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, s = speed * (0.4 + rand() * 0.8);
        G.particles.push({ kind: 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 20 + rand() * 60, life: life * (0.5 + rand()), max: life, color, size: 1 });
      }
    },
    debris(G, x, y, z, colors, n = 10) {
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, s = 1 + rand() * 3.5;
        G.particles.push({ kind: 'pix', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 40 + rand() * 90, life: 0.6 + rand() * 0.9, max: 1.5, color: colors[i % colors.length], size: rand() < 0.3 ? 2 : 1, bounce: true });
      }
    },
    smoke(G, x, y, z, n = 4, color = 'rgba(40,40,55,0.5)') {
      for (let i = 0; i < n; i++) G.particles.push({ kind: 'smoke', x: x + (rand() - 0.5) * 0.4, y: y + (rand() - 0.5) * 0.4, z, vx: (rand() - 0.5) * 0.6, vy: (rand() - 0.5) * 0.6, vz: 10 + rand() * 12, life: 0.6 + rand() * 0.6, max: 1.2, color, size: 2 + rand() * 3 });
    },
    rise(G, x, y, color, n = 10) {
      for (let i = 0; i < n; i++) G.particles.push({ kind: 'spark', x: x + (rand() - 0.5) * 0.6, y: y + (rand() - 0.5) * 0.6, z: rand() * 10, vx: 0, vy: 0, vz: 30 + rand() * 30, life: 0.6, max: 0.6, color, size: 1, nograv: true });
    },
    ring(G, x, y, r, color, life = 0.35, width = 1) { G.particles.push({ kind: 'ring', x, y, z: 0, r0: 0.1, r1: r, life, max: life, color, width }); },
    flashLight(G, x, y, color, r = 2.5, life = 0.12) { G.lights.push({ x, y, z: 10, color, r, life, max: life }); },
    floater(G, x, y, text, color, big = false) { G.floaters.push({ x, y, z: 22, text: String(text), color, t: 0, life: big ? 1.1 : 0.8, big, vx: (rand() - 0.5) * 0.6 }); },
    shake(G, amount) { G.shake = Math.min(14, G.shake + amount); },
    hitstop(G, t) { G.hitstop = Math.max(G.hitstop, t); },
  };
  EJ.fx = fx;

  function moveActor(L, a, dx, dy, ignoreProps = false) {
    let hit = false;
    if (dx) { if (!LV().solidAt(L, a.x + dx, a.y, a.r, ignoreProps)) a.x += dx; else hit = true; }
    if (dy) { if (!LV().solidAt(L, a.x, a.y + dy, a.r, ignoreProps)) a.y += dy; else hit = true; }
    return hit;
  }

  // ================================================================ player (entity/player.go)
  const bar = (cur, max) => ({ cur, max });
  function makePlayer(x, y, prev) {
    const P = prev || {
      name: 'Эникей', level: 1, exp: bar(0, 10), hp: bar(30, 30), energy: bar(20, 20), burnout: bar(0, 100),
      gold: 0, skill: 1, luck: 35, passes: 0, bossesDefeated: 0, inv: { black_hat: 0 }, bufferUsed: false,
    };
    Object.assign(P, {
      x, y, r: 0.28, vx: 0, vy: 0, aimX: 1, aimY: 0, facing: 'front', flip: false, anim: 0, moving: false,
      fireCd: 0, dashT: 0, dashDX: 0, dashDY: 0, dashCd: 0, scanCd: 0, defending: false, defendRegen: 0,
      iframes: 1, hurtT: 0, alive: true, stepT: 0, afterimages: [], marked: 0, slow: 0, workT: 0, parryT: 0, parryCd: 0, holdT: 0, shotN: 0,
    });
    return P;
  }
  const rank = P => EJ.RANKS[Math.min(10, P.level)];
  // Burnout above 50% eats into damage (IDEAS §3: «При высоком выгорании урон игрока падает»).
  const burnoutFactor = P => 1 - Math.max(0, P.burnout.cur - 50) / 100;
  const vulnChance = P => Math.min(90, 20 + P.skill * 5 + ('multimeter' in P.inv ? 15 : 0));
  const gradeOf = (P, id) => (id in P.inv ? P.inv[id] : -1);
  const scanCost = P => ('multimeter' in P.inv ? 1 : 3);
  const gainEnergy = (P, n) => { P.energy.cur = Math.min(P.energy.max, P.energy.cur + n); };
  const critChance = P => 15 + P.skill * 2;

  function addExp(G, n) {
    const P = G.player;
    P.exp.cur += n;
    while (P.exp.cur >= P.exp.max) {
      P.exp.cur -= P.exp.max;
      if (P.level >= 10) { P.exp.cur = 0; break; }
      P.level++;
      P.hp.max += 10; P.hp.cur = P.hp.max;
      P.exp.max += 10;
      G.hud.banner(`УРОВЕНЬ ${P.level}`, `${rank(P)} · +10 к здоровью`, '#4fe9ff', 2.2);
      fx.ring(G, P.x, P.y, 2.5, '#4fe9ff', 0.6, 2); fx.rise(G, P.x, P.y, '#4fe9ff', 24);
      sfx('unlock');
    }
  }
  function addBurnout(G, n) {
    const P = G.player;
    P.burnout.cur = clamp(P.burnout.cur + n, 0, P.burnout.max);
    if (P.burnout.cur >= P.burnout.max && P.alive) G.onLethal('burnout');
  }

  // Item pickup (GiveUniqueItem): one of each id; passives apply immediately with the grade multiplier.
  function giveItem(G, id, grade) {
    const P = G.player, it = EJ.ITEMS[id];
    if (!it) return false;
    if (id in P.inv) {
      // duplicate: keep the better grade for actives, convert passives into gold
      if (it.type === 'A' && grade > P.inv[id]) { P.inv[id] = grade; return true; }
      const g = 5 + grade * 5; P.gold += g; fx.floater(G, P.x, P.y, `+${g} ◆`, '#ffd166');
      return false;
    }
    P.inv[id] = grade;
    if (it.type === 'P') applyStat(P, it.stat, Math.max(1, Math.round(it.value * EJ.GRADES[grade].mul)));
    return true;
  }
  function applyStat(P, stat, v) {
    if (stat === 'skill') P.skill += v;
    if (stat === 'luck') P.luck += v;
    if (stat === 'maxEnergy') { P.energy.max += v; P.energy.cur += v; }
  }
  function useItem(G, id) {
    const P = G.player, it = EJ.ITEMS[id];
    if (!(id in P.inv)) { sfx('deny'); G.hud.flashSlot(String(it.slot)); return; }
    const v = Math.round(it.value * EJ.GRADES[P.inv[id]].mul);
    if (it.stat === 'energy') { P.energy.cur = Math.min(P.energy.max, P.energy.cur + v); fx.floater(G, P.x, P.y, `+${v} ⚡`, '#5aa8ff'); fx.rise(G, P.x, P.y, '#5aa8ff'); }
    if (it.stat === 'burnout') { P.burnout.cur = Math.max(0, P.burnout.cur - v); fx.floater(G, P.x, P.y, `−${v} выгорания`, '#ffb03a'); fx.rise(G, P.x, P.y, '#ffb03a'); }
    if (it.stat === 'hp') heal(G, v);
    delete P.inv[id];
    sfx('heal');
  }

  function updatePlayer(G, dt) {
    const P = G.player, L = G.L, inp = EJ.input;
    if (!P.alive) return;
    const m = G.mouseWorld;
    if (m && inp.mouse.over) { const [ax, ay] = norm(m.x - P.x, m.y - P.y); P.aimX = ax; P.aimY = ay; }
    else { const t = nearestEnemy(G, P.x, P.y, 9); if (t) { const [ax, ay] = norm(t.x - P.x, t.y - P.y); P.aimX = ax; P.aimY = ay; } }
    const sdx = P.aimX - P.aimY, sdy = P.aimX + P.aimY;
    P.facing = sdy > -0.15 ? 'front' : 'back';
    P.flip = sdx < 0;

    let ix = 0, iy = 0;
    if (inp.held('KeyA', 'ArrowLeft')) ix -= 1;
    if (inp.held('KeyD', 'ArrowRight')) ix += 1;
    if (inp.held('KeyW', 'ArrowUp')) iy -= 1;
    if (inp.held('KeyS', 'ArrowDown')) iy += 1;
    let wx = ix + iy, wy = iy - ix;
    const moving = wx || wy;
    if (moving) [wx, wy] = norm(wx, wy);

    // Защита / Перерыв: half damage, slow, trickle energy back (battle.go PlayerDefend)
    P.defending = (inp.held('ShiftLeft', 'ShiftRight') || inp.mouse.right) && P.dashT <= 0 && !G.uiBlock;
    if (P.defending) {
      P.defendRegen += dt;
      if (P.defendRegen >= 1.4) { P.defendRegen = 0; if (P.energy.cur < P.energy.max) { P.energy.cur++; fx.floater(G, P.x, P.y, '+1 ⚡', '#5aa8ff'); } }
    } else P.defendRegen = 0;
    // Reject: pressing Shift opens a short parry window — bullets fly back, melee attackers get stunned
    P.parryCd -= dt; P.parryT -= dt;
    if ((inp.hit('ShiftLeft', 'ShiftRight') || inp.mouse.rclicked) && P.parryCd <= 0 && P.dashT <= 0 && !G.uiBlock) { P.parryT = 0.28; P.parryCd = 0.45; }

    // dash
    P.dashCd -= dt;
    if (inp.hit('Space') && P.dashCd <= 0 && P.dashT <= 0) {
      const [dx, dy] = moving ? [wx, wy] : [P.aimX, P.aimY];
      P.dashT = 0.16; P.dashDX = dx; P.dashDY = dy; P.dashCd = 0.75; P.iframes = Math.max(P.iframes, 0.24);
      sfx('dash'); fx.smoke(G, P.x, P.y, 2, 3, 'rgba(80,220,255,0.25)');
    }
    const speed = 4.4 * (P.defending ? 0.45 : 1) * (P.slow > 0 ? 0.6 : 1) * (P.workT > 0 ? 0 : 1);
    if (P.dashT > 0) {
      P.dashT -= dt;
      moveActor(L, P, P.dashDX * 20 * dt, P.dashDY * 20 * dt);
      P.afterimages.push({ x: P.x, y: P.y, t: 0.22, facing: P.facing, flip: P.flip });
      P.vx = P.dashDX * speed; P.vy = P.dashDY * speed;
    } else {
      P.vx = EJ.approach(P.vx, wx * speed, (moving ? 42 : 30) * dt); P.vy = EJ.approach(P.vy, wy * speed, (moving ? 42 : 30) * dt);
      moveActor(L, P, P.vx * dt, P.vy * dt);
    }
    for (const a of P.afterimages) a.t -= dt;
    P.afterimages = P.afterimages.filter(a => a.t > 0);
    P.moving = Math.hypot(P.vx, P.vy) > 0.4;
    if (P.moving) { P.anim += dt * 9; if ((P.stepT -= dt) <= 0) { P.stepT = 0.28; sfx('step'); } } else P.anim = 0;

    // attack
    P.fireCd -= dt;
    if (inp.mouse.down && !P.defending && !G.uiBlock && P.workT <= 0) {
      P.holdT += dt;
      if (P.fireCd <= 0) { P.fireCd = 0.2; shoot(G); }
    } else {
      if (P.holdT >= 0.7 && 'usb_linux' in P.inv && !P.defending) sudo(G);
      P.holdT = 0;
    }
    // Найти уязвимость (battle.go PlayerFindVulnerability): 2 energy, chance 20% + 5%·skill
    P.scanCd -= dt;
    if (inp.hit('KeyQ') && !G.uiBlock) {
      if (P.scanCd > 0) { /* still cooling */ }
      else if (P.energy.cur < scanCost(P)) { sfx('deny'); G.hud.flashSlot('q'); G.hud.toast('Недостаточно энергии. Убивай, парируй (Shift) или выпей кофе.', 1.8); }
      else { P.energy.cur -= scanCost(P); P.scanCd = 1.2; scan(G); }
    }
    for (const [i, id] of EJ.ACTIVE_SLOTS.entries()) if (inp.hit('Digit' + (i + 1))) useItem(G, id);
    P.iframes -= dt; P.hurtT -= dt; P.marked -= dt; P.slow -= dt;
  }

  function heal(G, amount) {
    const P = G.player, before = P.hp.cur;
    P.hp.cur = Math.min(P.hp.max, P.hp.cur + amount);
    if (P.hp.cur > before) fx.floater(G, P.x, P.y, '+' + Math.round(P.hp.cur - before), '#5dff8f');
    fx.rise(G, P.x, P.y, '#5dff8f');
  }

  const baseDmg = P => (7 + P.skill + Math.floor(rand() * 4)) * 0.35 * burnoutFactor(P);
  function shoot(G) {
    const P = G.player;
    P.shotN++;
    // Отвёртка: every 3rd shot becomes a spin if someone is in reach
    const sd = gradeOf(P, 'screwdriver');
    if (sd >= 0 && P.shotN % 3 === 0 && nearestEnemy(G, P.x, P.y, 1.7 + sd * 0.2)) { spin(G, sd); return; }
    const a0 = Math.atan2(P.aimY, P.aimX);
    const aws = gradeOf(P, 'aws_certificate');
    const spread = aws >= 0 && P.shotN % Math.max(2, 5 - aws) === 0 ? [-0.17, 0, 0.17] : [0];
    const cr = gradeOf(P, 'crimper');
    for (const off of spread) {
      const a = a0 + off + (rand() - 0.5) * 0.05;
      const crit = rand() * 100 < critChance(P);
      G.bullets.push({
        team: 'p', x: P.x + Math.cos(a) * 0.35, y: P.y + Math.sin(a) * 0.35, z: 11, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14,
        dmg: baseDmg(P) * (crit ? 1.5 : 1), crit, life: 0.8, r: 0.18, color: crit ? '#fff27a' : '#4fe9ff', hit: new Set(),
        chain: cr >= 0 ? 1 + cr : 0,
      });
    }
    // Ноутбук: the assistant drone mirrors the shot
    const bot = G.allies.find(x => x.kind === 'laptop');
    if (bot) {
      const tx = P.x + P.aimX * 7, ty = P.y + P.aimY * 7, [bx, by] = norm(tx - bot.x, ty - bot.y);
      G.bullets.push({ team: 'p', x: bot.x, y: bot.y, z: bot.z, vx: bx * 13, vy: by * 13, dmg: baseDmg(P) * (0.4 + 0.15 * P.inv.laptop), life: 0.8, r: 0.15, color: '#b48bff', hit: new Set(), small: true });
    }
    G.muzzle = 0.05;
    fx.flashLight(G, P.x + P.aimX * 0.4, P.y + P.aimY * 0.4, 'rgba(80,230,255,0.9)', 2.2, 0.06);
    sfx('shoot');
  }

  function spin(G, grade) {
    const P = G.player, R = 1.6 + grade * 0.2;
    G.spinFx = { t: 0.22, x: P.x, y: P.y, r: R };
    fx.ring(G, P.x, P.y, R, '#ffb03a', 0.25, 2); fx.sparks(G, P.x, P.y, 10, '#ffd27a', 14, 6, 0.3);
    sfx('shock'); fx.shake(G, 3);
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || e.untargetable || dist(P.x, P.y, e.x, e.y) > R + e.r) continue;
      const [kx, ky] = norm(e.x - P.x, e.y - P.y);
      damageEnemy(G, e, baseDmg(P) * (2.2 + grade * 0.6), kx * 9, ky * 9, false);
    }
  }
  // Флешка с Linux: charged piercing shot
  function sudo(G) {
    const P = G.player;
    if (P.energy.cur < 2) { fx.floater(G, P.x, P.y, 'sudo: нужно 2 ⚡', '#8a8fa8'); sfx('deny'); return; }
    P.energy.cur -= 2;
    const a = Math.atan2(P.aimY, P.aimX), g = P.inv.usb_linux;
    G.bullets.push({ team: 'p', x: P.x, y: P.y, z: 11, vx: Math.cos(a) * 22, vy: Math.sin(a) * 22, dmg: baseDmg(P) * (3.2 + g), crit: true, life: 0.9, r: 0.35, color: '#b7ff6a', hit: new Set(), pierce: true, sudo: true });
    fx.floater(G, P.x, P.y, 'sudo !!', '#b7ff6a', true); fx.flashLight(G, P.x, P.y, 'rgba(183,255,106,1)', 3, 0.15);
    sfx('shock'); fx.shake(G, 4);
  }
  // Reject: the bullet goes back to its sender
  function reflect(G, b) {
    const P = G.player;
    const tgt = b.owner && !b.owner.dead ? b.owner : nearestEnemy(G, P.x, P.y, 12);
    const [nx, ny] = tgt ? norm(tgt.x - b.x, tgt.y - b.y) : norm(-b.vx, -b.vy);
    Object.assign(b, { team: 'p', vx: nx * 15, vy: ny * 15, dmg: baseDmg(P) * 2.4, crit: true, life: 1.2, color: '#e9f8ff', hit: new Set(), reflected: true, ghost: false });
    if (b.dmg.hp !== undefined) b.dmg = baseDmg(P) * 2.4;
    rejected(G);
  }
  function rejected(G) {
    const P = G.player;
    if (G.rejectT > 0) return; // one fanfare per window
    G.rejectT = 0.25;
    gainEnergy(P, 2);
    fx.floater(G, P.x, P.y, 'REJECTED', '#9fd8ff', true);
    fx.ring(G, P.x, P.y, 1.2, '#9fd8ff', 0.3, 2);
    G.slowT = 0.22; fx.hitstop(G, 0.05);
    sfx('crit'); sfx('unlock');
  }

  function scan(G) {
    const P = G.player, R = 6.5, cone = 0.75;
    const a0 = Math.atan2(P.aimY, P.aimX);
    G.scanFx = { t: 0.35, a: a0, x: P.x, y: P.y };
    sfx('hack'); sfx('telegraph');
    let any = false;
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.dead) continue;
      const d = dist(P.x, P.y, e.x, e.y);
      if (d > R) continue;
      let da = Math.atan2(e.y - P.y, e.x - P.x) - a0;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > cone) continue;
      any = true;
      if (rand() * 100 < vulnChance(P)) { e.vuln = 5; fx.floater(G, e.x, e.y, 'УЯЗВИМОСТЬ!', '#ff2d55', true); sfx('crit'); }
      else fx.floater(G, e.x, e.y, 'нет уязвимости', '#8a8fa8');
    }
    if (!any) fx.floater(G, P.x, P.y, 'некого проверять', '#8a8fa8');
  }

  // dmg: { hp, burn, drain }
  function hurtPlayer(G, dmg, sx, sy) {
    const P = G.player;
    if (!P.alive || P.iframes > 0 || G.state !== 'play' || G.debugGod) return false;
    const mul = (P.defending ? 0.5 : 1) * (P.marked > 0 ? 1.5 : 1);
    const hp = Math.round((dmg.hp || 0) * mul), burn = Math.round((dmg.burn || 0) * mul), drain = dmg.drain || 0;
    if (!hp && !burn && !drain) return false;
    P.iframes = 0.7; P.hurtT = 0.25;
    G.stats.damageTaken += hp;
    const [kx, ky] = norm(P.x - sx, P.y - sy);
    P.vx += kx * 6; P.vy += ky * 6;
    if (hp) { P.hp.cur = Math.max(0, P.hp.cur - hp); fx.floater(G, P.x, P.y, '-' + hp, '#ff4466'); G.hurtFlash = 1; fx.shake(G, 6); fx.hitstop(G, 0.06); sfx('hurt'); }
    if (drain) { const d = Math.min(drain, P.energy.cur); P.energy.cur -= d; if (d) fx.floater(G, P.x + 0.3, P.y, `-${d} ⚡`, '#5aa8ff'); G.drainFlash = 1; }
    if (burn) { fx.floater(G, P.x - 0.3, P.y, `+${burn} 🔥`, '#ffb03a'); G.burnFlash = 1; if (!hp) sfx('enemyShot'); }
    fx.sparks(G, P.x, P.y, 10, hp ? '#ff3355' : burn ? '#ffb03a' : '#5aa8ff', 10, 4);
    if (burn) addBurnout(G, burn);
    if (P.hp.cur <= 0 && P.alive) G.onLethal('hp');
    return true;
  }

  // ================================================================ enemies
  // hp in real-time units; dmg = {hp, burn, drain}
  const DEF = {
    bug: { hp: 6, speed: 3.4, r: 0.22, contact: { hp: 2 }, exp: 1, gold: 0.4, label: 'Баг' },
    imp: { hp: 13, speed: 2.3, r: 0.28, contact: { hp: 2 }, exp: 1, gold: 1, label: 'Легаси-демон' },
    spirit: { hp: 11, speed: 1.7, r: 0.3, contact: { drain: 2, burn: 2 }, exp: 1, gold: 1, fly: true, label: 'Дух очереди' },
    drone: { hp: 12, speed: 2.6, r: 0.3, contact: { hp: 2 }, exp: 1, gold: 1, fly: true, label: 'Дрон охраны' },
    guard: { hp: 30, speed: 2.2, r: 0.36, contact: { hp: 3 }, exp: 2, gold: 2, label: 'Охрана' },
    cultist: { hp: 20, speed: 2.0, r: 0.32, contact: { hp: 2 }, exp: 2, gold: 2, label: 'Корпокультист' },
    elite: { hp: 0, speed: 2.4, r: 0.32, contact: { hp: 3 }, exp: 6, gold: 0, label: '' },
    golem: { hp: 0, speed: 1.5, r: 0.7, contact: { hp: 5 }, exp: 15, gold: 0, label: 'SRE-дежурный' },
    hydra: { hp: 0, speed: 0, r: 0.8, contact: { hp: 4 }, exp: 18, gold: 0, label: 'Team Lead-гидра' },
    head: { hp: 0, speed: 0, r: 0.42, contact: { hp: 0 }, exp: 0, gold: 0, fly: true, label: '' },
    ceo: { hp: 0, speed: 2.2, r: 0.6, contact: { hp: 6 }, exp: 30, gold: 0, label: 'CEO' },
  };
  EJ.ENEMY_DEF = DEF;

  function scaleOf(G) { const o = G.overtime ? 0.3 : 0; return { hp: 1 + 0.12 * (G.day - 1) + 0.45 * G.floorIdx + 0.6 * G.cycle + o, dmg: 1 + 0.03 * (G.day - 1) + 0.18 * G.floorIdx + 0.25 * G.cycle + o }; }

  function makeEnemy(G, type, x, y, opts = {}) {
    const d = DEF[type], sc = scaleOf(G);
    let hp = Math.round((opts.hp ?? d.hp) * (opts.noScale ? 1 : sc.hp));
    const e = {
      type, x, y, r: d.r, hp, maxHp: hp, speed: d.speed * (1 + 0.03 * G.floorIdx), def: d,
      vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, state: 'idle', t: 0, cd: 0.8 + rand() * 1.2, anim: rand() * 10,
      spawnT: opts.instant ? 0 : 0.7, z: d.fly ? 12 : 0, strafe: rand() < 0.5 ? 1 : -1, room: opts.room ?? null,
      dmgMul: sc.dmg, contactCd: 0, id: G.nextId++, vuln: 0, ...opts.extra,
    };
    G.enemies.push(e);
    if (!opts.instant) sfx('spawn');
    return e;
  }

  function makeElite(G, kind, x, y, room) {
    const E = EJ.ELITES[kind];
    const e = makeEnemy(G, 'elite', x, y, { room, hp: E.hp * 4, extra: { kind, elite: E, cd: 1.2 } });
    return e;
  }

  function nearestEnemy(G, x, y, range, needLos = false) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.dead || e.untargetable) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd && (!needLos || LV().los(G.L, x, y, e.x, e.y))) { bd = d; best = e; }
    }
    return best;
  }

  function damageEnemy(G, e, dmg, kx, ky, crit) {
    if (e.dead || e.spawnT > 0) return;
    if (e.inv > 0 || e.untouchable) { fx.sparks(G, e.x, e.y, 20, '#8890a8', 3, 2); fx.floater(G, e.x, e.y, 'иммунитет', '#8890a8'); return; }
    let d = dmg;
    if (e.vuln > 0) { d *= 2; crit = true; }
    if (e.type === 'spirit') d *= 0.5;
    const lic = gradeOf(G.player, 'windows_license');
    if (crit && lic >= 0 && e.def.r <= 0.5 && e.type !== 'head') { e.stunT = 0.6 + lic * 0.25; if (!e.bsod || e.bsod < G.stats.time) { e.bsod = G.stats.time + 1; fx.floater(G, e.x, e.y - 0.3, 'BSOD', '#3a8bff'); } }
    if (e.armor) d *= e.armor;
    e.hp -= d; e.flash = 0.08;
    const heavy = ['golem', 'hydra', 'head', 'ceo'].includes(e.type);
    const kb = heavy ? 0 : e.type === 'elite' || e.type === 'guard' ? 0.4 : 1;
    e.kx += kx * kb; e.ky += ky * kb;
    G.stats.damageDealt += d;
    fx.floater(G, e.x, e.y, Math.max(1, Math.round(d)), crit ? '#fff27a' : '#e8f6ff', crit);
    sfx(crit ? 'crit' : 'hit');
    if (e.onHit) e.onHit(G, e);
    if (e.hp <= 0) (e.onZero ? e.onZero(G, e) : killEnemy(G, e));
  }

  const DEBRIS = {
    bug: ['#1e5a3a', '#58ff8a', '#05060a'], imp: ['#b2182b', '#6e0f1c', '#ffd27a'], spirit: ['#7fc4ff', '#3a7bff', '#ffffff'],
    drone: ['#2a2d3a', '#ff2a4f', '#555a70'], guard: ['#262a36', '#454b61', '#ff2445'], cultist: ['#521022', '#8a1730', '#ff2a4f'],
    elite: ['#2f3342', '#e2b08c', '#ffb03a'], golem: ['#1b1e29', '#3a8bff', '#9fd8ff'], hydra: ['#2c3140', '#ff3df0', '#e2b08c'], head: ['#14151d', '#ff3df0', '#fff'], ceo: ['#2a0912', '#ffc04a', '#ff2b47'],
  };
  function killEnemy(G, e) {
    if (e.dead) return;
    e.dead = true;
    G.stats.kills++;
    const big = ['golem', 'hydra', 'ceo'].includes(e.type);
    fx.debris(G, e.x, e.y, e.z + 8, DEBRIS[e.type] || DEBRIS.elite, big ? 60 : e.type === 'elite' ? 26 : 12);
    fx.sparks(G, e.x, e.y, e.z + 8, e.type === 'spirit' ? '#9fd8ff' : e.type === 'bug' ? '#58ff8a' : '#ff3355', big ? 60 : 12, 6);
    fx.smoke(G, e.x, e.y, e.z + 6, 4);
    fx.ring(G, e.x, e.y, 1.1, '#ff3355', 0.25);
    fx.flashLight(G, e.x, e.y, 'rgba(255,60,90,1)', 3, 0.2);
    fx.shake(G, big ? 14 : e.type === 'elite' ? 7 : 3); fx.hitstop(G, big ? 0.25 : e.type === 'elite' ? 0.1 : 0.03);
    sfx(big || e.type === 'elite' ? 'boom' : 'kill');
    if (e.def.exp) addExp(G, e.def.exp);
    if (e.type !== 'head') gainEnergy(G.player, 1 + ('coffee_cup' in G.player.inv ? 1 : 0));
    const coins = Math.floor(e.def.gold + rand());
    for (let i = 0; i < coins; i++) dropCoin(G, e.x, e.y, 1 + (rand() < 0.25 ? 1 : 0));
    // small chance of a consumable (canon drop chances, scaled down for trash mobs)
    if (!big && e.type !== 'head' && rand() < 0.07) {
      const id = EJ.ACTIVE_SLOTS[Math.floor(rand() * 5)];
      dropItem(G, e.x, e.y, id, EJ.rollGrade(G.player.luck));
    }
    if (e.onDeath) e.onDeath(G, e);
    if (G.onEnemyKilled) G.onEnemyKilled(e);
  }

  function dropCoin(G, x, y, v) {
    G.drops.push({ kind: 'coin', value: v, x, y, z: 8, vz: 50 + rand() * 40, vx: (rand() - 0.5) * 3, vy: (rand() - 0.5) * 3, t: 0, life: 30, r: 0.1 });
  }
  function dropItem(G, x, y, id, grade) {
    G.drops.push({ kind: 'item', id, grade, x, y, z: 10, vz: 70, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, t: 0, life: 9999, r: 0.1 });
  }
  function dropPass(G, x, y) {
    G.drops.push({ kind: 'pass', x, y, z: 14, vz: 80, vx: 0, vy: 0, t: 0, life: 9999, r: 0.1 });
  }

  function chaseDir(G, e) {
    const L = G.L, F = G.flow, P = G.player;
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    if (!F || (dist(e.x, e.y, P.x, P.y) < 4 && LV().los(L, e.x, e.y, P.x, P.y))) return norm(P.x - e.x, P.y - e.y);
    const here = F[L.idx(tx, ty)];
    let best = null, bv = here >= 0 ? here : 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const v = F[L.idx(nx, ny)];
      if (v < 0) continue;
      if (dx && dy && (F[L.idx(tx + dx, ty)] < 0 || F[L.idx(tx, ty + dy)] < 0)) continue;
      if (v < bv) { bv = v; best = [nx + 0.5 - e.x, ny + 0.5 - e.y]; }
    }
    return best ? norm(best[0], best[1]) : norm(P.x - e.x, P.y - e.y);
  }

  // dmg = {hp, burn, drain}
  function enemyShot(G, e, angle, speed, dmg, color = '#ff3355', size = 1, extra = {}) {
    const m = e.dmgMul || 1;
    G.bullets.push({
      team: 'e', x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, z: (e.shotZ ?? e.z + 10), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg: { hp: (dmg.hp || 0) * m, burn: (dmg.burn || 0) * m, drain: dmg.drain || 0 }, life: 4, r: 0.15 * size, color, size, hit: new Set(), owner: e, ...extra,
    });
  }

  function updateEnemies(G, dt) {
    const P = G.player, L = G.L;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.anim += dt; e.flash -= dt; e.contactCd -= dt; e.vuln -= dt;
      if (e.spawnT > 0) { e.spawnT -= dt; if (e.spawnT <= 0) fx.ring(G, e.x, e.y, 0.9, '#ff3355', 0.25); continue; }
      if (Math.abs(e.kx) + Math.abs(e.ky) > 0.05) {
        moveActor(L, e, e.kx * dt, e.ky * dt, e.def.fly);
        e.kx *= Math.pow(0.0008, dt); e.ky *= Math.pow(0.0008, dt);
      }
      const d = dist(e.x, e.y, P.x, P.y), ang = Math.atan2(P.y - e.y, P.x - e.x);
      e.moving = false;
      if (e.stunT > 0) { e.stunT -= dt; continue; }
      (AI[e.type] || AI.idle)(G, e, dt, d, ang);
      if (P.alive && d < e.r + P.r + 0.05 && e.contactCd <= 0 && !e.noContact && e.state !== 'stun' && !(e.z > 30)) {
        const c = e.def.contact;
        if (P.parryT > 0 && e.def.r <= 0.5) { e.stunT = 1.2; e.contactCd = 1; const [kx, ky] = norm(e.x - P.x, e.y - P.y); e.kx += kx * 8; e.ky += ky * 8; rejected(G); continue; }
        const charge = e.state === 'charge' ? 1.8 : 1;
        if (hurtPlayer(G, { hp: (c.hp || 0) * e.dmgMul * charge, burn: (c.burn || 0) * e.dmgMul, drain: c.drain || 0 }, e.x, e.y)) e.contactCd = 0.8;
      }
    }
    const list = G.enemies;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead || a.spawnT > 0 || b.spawnT > 0 || a.anchored || b.anchored) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), m = a.r + b.r;
      if (dd < m && dd > 0.001) {
        const push = (m - dd) * 0.5, nx = dx / dd, ny = dy / dd;
        const wa = a.def.r > 0.5 ? 0 : 1, wb = b.def.r > 0.5 ? 0 : 1;
        moveActor(L, a, -nx * push * wa, -ny * push * wa, a.def.fly);
        moveActor(L, b, nx * push * wb, ny * push * wb, b.def.fly);
      }
    }
    G.enemies = G.enemies.filter(e => !e.dead);
  }

  const strafeMove = (G, e, dt, d, ang, near, far, speed = e.speed) => {
    const L = G.L, P = G.player;
    let mx = 0, my = 0;
    const sees = LV().los(L, e.x, e.y, P.x, P.y);
    if (!sees || d > far) [mx, my] = chaseDir(G, e);
    else if (d < near) { mx = -Math.cos(ang); my = -Math.sin(ang); }
    else { mx = -Math.sin(ang) * e.strafe * 0.7; my = Math.cos(ang) * e.strafe * 0.7; if (rand() < dt * 0.4) e.strafe *= -1; }
    if (moveActor(L, e, mx * speed * dt, my * speed * dt, e.def.fly)) e.strafe *= -1;
    e.moving = !!(mx || my);
    return sees;
  };

  const AI = {
    idle() {},
    bug(G, e, dt) {
      // bugs in prod multiply if nobody closes them in time
      e.splitT = (e.splitT ?? 4.5) - dt;
      if (e.splitT <= 0) {
        e.splitT = 4.5;
        if (G.enemies.filter(x => x.type === 'bug' && !x.dead).length < 14) {
          const n = makeEnemy(G, 'bug', e.x + (rand() - 0.5) * 0.6, e.y + (rand() - 0.5) * 0.6, { room: e.room, instant: true });
          n.hp = n.maxHp = e.maxHp; fx.floater(G, e.x, e.y, 'баг размножился', '#58ff8a'); fx.sparks(G, e.x, e.y, 6, '#58ff8a', 8, 3);
        }
      }
      const [dx, dy] = chaseDir(G, e);
      const w = Math.sin(e.anim * 9 + e.id) * 0.5;
      moveActor(G.L, e, (dx - dy * w) * e.speed * dt, (dy + dx * w) * e.speed * dt);
      e.moving = true;
    },
    imp(G, e, dt, d, ang) {
      e.z = Math.max(0, Math.sin(e.anim * 6) * 5);
      const sees = strafeMove(G, e, dt, d, ang, 2.5, 6);
      e.cd -= dt;
      if (e.cd <= 0 && sees && d < 8) {
        e.cd = 1.8 + rand() * 0.8;
        enemyShot(G, e, ang, 5.5, { hp: 3 }, '#ff8a2a', 1.2);
        sfx('enemyShot');
      }
    },
    spirit(G, e, dt, d, ang) {
      e.z = 8 + Math.sin(e.anim * 2) * 3;
      const s = e.speed * (d < 3 ? 1.6 : 1);
      moveActor(G.L, e, Math.cos(ang) * s * dt, Math.sin(ang) * s * dt, true);
      e.moving = true;
    },
    drone(G, e, dt, d, ang) {
      e.z = 14 + Math.sin(e.anim * 4) * 2;
      const sees = strafeMove(G, e, dt, d, ang, 3.4, 6.5);
      e.cd -= dt;
      if (e.state === 'aim') {
        if ((e.t -= dt) <= 0) { e.state = 'idle'; for (let i = -1; i <= 1; i++) enemyShot(G, e, ang + i * 0.22, 6, { hp: 3 }); sfx('enemyShot'); }
      } else if (e.cd <= 0 && sees && d < 9) { e.state = 'aim'; e.t = 0.4; e.cd = 1.8 + rand() * 0.8; }
    },
    guard(G, e, dt, d, ang) {
      const L = G.L, P = G.player;
      if (e.state === 'stun') { if ((e.t -= dt) <= 0) e.state = 'idle'; return; }
      if (e.state === 'wind') {
        let da = Math.atan2(P.y - e.y, P.x - e.x) - e.chargeA; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        e.chargeA += clamp(da, -dt * 1.6, dt * 1.6);
        if ((e.t -= dt) <= 0) { e.state = 'charge'; e.t = 0.42; sfx('dash'); }
        return;
      }
      if (e.state === 'charge') {
        const hit = moveActor(L, e, Math.cos(e.chargeA) * 11 * dt, Math.sin(e.chargeA) * 11 * dt);
        if (hit) { e.state = 'stun'; e.t = 1.0; fx.shake(G, 4); fx.sparks(G, e.x, e.y, 14, '#ffd27a', 10, 4); sfx('hit'); }
        else if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.6; }
        return;
      }
      if (e.state === 'recover') { if ((e.t -= dt) <= 0) e.state = 'idle'; return; }
      const [dx, dy] = chaseDir(G, e);
      moveActor(L, e, dx * e.speed * dt, dy * e.speed * dt);
      e.moving = true;
      if ((e.cd -= dt) <= 0 && d < 4.2 && LV().los(L, e.x, e.y, P.x, P.y)) { e.state = 'wind'; e.t = 0.55; e.chargeA = ang; e.cd = 2.2 + rand(); sfx('charge'); }
    },
    cultist(G, e, dt, d, ang) {
      const P = G.player;
      e.z = 2 + Math.sin(e.anim * 2.5) * 1.5;
      if (e.state === 'cast') {
        if ((e.t -= dt) <= 0) {
          e.state = 'idle';
          addHazard(G, P.x + P.vx * 0.4, P.y + P.vy * 0.4, 1.1, 0.95, 0.25, { hp: 2, burn: 7 }, 'ritual');
          sfx('telegraph');
        }
        return;
      }
      strafeMove(G, e, dt, d, ang, 3, 6.5);
      if ((e.cd -= dt) <= 0 && d < 9) { e.state = 'cast'; e.t = 0.6; e.cd = 3 + rand() * 1.2; }
    },
    elite(G, e, dt, d, ang) { ELITE_AI[e.kind](G, e, dt, d, ang); },
    golem: (G, e, dt, d, ang) => EJ.boss.golem(G, e, dt, d, ang),
    hydra: (G, e, dt, d, ang) => EJ.boss.hydra(G, e, dt, d, ang),
    head: (G, e, dt, d, ang) => EJ.boss.head(G, e, dt, d, ang),
    ceo: (G, e, dt, d, ang) => EJ.boss.ceo(G, e, dt, d, ang),
  };

  // ---------------------------------------------------------------- elites (battle.go eliteEnemies)
  const ELITE_AI = {
    // Senior Backend: «N+1 запрос» bursts that drain energy; «Миграция БД» slam
    backend(G, e, dt, d, ang) {
      const E = e.elite;
      if (e.state === 'burst') {
        if ((e.t -= dt) <= 0) {
          e.t = 0.09; e.shots++;
          enemyShot(G, e, ang + (rand() - 0.5) * 0.35, 6.5, { hp: E.attack * 0.4, drain: 1 }, '#ffb03a', 1);
          EJ.audio.play('enemyShot', 0.06);
          if (e.shots >= 7) { e.state = 'idle'; e.cd = 1.6; }
        }
        return;
      }
      const sees = strafeMove(G, e, dt, d, ang, 3, 6);
      if ((e.cd -= dt) <= 0 && sees) {
        if (rand() < 0.65) { e.state = 'burst'; e.t = 0.35; e.shots = 0; fx.floater(G, e.x, e.y, 'N+1 запрос', '#ffb03a'); }
        else { addHazard(G, G.player.x, G.player.y, 1.4, 1.0, 0.3, { hp: E.attack, drain: E.drain }, 'incident'); fx.floater(G, e.x, e.y, 'Миграция БД', '#ffb03a'); e.cd = 2.2; }
      }
    },
    // Senior Frontend: fast, pixel-perfect bolts hit burnout; «Переверстал» blink
    frontend(G, e, dt, d, ang) {
      const E = e.elite, L = G.L, P = G.player;
      if (e.state === 'blink') {
        if ((e.t -= dt) <= 0) {
          for (let k = 0; k < 20; k++) {
            const a = rand() * Math.PI * 2, r = 3.5 + rand() * 2;
            const nx = P.x + Math.cos(a) * r, ny = P.y + Math.sin(a) * r;
            if (LV().roomOf(L, nx, ny)?.id === e.room && !LV().solidAt(L, nx, ny, 0.35)) { e.x = nx; e.y = ny; break; }
          }
          e.state = 'idle'; fx.sparks(G, e.x, e.y, 10, '#ff5ad1', 14, 3);
          for (let i = 0; i < 8; i++) enemyShot(G, e, (i / 8) * Math.PI * 2, 4.5, { burn: E.burnout * 0.5 }, '#ff5ad1', 1);
        }
        return;
      }
      const sees = strafeMove(G, e, dt, d, ang, 3.5, 7, e.speed * 1.35);
      if ((e.cd -= dt) <= 0 && sees) {
        e.cd = 0.9 + rand() * 0.5;
        if (rand() < 0.25) { e.state = 'blink'; e.t = 0.3; fx.sparks(G, e.x, e.y, 10, '#ff5ad1', 14, 3); fx.floater(G, e.x, e.y, 'Переверстал!', '#ff5ad1'); sfx('dash'); }
        else { for (let i = -1; i <= 1; i++) enemyShot(G, e, ang + i * 0.12, 7.5, { hp: E.attack * 0.3, burn: E.burnout * 0.45 }, '#ff5ad1', 1); sfx('enemyShot'); }
      }
    },
    // SRE-инженер: alert zones, ring of pings, calls bugs
    sre(G, e, dt, d, ang) {
      const E = e.elite;
      const sees = strafeMove(G, e, dt, d, ang, 3, 6);
      if ((e.cd -= dt) <= 0) {
        const r = rand();
        if (r < 0.4 && sees) { for (let i = 0; i < 12; i++) enemyShot(G, e, (i / 12) * Math.PI * 2 + e.anim, 4.6, { hp: E.attack * 0.6, drain: 1 }, '#3dffb0', 1.1); sfx('enemyShot'); fx.floater(G, e.x, e.y, 'Пинг', '#3dffb0'); e.cd = 1.8; }
        else if (r < 0.8) {
          for (let i = 0; i < 3; i++) addHazard(G, G.player.x + (rand() - 0.5) * (i ? 4 : 0), G.player.y + (rand() - 0.5) * (i ? 4 : 0), 1.1, 1.1, 1.8, { hp: E.attack, burn: E.burnout * 0.5 }, 'incident');
          fx.floater(G, e.x, e.y, 'ALERT', '#ffcf5a'); sfx('alarm'); e.cd = 2.6;
        } else {
          if (G.enemies.filter(x => x.room === e.room).length < 7) for (let i = 0; i < 3; i++) makeEnemy(G, 'bug', e.x + (rand() - 0.5) * 2, e.y + (rand() - 0.5) * 2, { room: e.room });
          fx.floater(G, e.x, e.y, 'Инцидент P2', '#3dffb0'); e.cd = 2.4;
        }
      }
    },
    // QA Lead: marks the player (+50% taken), laser-sighted snipes
    qa(G, e, dt, d, ang) {
      const E = e.elite, P = G.player;
      if (e.state === 'aim') {
        e.aimA = Math.atan2(P.y - e.y, P.x - e.x);
        if ((e.t -= dt) <= 0) { e.state = 'idle'; enemyShot(G, e, e.aimA, 13, { hp: E.attack * 1.2, burn: E.burnout * 0.4 }, '#ff2d55', 1.4); sfx('crit'); e.cd = 1.3; }
        return;
      }
      const sees = strafeMove(G, e, dt, d, ang, 4, 7.5);
      if ((e.cd -= dt) <= 0 && sees) {
        if (P.marked <= 0 && rand() < 0.4) { P.marked = 4; fx.floater(G, P.x, P.y, 'НАЙДЕН БАГ: ТЫ', '#ff2d55', true); sfx('telegraph'); e.cd = 1.2; }
        else { e.state = 'aim'; e.t = 0.75; }
      }
    },
  };

  // ================================================================ hazards
  function addHazard(G, x, y, r, warn, active, dmg, kind) {
    if (!LV().roomOf(G.L, x, y)) return;
    G.hazards.push({ x, y, r, warn, warnMax: warn, active, activeMax: active, dmg, kind, tick: 0 });
  }
  function updateHazards(G, dt) {
    const P = G.player;
    for (const h of G.hazards) {
      if (h.warn > 0) {
        if ((h.warn -= dt) <= 0) {
          sfx(h.kind === 'incident' ? 'boom' : 'hit');
          const col = h.kind === 'ritual' ? '#ff2a4f' : h.kind === 'scan' ? '#3a8bff' : '#ff8a3a';
          fx.sparks(G, h.x, h.y, 2, col, 14, 5); fx.ring(G, h.x, h.y, h.r, col, 0.3, 2);
          if (h.kind !== 'ritual') fx.shake(G, 2);
        }
        continue;
      }
      h.active -= dt; h.tick -= dt;
      if (h.kind === 'incident' && rand() < 0.7) G.particles.push({ kind: 'spark', x: h.x + (rand() - 0.5) * h.r * 1.4, y: h.y + (rand() - 0.5) * h.r * 1.4, z: 0, vx: 0, vy: 0, vz: 40 + rand() * 50, life: 0.5, max: 0.5, color: rand() < 0.5 ? '#ffb03a' : '#ff3a2a', size: 1, nograv: true });
      if (dist(P.x, P.y, h.x, h.y) < h.r + P.r * 0.5 && h.tick <= 0) { if (hurtPlayer(G, h.dmg, h.x, h.y)) h.tick = 0.6; }
    }
    G.hazards = G.hazards.filter(h => h.warn > 0 || h.active > 0);
  }

  // ================================================================ bullets
  function updateBullets(G, dt) {
    const L = G.L, P = G.player;
    for (const b of G.bullets) {
      const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 0.2);
      for (let s = 0; s < steps && !b.dead; s++) {
        const nx = b.x + b.vx * dt / steps, ny = b.y + b.vy * dt / steps;
        if (!b.ghost && LV().bulletBlocked(L, nx, ny)) {
          b.dead = true;
          fx.sparks(G, b.x, b.y, b.z, b.color, 5, 3, 0.25);
          fx.flashLight(G, b.x, b.y, EJ.rgba(b.color, 0.6), 1.2, 0.08);
          break;
        }
        b.x = nx; b.y = ny;
        if (b.team === 'p') {
          for (const e of G.enemies) {
            if (e.dead || e.spawnT > 0 || b.hit.has(e.id) || e.untargetable) continue;
            if (dist(b.x, b.y, e.x, e.y) < e.r + b.r + (e.def.r > 0.5 ? 0.3 : 0)) {
              b.hit.add(e.id);
              damageEnemy(G, e, b.dmg, b.vx * 0.12, b.vy * 0.12, b.crit);
              fx.sparks(G, b.x, b.y, b.z, b.crit ? '#fff27a' : '#bff6ff', 6, 4, 0.25);
              if (b.chain) chainZap(G, e, b.chain, b.dmg * 0.5);
              if (!b.pierce) { b.dead = true; break; }
            }
          }
        } else if (P.alive && dist(b.x, b.y, P.x, P.y) < P.r + b.r) {
          if (P.parryT > 0 && !b.noParry) { reflect(G, b); break; }
          if (P.dashT > 0 || P.iframes > 0) continue;
          if (hurtPlayer(G, b.dmg, b.x - b.vx, b.y - b.vy) && b.slow) { P.slow = 2; fx.floater(G, P.x, P.y, 'созвон…', '#8f63ff'); }
          b.dead = true;
        }
      }
      if ((b.life -= dt) <= 0) b.dead = true;
    }
    G.bullets = G.bullets.filter(b => !b.dead);
  }

  // Обжимка RJ45: lightning hops along a patch cable to nearby enemies
  function chainZap(G, from, n, dmg) {
    let cur = from;
    const hit = new Set([from.id]);
    for (let k = 0; k < n; k++) {
      let best = null, bd = 3.2;
      for (const e of G.enemies) { if (e.dead || hit.has(e.id) || e.spawnT > 0 || e.untargetable) continue; const d = dist(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      hit.add(best.id);
      G.zaps.push({ ax: cur.x, ay: cur.y, az: (cur.z || 0) + 12, bx: best.x, by: best.y, bz: (best.z || 0) + 12, t: 0.14 });
      damageEnemy(G, best, dmg, 0, 0, false);
      cur = best;
    }
    if (hit.size > 1) EJ.audio.play('hack', 0.05);
  }

  // ================================================================ allies (laptop assistant, hijacked drones)
  function hackDrone(G, e) {
    e.dead = true;
    G.enemies = G.enemies.filter(x => x !== e);
    G.allies.push({ kind: 'drone', x: e.x, y: e.y, z: 14, t: 15, cd: 0.5, anim: 0 });
    fx.floater(G, e.x, e.y, 'ДРОН ПЕРЕХВАЧЕН', '#4fe9ff', true); fx.ring(G, e.x, e.y, 1, '#4fe9ff', 0.3);
    sfx('bot');
  }
  function updateAllies(G, dt) {
    const P = G.player;
    if ('laptop' in P.inv && !G.allies.some(a => a.kind === 'laptop')) G.allies.push({ kind: 'laptop', x: P.x, y: P.y, z: 18, t: Infinity, cd: 0, anim: 0 });
    G.allies.forEach((a, i) => {
      a.anim += dt; a.t -= dt;
      const ang = a.anim * 1.4 + i * 2.1, r = a.kind === 'laptop' ? 0.9 : 1.6;
      const tx = P.x + Math.cos(ang) * r, ty = P.y + Math.sin(ang) * r;
      a.x += (tx - a.x) * Math.min(1, dt * 4); a.y += (ty - a.y) * Math.min(1, dt * 4);
      a.z = (a.kind === 'laptop' ? 18 : 14) + Math.sin(a.anim * 3) * 2;
      if (a.kind === 'drone' && (a.cd -= dt) <= 0) {
        const t = nearestEnemy(G, a.x, a.y, 8, true);
        if (t) { a.cd = 0.55; const [nx, ny] = norm(t.x - a.x, t.y - a.y); G.bullets.push({ team: 'p', x: a.x, y: a.y, z: a.z, vx: nx * 12, vy: ny * 12, dmg: 2.5 + P.skill * 0.4, life: 0.9, r: 0.15, color: '#4fe9ff', hit: new Set(), small: true }); EJ.audio.play('shoot', 0.1); }
      }
    });
    G.allies = G.allies.filter(a => a.t > 0 && (a.kind !== 'laptop' || 'laptop' in P.inv));
    for (const z of G.zaps) z.t -= dt;
    G.zaps = G.zaps.filter(z => z.t > 0);
    if (G.spinFx && (G.spinFx.t -= dt) <= 0) G.spinFx = null;
    if (G.rejectT > 0) G.rejectT -= dt;
  }

  // ================================================================ drops
  function updateDrops(G, dt) {
    const P = G.player;
    for (const d of G.drops) {
      d.t += dt; d.life -= dt;
      if (d.z > 0 || d.vz > 0) {
        d.vz -= 220 * dt; d.z += d.vz * dt;
        if (d.z <= 0) { d.z = 0; d.vz = Math.abs(d.vz) > 25 ? -d.vz * 0.4 : 0; d.vx *= 0.5; d.vy *= 0.5; }
        moveActor(G.L, d, d.vx * dt, d.vy * dt, true);
      }
      const dd = dist(d.x, d.y, P.x, P.y);
      if (P.alive && d.t > 0.35 && dd < 2.2) {
        const [nx, ny] = norm(P.x - d.x, P.y - d.y), s = 6 + (2.2 - dd) * 5;
        d.x += nx * s * dt; d.y += ny * s * dt;
      }
      if (P.alive && d.t > 0.35 && dd < 0.45) {
        d.dead = true;
        if (d.kind === 'coin') { P.gold += d.value; G.stats.gold += d.value; sfx('coin'); fx.sparks(G, d.x, d.y, 6, '#ffd166', 4, 2, 0.2); }
        if (d.kind === 'pass') { P.passes++; sfx('pickup'); G.hud.banner('ПРОПУСК К БОССУ', `Пропусков: ${P.passes}`, '#9b5cff', 2); G.onPassPicked?.(); }
        if (d.kind === 'item') { const got = giveItem(G, d.id, d.grade); G.hud.loot(d.id, d.grade, got); sfx('pickup'); }
      }
      if (d.life <= 0) d.dead = true;
    }
    G.drops = G.drops.filter(d => !d.dead);
  }

  function updateParticles(G, dt) {
    for (const p of G.particles) {
      p.life -= dt;
      if (p.kind === 'ring') continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'smoke') { p.vz *= 0.97; p.size += dt * 3; continue; }
      if (!p.nograv) p.vz -= 260 * dt;
      if (p.z < 0) {
        p.z = 0;
        if (p.bounce && Math.abs(p.vz) > 30) { p.vz = -p.vz * 0.35; p.vx *= 0.6; p.vy *= 0.6; }
        else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; }
      }
      p.vx *= 0.985; p.vy *= 0.985;
    }
    G.particles = G.particles.filter(p => p.life > 0);
    if (G.particles.length > 1400) G.particles.splice(0, G.particles.length - 1400);
    for (const l of G.lights) l.life -= dt;
    G.lights = G.lights.filter(l => l.life > 0);
    for (const f of G.floaters) { f.t += dt; f.z += dt * 22; f.x += f.vx * dt; }
    G.floaters = G.floaters.filter(f => f.t < f.life);
    if (G.scanFx && (G.scanFx.t -= dt) <= 0) G.scanFx = null;
  }

  EJ.ent = {
    makePlayer, updatePlayer, updateAllies, hackDrone, gainEnergy, scanCost, hurtPlayer, heal, addExp, addBurnout, giveItem, useItem, rank, burnoutFactor, vulnChance,
    makeEnemy, makeElite, updateEnemies, damageEnemy, killEnemy, nearestEnemy, enemyShot, addHazard, updateHazards, updateBullets,
    updateDrops, updateParticles, moveActor, dropCoin, dropItem, dropPass, chaseDir, strafeMove, scaleOf,
  };
})();
