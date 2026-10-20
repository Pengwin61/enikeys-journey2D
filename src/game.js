/* Enikey Journey — run structure: work days → tickets → camp; floors, bosses, buffer, meta (previous hero = next CEO). */
'use strict';
(() => {
  const { rand, dist, norm } = EJ;
  const $ = id => document.getElementById(id);
  const sfx = n => EJ.audio.play(n);
  const hud = EJ.hud;
  const ent = EJ.ent;

  // ================================================================ meta (localStorage)
  const META_KEY = 'enikey-journey.meta';
  const loadMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || { runs: 0, ceos: 0, ceo: null }; } catch (e) { return { runs: 0, ceos: 0, ceo: null }; } };
  const saveMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* private mode */ } };

  // ================================================================ state
  const G = (EJ.G = {
    state: 'title', floorIdx: 0, floor: EJ.FLOORS[0], day: 1, cycle: 0,
    L: null, player: null, enemies: [], bullets: [], particles: [], hazards: [], drops: [], lights: [], floaters: [], beams: [], waves: [], npcs: [],
    tickets: [], selTicket: null,
    cam: { x: 0, y: 0 }, shake: 0, hitstop: 0, timeScale: 1, hurtFlash: 0, burnFlash: 0, flow: null, flowT: 0, flowTile: -1,
    night: 0, nightTarget: 0, blackout: 0, prompt: null, nextId: 1, stats: null, cinematic: null, hud,
    debugGod: /[?&]god\b/.test(location.search),
    onLethal, onPassPicked, onEnemyKilled,
  });
  let ticketCounter = 60;

  // ================================================================ run / floor / day
  function newRun(skipIntro) {
    const meta = loadMeta();
    G.cycle = meta.ceos || 0;
    G.player = null; G.day = 1; ticketCounter = 60 + Math.floor(rand() * 5);
    G.stats = { kills: 0, tickets: 0, gold: 0, damageDealt: 0, damageTaken: 0, time: 0 };
    G.rootSaid = false; G.bossBeaten = false; G.pendingScene = null;
    G.routinePending = false; G.routineShown = false;
    meta.runs = (meta.runs || 0) + 1; saveMeta(meta);
    const m = location.search.match(/[?&]floor=(\d)/);
    const startIdx = m ? Math.min(2, +m[1] - 1) : 0;
    const go = () => startFloor(startIdx);
    if (skipIntro || startIdx > 0) go();
    else playScene('welcome', () => playScene('prologue', go));
  }

  function startFloor(i) {
    G.floorIdx = i; G.floor = EJ.FLOORS[i];
    const L = EJ.level.generate(i, (Math.random() * 1e9) | 0);
    EJ.level.bake(L);
    G.L = L;
    const start = L.rooms[0];
    const spawn = start.desk503 ? [start.desk503.x + 0.9, start.desk503.y + 1.5] : [start.cx, start.cy + 1];
    G.player = ent.makePlayer(spawn[0], spawn[1], G.player);
    if (i > 0 && !G.player.inv) G.player.inv = { black_hat: 0 };
    // debug: jumping straight to a later floor gives a fitting build
    if (!G.stats.ready && i > 0) { const P = G.player; P.level = 1 + i * 3; P.hp.max = 30 + (P.level - 1) * 10; P.hp.cur = P.hp.max; P.skill = 2 + i * 3; }
    G.stats.ready = true;
    Object.assign(G, { enemies: [], bullets: [], particles: [], hazards: [], drops: [], lights: [], floaters: [], beams: [], waves: [], npcs: [], tickets: [], allies: [], zaps: [], spinFx: null, slowT: 0, overtime: false, clock: 9 * 60, selTicket: null, cinematic: null, night: 0, nightTarget: 0, blackout: 0, flow: null, flowTile: -1, shake: 0, hitstop: 0, timeScale: 1 });
    G.floorStartDay = G.day;
    G.cam.x = EJ.isoX(G.player.x, G.player.y); G.cam.y = EJ.isoY(G.player.x, G.player.y);

    // seal the boss room (Team Lead) until enough passes; the lift waits for the floor boss
    for (const R of L.rooms) if (R.type === 'boss') { R.sealed = true; sealRoom(R, true); }
    if (L.elevator) L.elevator.locked = G.floor.key !== 'penthouse';
    spawnNpcs();
    placeSmartwatch();
    hud.floor(G);

    // elevator card
    $('fcEyebrow').textContent = i === 0 ? 'MONOLITH CORP' : 'ЛИФТ · ВВЕРХ';
    $('fcTitle').textContent = `${G.floor.label}\n${G.floor.name}`;
    $('fcSub').textContent = i === 0 ? 'Ряд 7. Место 503. Оборудование: на месте. Ожидает оператора.' : i === 1 ? 'Разработка. Планёрка, с которой никто не уходит.' : 'Тронный зал. Компания всегда должна иметь CEO.';
    document.documentElement.style.setProperty('--fc', EJ.rgba(G.floor.accent, 0.6));
    $('floorCard').querySelector('.fc-bar').innerHTML = '<i></i>';
    hud.screen('floorCard', true);
    G.state = 'intro';
    setTimeout(() => {
      hud.screen('floorCard', false);
      document.body.classList.remove('menu');
      hud.show(true);
      G.state = 'play';
      EJ.audio.setMode('explore');
      G.camSnap = true;
      if (G.floor.key === 'penthouse') startPenthouse(); else startDay(true);
    }, 2000);
  }

  const xy = ([x, y]) => ({ x, y });
  // the smart watch (unlocks the minimap) lies somewhere on the floor until the hero picks it up
  function placeSmartwatch() {
    const L = G.L, P = G.player;
    if ('smartwatch' in P.inv) return;
    const rooms = L.rooms.filter(R => ['office', 'print', 'meeting', 'server', 'kitchen'].includes(R.type));
    rooms.sort((a, b) => EJ.dist(b.cx, b.cy, L.rooms[0].cx, L.rooms[0].cy) - EJ.dist(a.cx, a.cy, L.rooms[0].cx, L.rooms[0].cy));
    const R = rooms[Math.floor(rand() * Math.min(3, rooms.length))];
    if (!R) return;
    for (let k = 0; k < 60; k++) {
      const x = R.x + 1 + rand() * (R.w - 2), y = R.y + 1 + rand() * (R.h - 2);
      if (EJ.level.solidAt(L, x, y, 0.3)) continue;
      ent.dropItem(G, x, y, 'smartwatch', 0);
      return;
    }
  }
  function spawnNpcs() {
    const L = G.L, start = L.rooms[0];
    // nearest free spot next to a desk/point: NPCs must never end up inside furniture or walls
    const free = (x, y) => {
      for (let r = 0; r <= 3; r += 0.25) for (let k = 0; k < Math.max(1, r * 8); k++) {
        const a = (k / Math.max(1, r * 8)) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (!EJ.level.solidAt(L, px, py, 0.4) && EJ.level.roomOf(L, px, py)) return [px, py];
      }
      return [x, y];
    };
    const at = (p, dy = 0.7) => free(p.x + p.w / 2, p.y + p.d + dy);
    if (G.floor.key === 'helpdesk') {
      const [gx, gy] = at(start.desk200);
      G.npcs.push({ kind: 'gregor', name: 'Грэгор · ряд 7, место 200', x: gx, y: gy, r: 0.3, lines: EJ.GREGOR, say: 0 });
      const lift = L.rooms.find(r => r.type === 'lift');
      G.npcs.push({ kind: 'erika', name: 'Эрика · отдел адаптации', ...xy(free(lift.cx, lift.cy + 1)), r: 0.3, lines: EJ.ERIKA, say: 0, visible: false });
    } else if (G.floor.key === 'dev') {
      const [px, py] = at(start.desk503, 1.3);
      const [qx, qy] = free(px + 1.2, py);
      G.npcs.push({ kind: 'paul', name: 'Пауль · Lead Backend', x: qx, y: qy, r: 0.3, lines: EJ.PAUL, say: 0 });
      const [gx, gy] = at(start.desk200);
      G.npcs.push({ kind: 'gregor', name: 'Грэгор', x: gx, y: gy, r: 0.3, lines: EJ.GREGOR, say: 0 });
      const lift = L.rooms.find(r => r.type === 'lift');
      G.npcs.push({ kind: 'erika', name: 'Эрика · отдел адаптации', ...xy(free(lift.cx, lift.cy + 1)), r: 0.3, lines: EJ.ERIKA, say: 0, visible: false });
    } else {
      G.npcs.push({ kind: 'erika', name: 'Эрика', ...xy(free(start.cx + 1.5, start.cy + 1.5)), r: 0.3, lines: EJ.ERIKA, say: 0 });
    }
  }

  // ---------------------------------------------------------------- tickets (storytelling/quest_generator.go)
  const nextTicketId = () => `MON-${ticketCounter++}`;
  function startDay(first) {
    const L = G.L, P = G.player;
    // Daily incidents are rebuilt below. No combat state or temporary door lock
    // from the previous day may survive; progression seals stay in place.
    for (const R of L.rooms) if (!R.sealed) {
      R.active = false; R.boss = false; R.waves = []; R.waveDelay = 0;
      lockRoom(R, false);
    }
    // Doors are shared by adjoining rooms: restore seals after all unlocks.
    for (const R of L.rooms) if (R.sealed) sealRoom(R, true);
    G.dayStats = { tickets: 0, gold: P.gold, exp: 0, kills: G.stats.kills };
    G.night = 0; G.nightTarget = 0;
    // the working day runs on a clock: 09:00 → 18:00, then overtime until midnight
    G.clock = 9 * 60; G.overtime = false; G.patrol = null; G.nightIncidentT = 25; G.campCourse = false; G.coffeeUsed = new Set();
    if (L.rooms[0].secdoor) L.rooms[0].secdoor.openT = 0;
    G.watchPatrolNear = false; G.watchAlertCooldown = 0;
    const shopIds = EJ.rand.shuffle(Object.keys(EJ.ITEMS).filter(id => id !== 'black_hat' &&
      (!(id in P.inv) || (id === 'smartwatch' && P.inv[id] < 3)))).slice(0, 2);
    G.shop = shopIds.map(id => {
      const grade = id === 'smartwatch' && id in P.inv ? Math.max(EJ.rollGrade(P.luck), P.inv[id] + 1) : EJ.rollGrade(P.luck);
      return { id, grade, price: [25, 45, 75, 120][grade] + G.floorIdx * 10, sold: false };
    });
    // incidents: two rooms get infested today
    for (const R of L.rooms) { if (['office', 'print', 'meeting', 'server', 'kitchen'].includes(R.type)) { R.incident = false; R.cleared = true; R.elite = null; } }
    const rooms = L.rooms.filter(R => ['office', 'print', 'meeting', 'server', 'kitchen'].includes(R.type));
    EJ.rand.shuffle(rooms);
    for (const R of rooms.slice(0, Math.min(rooms.length, 1 + Math.min(2, Math.floor(G.day / 2))))) { R.incident = true; R.cleared = false; }

    // morning pool: 3 tickets; more arrive during the day; elite from day 2; boss when passes allow (quest_generator.go)
    G.tickets = [];
    for (let i = 0; i < 3; i++) addNormalTicket();
    G.nextTicketAt = 9 * 60 + 70 + rand() * 30;
    const floorDay = G.day - G.floorStartDay + 1;
    const eliteChance = Math.min(100, (floorDay >= 2 ? 100 : 0));
    if (rand() * 100 < eliteChance) addEliteTicket(0);
    checkBossTicket(true);
    G.selTicket = G.tickets.find(t => t.state !== 'done') || null;
    hud.objective(G.floor.key === 'helpdesk' ? 'Пережить испытательный срок' : 'Добраться до CEO');
    hud.banner(`ДЕНЬ ${G.day}`, first && G.day === 1 ? 'Трекер: 3 новые таски. Найди нужные устройства на этаже.' : `${G.floor.name} · новые таски в трекере`, G.floor.accent, 2.4);
    if (first && G.day === 1 && G.floorIdx === 0) hud.toast('WASD — движение · ЛКМ — атака · E — работать над таской · Tab — сменить таску', 6);
    EJ.audio.setIntensity(0.15);
  }

  // one ticket from the canon pool, bound to a free device (not one already in the tracker)
  function addNormalTicket() {
    const L = G.L;
    const busy = new Set(G.tickets.filter(t => t.state !== 'done').map(t => t.target));
    const openNames = new Set(G.tickets.filter(t => t.state !== 'done').map(t => t.title));
    for (const q of EJ.rand.shuffle(EJ.QUESTS.slice())) {
      if (openNames.has(q.name)) continue;
      const opts = L.props.filter(p => p.device === q.device && !p.seat && !busy.has(p));
      const far = opts.filter(p => L.rooms[p.room].type !== 'start');
      const pool = far.length ? far : opts;
      if (!pool.length) continue;
      const t = { id: nextTicketId(), kind: 'normal', quest: q, title: q.name, text: q.text, target: pool[Math.floor(rand() * pool.length)], state: 'open', progress: 0 };
      // keep the tracker short: forget all but the two most recent finished tickets
      const done = G.tickets.filter(x => x.state === 'done' && x.kind === 'normal');
      for (const d of done.slice(0, Math.max(0, done.length - 2))) G.tickets.splice(G.tickets.indexOf(d), 1);
      G.tickets.push(t);
      return t;
    }
    return null;
  }

  function addEliteTicket(slot) {
    const L = G.L;
    const rooms = L.rooms.filter(R => ['office', 'print', 'meeting', 'server', 'kitchen'].includes(R.type) && !R.incident);
    if (!rooms.length) return;
    const R = rooms[Math.floor(rand() * rooms.length)];
    const kind = EJ.rand.pick(Object.keys(EJ.ELITES));
    const E = EJ.ELITES[kind];
    R.elite = kind; R.incident = true; R.cleared = false;
    const t = { id: nextTicketId(), kind: 'elite', title: E.name, sub: `${E.title} · награда: пропуск`, eliteKind: kind, room: R, target: { x: R.cx - 0.3, y: R.cy - 0.3, w: 0.6, d: 0.6, h: 24 }, state: 'open', progress: 0 };
    G.tickets.splice(slot, 0, t);
    if (G.tickets.length > 4) G.tickets.pop();
  }

  function checkBossTicket(newDay = false) {
    const P = G.player, F = G.floor, L = G.L;
    if (G.tickets.some(t => t.kind === 'boss') || G.bossBeaten) return;
    const floorDay = G.day - G.floorStartDay + 1;
    if (P.passes < F.passes || floorDay < 2) return;
    if (F.boss === 'golem') {
      if (!G.routineShown) {
        // Qualifying during a shift must not interrupt it. Arm the scene only
        // when a new day starts; approaching Gregor will reveal the ticket.
        if (newDay) G.routinePending = true;
        return;
      }
      const desk = L.rooms[0].desk503;
      G.tickets.unshift({ id: 'MON-58', kind: 'boss', title: 'Дежурство. Пятница. Ночь.', sub: 'Комментарий: «Показал себя хорошо».', target: desk, state: 'open', progress: 0, boss: 'golem' });
    } else if (F.boss === 'hydra') {
      const R = L.rooms.find(r => r.type === 'boss');
      R.sealed = false; sealRoom(R, false);
      G.tickets.unshift({ id: 'MON-77', kind: 'boss', title: 'Планёрка у Team Lead', sub: 'Переговорная открыта. Подготовься.', target: { x: R.cx - 0.3, y: R.cy - 0.3, w: 0.6, d: 0.6, h: 30 }, room: R, state: 'open', progress: 0, boss: 'hydra' });
      hud.banner('ПЕРЕГОВОРНАЯ ОТКРЫТА', 'Team Lead-гидра ждёт на планёрке', '#ff3df0', 2.6);
      sfx('unlock');
    }
    G.selTicket = G.tickets[0];
  }
  function updateRoutineScene() {
    if (!G.routinePending || G.routineShown || G.state !== 'play' || G.floor.boss !== 'golem') return;
    const P = G.player;
    if (!P.alive || P.workT > 0 || G.day <= G.floorStartDay || P.passes < G.floor.passes || G.bossBeaten) return;
    if (G.enemies.length || G.pendingScene || G.L.rooms.some(r => r.active)) return;
    const gregor = G.npcs.find(n => n.kind === 'gregor' && n.visible !== false);
    if (!gregor || dist(P.x, P.y, gregor.x, gregor.y) > 1.7) return;
    G.routinePending = false; G.routineShown = true;
    checkBossTicket();
    playScene('routine', () => {});
  }
  function onPassPicked() {
    const t = G.tickets.find(x => x.kind === 'elite' && x.state === 'awaitPass');
    if (t) t.state = 'done';
    checkBossTicket();
  }

  function sealRoom(R, on) {
    for (const d of R.doors) { d.sealed = on; d.locked = on; d.t = on ? 0.25 : 0.25; G.L.doorLock[G.L.idx(d.x, d.y)] = on ? 1 : 0; }
  }

  // ---------------------------------------------------------------- penthouse (no work days — straight to the throne)
  function startPenthouse() {
    const L = G.L;
    for (const R of L.rooms) if (R.type === 'hall') { R.incident = true; R.cleared = false; }
    const T = L.rooms.find(r => r.type === 'throne');
    G.tickets = [{ id: 'MON-∞', kind: 'boss', title: 'Финальный босс: CEO', sub: 'Тронный зал пентхауса. Здесь заканчивается всё.', target: T.throne, state: 'open', progress: 0, boss: 'ceo', room: T }];
    G.selTicket = G.tickets[0];
    hud.objective('Найти и убить CEO');
    playScene('penthouse', () => {});
  }

  // ================================================================ rooms: incidents, elites
  const WAVES = {
    helpdesk: [['bug', 1, 3], ['imp', 2, 1], ['spirit', 2, 1]],
    dev: [['bug', 1, 3], ['imp', 2, 1], ['spirit', 2, 1], ['drone', 2.2, 1], ['cultist', 3, 1]],
    penthouse: [['guard', 3, 1], ['drone', 2, 1], ['cultist', 3, 1]],
  };
  function planWave(budget) {
    const pool = WAVES[G.floor.key], out = [];
    let guard = 0;
    while (budget > 0.9 && guard++ < 40) {
      const [type, cost, pack] = pool[Math.floor(rand() * pool.length)];
      if (cost * pack > budget + 0.5 && out.length) continue;
      for (let k = 0; k < pack; k++) out.push(type);
      budget -= cost * pack;
    }
    return out;
  }
  function spawnAround(R, list, cx, cy, minD = 3.2) {
    const L = G.L, P = G.player;
    for (const type of list) for (let tries = 0; tries < 50; tries++) {
      const x = cx != null ? cx + (rand() - 0.5) * 3 : R.x + 0.6 + rand() * (R.w - 1.2), y = cy != null ? cy + (rand() - 0.5) * 3 : R.y + 0.6 + rand() * (R.h - 1.2);
      if (!EJ.level.roomOf(L, x, y) || dist(x, y, P.x, P.y) < minD || EJ.level.solidAt(L, x, y, 0.35)) continue;
      ent.makeEnemy(G, type, x, y, { room: R.id });
      break;
    }
  }
  function lockRoom(R, on) {
    EJ.level.setRoomLock(G.L, R, on);
    for (const d of R.doors) d.t = on ? 0 : 0.25;
  }
  function startCombat(R) {
    R.active = true;
    lockRoom(R, true);
    sfx('lock'); hud.alert(R.elite ? 'ЭЛИТНЫЙ СОТРУДНИК' : G.floor.key === 'penthouse' ? 'ОХРАНА' : 'ИНЦИДЕНТ · ДВЕРИ ЗАБЛОКИРОВАНЫ');
    EJ.audio.setIntensity(1);
    const budget = 4 + G.floorIdx * 2.5 + (G.day - 1) * 1.2 + G.cycle * 3;
    R.waves = [];
    if (R.elite) {
      const P = G.player;
      let ex = R.cx, ey = R.cy;
      if (dist(ex, ey, P.x, P.y) < 3) { ex = R.cx + (R.cx - P.x); ey = R.cy + (R.cy - P.y); }
      if (EJ.level.solidAt(G.L, ex, ey, 0.35)) { ex = R.cx; ey = R.cy; }
      ent.makeElite(G, R.elite, ex, ey, R.id);
      spawnAround(R, planWave(Math.max(2, budget * 0.4)));
    } else {
      R.waves.push(planWave(budget * 0.8));
      spawnAround(R, planWave(budget));
    }
    R.waveDelay = 0;
  }
  function roomCleared(R) {
    R.active = false; R.cleared = true;
    lockRoom(R, false);
    sfx('unlock');
    if (!R.elite) {
      hud.banner('ИНЦИДЕНТ ЗАКРЫТ', 'Отдел зачищен · двери открыты', '#4dff9a', 1.6);
      for (let i = 0; i < 2 + G.floorIdx; i++) ent.dropCoin(G, R.cx + (rand() - 0.5), R.cy + (rand() - 0.5), 1 + G.floorIdx);
      ent.addExp(G, 2 + G.floorIdx);
    }
    EJ.audio.setIntensity(0.15);
  }
  function onEnemyKilled(e) {
    if (e.type === 'elite') {
      const R = G.L.rooms[e.room];
      ent.dropPass(G, e.x, e.y);
      for (let i = 0; i < 6; i++) ent.dropCoin(G, e.x, e.y, 2 + G.floorIdx);
      // one random canon item with its normal drop odds boosted for an elite
      const ids = Object.keys(EJ.ITEMS).filter(id => id !== 'black_hat' && id !== 'smartwatch');
      const id = ids[Math.floor(rand() * ids.length)];
      if (rand() < 0.6) ent.dropItem(G, e.x, e.y, id, EJ.rollGrade(G.player.luck, 10));
      hud.banner('ЭЛИТА ПОВЕРЖЕНА', `${e.elite.name} · подбери пропуск`, '#b26bff', 2);
      const t = G.tickets.find(x => x.kind === 'elite' && x.room === R && x.state !== 'done');
      if (t) t.state = 'awaitPass';
      G.stats.tickets++;
    }
    if (e.type === 'golem') bossDown('golem', e);
    if (e.type === 'hydra') bossDown('hydra', e);
    if (e.type === 'ceo') bossDown('ceo', e);
  }

  function updateRooms(dt) {
    const L = G.L, P = G.player;
    const R = EJ.level.roomOf(L, P.x, P.y);
    if (R && !R.visited) R.visited = true;
    const deep = R && P.x > R.x + 0.9 && P.x < R.x + R.w - 0.9 && P.y > R.y + 0.9 && P.y < R.y + R.h - 0.9;
    if (R && deep && !R.active) {
      if (R.incident && !R.cleared) startCombat(R);
      if (R.type === 'boss' && !R.sealed && !G.bossBeaten && !G.enemies.some(e => e.type === 'hydra')) startHydra(R);
      if (R.type === 'throne' && !G.bossBeaten && !G.enemies.some(e => e.type === 'ceo')) startCeo(R);
    }
    for (const d of L.doors) { if (d.locked) d.t = Math.min(0.25, d.t + dt); else if (d.t > 0) d.t = Math.max(0, d.t - dt); }
    for (const room of L.rooms) {
      if (!room.active || room.boss) continue;
      const alive = G.enemies.filter(e => e.room === room.id).length;
      if (alive === 0) {
        if (room.waves && room.waves.length) { if ((room.waveDelay += dt) > 0.7) { room.waveDelay = 0; spawnAround(room, room.waves.shift()); hud.alert('НОВАЯ ВОЛНА'); } }
        else roomCleared(room);
      }
    }
  }

  // ================================================================ bosses
  function bossIntro(e, name, title, quote) {
    G.cinematic = { t: 0, dur: 3, x: e.x, y: e.y };
    $('bcName').textContent = name; $('bcTitle').textContent = title; $('bcQuote').textContent = quote;
    hud.screen('bossCard', true);
    $('bossCard').style.animation = 'none'; void $('bossCard').offsetWidth; $('bossCard').style.animation = '';
    EJ.audio.setMode('boss'); EJ.audio.setIntensity(1);
    sfx('alarm');
  }
  function startDuty() {
    // MON-58: night falls over ряд 7, the golem walks out of the dark
    playScene('duty', () => {
      const L = G.L, R = L.rooms[0], P = G.player;
      G.nightTarget = 1;
      R.active = true; R.boss = true; lockRoom(R, true);
      const corners = [[R.x + 1.5, R.y + 1.5], [R.x + R.w - 1.5, R.y + 1.5], [R.x + 1.5, R.y + R.h - 1.5], [R.x + R.w - 1.5, R.y + R.h - 1.5]];
      corners.sort((a, b) => dist(b[0], b[1], P.x, P.y) - dist(a[0], a[1], P.x, P.y));
      let [x, y] = corners[0];
      if (EJ.level.solidAt(L, x, y, 0.6)) [x, y] = [R.cx, R.cy];
      const e = ent.makeEnemy(G, 'golem', x, y, { room: R.id, hp: 420 + G.cycle * 150, noScale: true, extra: { phase: 1, idleT: 1.5, inv: 0, bossName: 'SRE-ДЕЖУРНЫЙ' } });
      e.spawnT = 1.4;
      bossIntro(e, 'SRE-ДЕЖУРНЫЙ', 'ИНЦИДЕНТ NIGHT-451', '«ВЫ. НЕ. ГОТОВЫ.»');
    });
  }
  function startHydra(R) {
    R.active = true; R.boss = true; lockRoom(R, true);
    playScene('hydra', () => {
      const e = ent.makeEnemy(G, 'hydra', R.cx, R.y + 2.6, { room: R.id, hp: 320 + G.cycle * 120, noScale: true, extra: { bossName: 'TEAM LEAD-ГИДРА', anchored: true } });
      e.spawnT = 1.2;
      bossIntro(e, 'TEAM LEAD-ГИДРА', 'КАЖДАЯ ГОЛОВА — ОТДЕЛЬНЫЙ ПРОЕКТ', '«Срочный баг в проде!»');
    });
  }
  function startCeo(R) {
    R.active = true; R.boss = true; lockRoom(R, true);
    const prev = loadMeta().ceo;
    playScene(prev ? 'ceoPrev' : 'ceo', () => {
      const hp = prev ? 760 + prev.level * 45 : 900;
      const e = ent.makeEnemy(G, 'ceo', R.cx, R.y + 2.2, { room: R.id, hp: hp + G.cycle * 200, noScale: true, extra: { phase: 1, idleT: 1.5, inv: 0, prevHero: !!prev, bossName: prev ? `CEO · ЭНИКЕЙ ИЗ ЗАБЕГА #${prev.run}` : 'CEO', dmgMul: prev ? 1 + prev.skill * 0.04 : 1.2 } });
      e.spawnT = 1.2;
      bossIntro(e, prev ? 'CEO' : 'CEO', prev ? `БЫВШИЙ ЭНИКЕЙ · LV ${prev.level}` : 'ТРОННЫЙ ЗАЛ ПЕНТХАУСА', prev ? '«Я тоже думал, что трон можно разрушить.»' : '«Отказ не предусмотрен контрактом.»');
    });
  }
  function bossDown(kind, e) {
    const P = G.player;
    G.timeScale = 0.3;
    G.bullets = G.bullets.filter(b => b.team === 'p'); G.hazards = []; G.beams = []; G.waves = [];
    for (const x of G.enemies) if (!x.dead && x !== e) ent.killEnemy(G, x);
    P.bossesDefeated++; P.passes = 0; // canon: «Сжигаются накопленные пропуски»
    G.bossBeaten = true;
    for (let i = 0; i < 16; i++) ent.dropCoin(G, e.x + (rand() - 0.5) * 2, e.y + (rand() - 0.5) * 2, 3);
    const ids = Object.keys(EJ.ITEMS).filter(id => id !== 'black_hat' && id !== 'smartwatch' && EJ.ITEMS[id].type === 'P');
    ent.dropItem(G, e.x, e.y, ids[Math.floor(rand() * ids.length)], EJ.rollGrade(P.luck, 25));
    const t = G.tickets.find(x => x.kind === 'boss'); if (t) t.state = 'done';
    G.stats.tickets++;
    EJ.audio.setMode('explore'); EJ.audio.setIntensity(0.1);
    setTimeout(() => { G.timeScale = 1; }, 1200);
    const R = G.L.rooms[e.room];
    const after = () => {
      G.L.elevator.locked = false;
      const erika = G.npcs.find(n => n.kind === 'erika');
      if (erika) erika.visible = true;
      G.tickets.push({ id: nextTicketId(), kind: 'boss', title: 'Лифт ждёт', sub: 'Эрика у лифта. Следующий этаж.', target: G.L.elevator, state: 'open', progress: 0, lift: true });
      G.selTicket = G.tickets[G.tickets.length - 1];
      hud.banner('ЛИФТ РАЗБЛОКИРОВАН', 'Эрика ждёт у лифта', '#4dff9a', 2.6);
    };
    setTimeout(() => {
      if (G.state !== 'play') return;
      R.active = false; R.boss = false; R.cleared = true; lockRoom(R, false);
      if (kind === 'hydra') { G.nightTarget = 0; hud.banner('ПЛАНЁРКА ОКОНЧЕНА', 'Все проекты закрыты. Навсегда.', '#4dff9a', 2.4); after(); return; }
      // the story scene waits until the loot is picked up (fallback: 40 s)
      hud.banner(kind === 'golem' ? 'ДЕЖУРСТВО ЗАКРЫТО' : 'ТРОН СВОБОДЕН', 'Собери лут — история продолжится', '#4dff9a', 3);
      G.pendingScene = kind === 'golem'
        ? { id: 'attested', room: R, t: 40, grace: 1, cb: () => { G.nightTarget = 0; after(); } }
        : { id: 'ending', room: R, t: 40, grace: 1, cb: finishRun };
    }, 2000);
  }

  // Waits for the room's loot to be collected, then plays the pending story scene.
  function updatePendingScene(dt) {
    const ps = G.pendingScene;
    if (!ps || G.state !== 'play') return;
    ps.t -= dt;
    const left = G.drops.filter(d => EJ.level.roomOf(G.L, d.x, d.y) === ps.room).length;
    if (left === 0) ps.grace -= dt;
    if (ps.grace <= 0 || ps.t <= 0) { G.pendingScene = null; playScene(ps.id, ps.cb); }
  }

  // ================================================================ interaction (E)
  function frontOf(p) {
    if (p.kind === 'secdoor' && p.wallSide === 'w') return [p.x + p.w + 0.45, p.y + p.d / 2];
    return [p.x + p.w / 2, p.y + p.d + 0.45];
  }
  function updateInteract(dt) {
    const L = G.L, P = G.player, inp = EJ.input;
    G.prompt = null;
    if (!P.alive) return;
    // working on a ticket
    if (P.workT > 0) {
      const t = P.workTicket;
      P.workT -= dt;
      t.progress = Math.min(1, t.progress + dt / t.dur);
      P.workP = t.progress;
      if (rand() < dt * 10) sfx('hack');
      if (t.bugs && !t.bugsSpawned && t.progress > 0.35) {
        t.bugsSpawned = true; P.workT = 0;
        const R = L.rooms[t.target.room];
        const [fx, fy] = frontOf(t.target);
        const n = 2 + Math.min(4, Math.floor(G.day / 2)) + G.floorIdx;
        const kinds = t.quest.bugs ? ['bug', 'bug', 'bug', 'imp'] : G.floor.enemies.slice(0, 3);
        spawnAround(R, Array.from({ length: n }, () => kinds[Math.floor(rand() * kinds.length)]), fx, fy, 1.5);
        hud.alert(t.quest.bugs ? 'ВИРУС: БАГИ ВЫЛЕЗЛИ ИЗ СИСТЕМНИКА' : 'ИЗ ЛЕГАСИ ПОЛЕЗЛИ ДЕМОНЫ');
        EJ.audio.setIntensity(1);
      }
      if (t.progress >= 1) completeTicket(t);
      if (inp.hit('Space') || P.hurtT > 0) P.workT = 0;
      return;
    }
    const near = [];
    for (const t of G.tickets) {
      if (t.state !== 'open' || !t.target) continue;
      if (t.kind === 'normal') {
        const [fx, fy] = frontOf(t.target), q = t.quest;
        near.push([dist(P.x, P.y, fx, fy), { text: `${t.id} · ${t.title} — ⚡${q.energy}${t.progress > 0 ? ` (${Math.round(t.progress * 100)}%)` : ''}`, x: fx, y: fy - 0.3, z: t.target.h + 30, bad: P.energy.cur < q.energy && t.progress === 0, act: () => beginWork(t) }]);
      }
      if (t.boss === 'golem') {
        const [fx, fy] = frontOf(t.target);
        near.push([dist(P.x, P.y, fx, fy) - 0.2, { text: 'MON-58 · Заступить на ночное дежурство', x: fx, y: fy, z: 50, act: () => { t.state = 'active'; startDuty(); } }]);
      }
      if (t.lift) {
        const [fx, fy] = frontOf(t.target);
        near.push([dist(P.x, P.y, fx, fy), { text: 'Вызвать лифт — следующий этаж', x: fx, y: fy - 0.6, z: 62, act: nextFloor }]);
      }
    }
    // ряд 7 is the camp: seat 503 ends the day, HR grants vacation, EDU sells courses, IT-шкаф sells loot
    const R0 = L.rooms[0];
    const calm = !G.enemies.some(e => !e.patrol) && !G.pendingScene && !L.rooms.some(r => r.active);
    if (R0.desk503 && G.floor.key !== 'penthouse' && calm) {
      const [fx, fy] = frontOf(R0.desk503);
      near.push([dist(P.x, P.y, fx, fy) + 0.25, { text: 'Место 503 · закончить день и отдохнуть (энергия, −15 выгорания)', x: fx, y: fy - 0.3, z: 36, act: () => endDay(false) }]);
    }
    if (R0.hr && calm) {
      const [fx, fy] = frontOf(R0.hr);
      near.push([dist(P.x, P.y, fx, fy), { text: `HR · уйти в отпуск — 50 ◆ (всё восстановить, −50 выгорания)`, x: fx, y: fy - 0.3, z: 34, bad: P.gold < 50, act: () => { if (P.gold < 50) { sfx('deny'); hud.toast('🚫 Недостаточно золота для отпуска', 2); } else endDay(true); } }]);
    }
    if (R0.learn) {
      const [fx, fy] = frontOf(R0.learn);
      near.push([dist(P.x, P.y, fx, fy), { text: G.campCourse ? 'Онлайн-курсы · уже пройдены сегодня' : 'Онлайн-курсы · +1 к навыку — 40 ◆', x: fx, y: fy - 0.3, z: 34, bad: G.campCourse || P.gold < 40, act: () => {
        if (G.campCourse || P.gold < 40) { sfx('deny'); return; }
        P.gold -= 40; P.skill++; G.campCourse = true; sfx('pickup'); hud.banner('СЕРТИФИКАТ ПОЛУЧЕН', `Навык: ${P.skill}`, '#4dff9a', 1.8);
      } }]);
    }
    if (R0.shelf && G.shop) G.shop.forEach((it, i) => {
      if (it.sold) return;
      const sx0 = R0.shelf.x + 0.4 + i * 0.8, sy0 = R0.shelf.y + R0.shelf.d + 0.45;
      const I = EJ.ITEMS[it.id], g = EJ.GRADES[it.grade];
      near.push([dist(P.x, P.y, sx0, sy0), { text: `IT-шкаф\n${I.name} — ${it.price} ◆`, color: g.color, x: sx0, y: sy0 - 0.4, z: 40, bad: P.gold < it.price, act: () => {
        if (P.gold < it.price) { sfx('deny'); hud.toast('Не хватает золота.', 1.6); return; }
        P.gold -= it.price; it.sold = true; const got = ent.giveItem(G, it.id, it.grade); hud.loot(it.id, it.grade, got); sfx('pickup');
      } }]);
    });
    for (const v of L.props) if (v.kind === 'vending') {
      const [fx, fy] = frontOf(v), used = G.coffeeUsed && G.coffeeUsed.has(v);
      near.push([dist(P.x, P.y, fx, fy), { text: used ? 'Кофемашина · на сегодня всё' : 'Кофемашина · +8 ⚡', x: fx, y: fy - 0.3, z: 50, bad: used, act: () => {
        if (used) { sfx('deny'); return; }
        G.coffeeUsed.add(v); ent.gainEnergy(P, 8); EJ.fx.floater(G, P.x, P.y, '+8 ⚡', '#5aa8ff'); sfx('heal');
      } }]);
    }
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.type === 'spirit') near.push([dist(P.x, P.y, e.x, e.y) - 0.1, { text: 'Обработать дух очереди (+2 ⚡)', x: e.x, y: e.y, z: 30, act: () => {
        EJ.fx.floater(G, e.x, e.y, 'Обработан', '#9fd8ff', true); ent.killEnemy(G, e); ent.gainEnergy(P, 2);
      } }]);
      if (e.type === 'drone' && e.hp < e.maxHp * 0.5) near.push([dist(P.x, P.y, e.x, e.y) - 0.2, { text: 'Перехватить дрон', x: e.x, y: e.y, z: 34, act: () => ent.hackDrone(G, e) }]);
    }
    if (L.elevator && L.elevator.locked && !G.tickets.some(t => t.lift)) {
      const [fx, fy] = frontOf(L.elevator);
      near.push([dist(P.x, P.y, fx, fy) + 0.4, { text: G.floor.boss === 'golem' ? 'Лифт заблокирован · сначала аттестация' : 'Лифт заблокирован · сначала планёрка', x: fx, y: fy - 0.6, z: 62, bad: true, act: () => sfx('deny') }]);
    }
    for (const n of G.npcs) {
      if (n.visible === false) continue;
      near.push([dist(P.x, P.y, n.x, n.y) + 0.1, { text: `Поговорить · ${n.name.split(' ·')[0]}`, x: n.x, y: n.y, z: 36, act: () => talk(n) }]);
    }
    const sealed = L.rooms.find(r => r.sealed);
    if (sealed) for (const d of sealed.doors) near.push([dist(P.x, P.y, d.x + 0.5, d.y + 0.5) + 0.6, { text: `Переговорная запечатана · нужно пропусков: ${G.floor.passes} (есть ${P.passes})`, x: d.x + 0.5, y: d.y + 0.5, z: 34, bad: true }]);
    near.sort((a, b) => a[0] - b[0]);
    if (near.length && near[0][0] < 1.45) {
      G.prompt = near[0][1];
      if (inp.hit('KeyE') && G.prompt.act) G.prompt.act();
    }
  }

  function beginWork(t) {
    const P = G.player, q = t.quest;
    if (t.progress === 0) {
      // tickets cost working time (and burnout), not energy — energy belongs to combat
      t.dur = ticketDur(q);
      t.bugs = q.bugs || rand() < 0.18 + 0.05 * (G.day - 1) + 0.08 * G.floorIdx;
    }
    if (G.enemies.some(e => e.room === t.target.room && !e.dead)) { hud.toast('Сначала разберись с тем, что ползает рядом.', 2); sfx('deny'); return; }
    P.workT = 99; P.workTicket = t; P.workP = t.progress;
    G.selTicket = t;
  }

  function completeTicket(t) {
    const P = G.player, q0 = t.quest;
    // overtime: +50% gold and exp, double burnout (IDEAS.md «Овертайм»)
    const mul = G.patrol ? 2 : 1.5;
    const q = G.overtime ? { ...q0, gold: Math.round(q0.gold * mul), exp: Math.round(q0.exp * mul), burnout: q0.burnout * 2 } : q0;
    P.workT = 0; t.state = 'done'; t.progress = 1;
    G.stats.tickets++; G.dayStats.tickets++;
    if (q.gold) { P.gold += q.gold; G.stats.gold += q.gold; }
    ent.addExp(G, q.exp);
    if (q.burnout) ent.addBurnout(G, q.burnout);
    const [fx, fy] = frontOf(t.target);
    // the work took real office hours
    const mins = workMinutes(q0);
    if (G.floor.key !== 'penthouse') { G.clock += mins; EJ.fx.floater(G, P.x, P.y - 0.4, `⏱ +${fmtDur(mins)}`, '#9fd8ff'); }
    EJ.fx.floater(G, fx, fy, `${t.id} · Done`, '#4dff9a', true);
    EJ.fx.ring(G, fx, fy, 1.2, '#4dff9a', 0.4);
    // TryDropItem: drop chance + luck·0.005 (cap 95%), grade by luck
    for (const id of q.items) {
      const it = EJ.ITEMS[id];
      if (rand() < Math.min(0.95, it.drop + P.luck * 0.005)) ent.dropItem(G, fx, fy, id, EJ.rollGrade(P.luck));
    }
    sfx('unlock');
    hud.toast(`${t.id} «${t.title}» → Done. ${q.gold ? `+${q.gold} ◆ · ` : ''}+${q.exp} XP${q.burnout ? ` · +${q.burnout} выгорания` : ''}`, 3);
    G.selTicket = G.tickets.find(x => x.state === 'open') || null;
    if (!G.tickets.some(x => x.state === 'open')) hud.banner('ТРЕКЕР ПУСТ', G.clock < 18 * 60 ? 'Новые таски скоро прилетят — или закрой день на месте 503' : 'Закрой день на месте 503 — или ищи ночные инциденты', '#4dff9a', 2.6);
  }

  function talk(n) {
    const line = n.lines[(n.lineIdx = ((n.lineIdx ?? -1) + 1) % n.lines.length)];
    hud.speech(n, n.name, line, 4.5);
    n.say = 4.5;
    sfx('ui');
  }

  // ================================================================ lethal → buffer or game over
  function onLethal(kind) {
    const P = G.player;
    if (!P.alive || G.state !== 'play') return;
    P.alive = false; P.workT = 0;
    EJ.fx.debris(G, P.x, P.y, 10, ['#55693a', '#17161f', '#e9b48f', '#3fd8ff'], 22);
    G.timeScale = 0.3; EJ.audio.setIntensity(0);
    setTimeout(() => {
      G.timeScale = 1;
      if (!P.bufferUsed) showBuffer(kind);
      else gameOver(kind);
    }, 1300);
  }
  function showBuffer(kind) {
    G.state = 'buffer'; document.body.classList.add('menu');
    const P = G.player;
    const items = Object.keys(P.inv).filter(id => id !== 'black_hat');
    const opts = [];
    if (items.length) opts.push(['Случайный предмет', () => { const id = items[Math.floor(rand() * items.length)]; const it = EJ.ITEMS[id]; if (it.type === 'P' && it.stat) { const v = Math.max(1, Math.round(it.value * EJ.GRADES[P.inv[id]].mul)); if (it.stat === 'skill') P.skill -= v; if (it.stat === 'luck') P.luck -= v; if (it.stat === 'maxEnergy') { P.energy.max -= v; P.energy.cur = Math.min(P.energy.cur, P.energy.max); } } delete P.inv[id]; return `Браин оставил себе: ${it.name}.`; }]);
    if (P.gold > 0) opts.push([`Половина золота (${Math.ceil(P.gold / 2)} ◆)`, () => { P.gold = Math.floor(P.gold / 2); return 'Половина золота осела в буфере.'; }]);
    if (P.passes > 0) opts.push([`Все пропуска (${P.passes})`, () => { P.passes = 0; return 'Пропуска растворились в маршрутизации.'; }]);
    if (!opts.length) opts.push(['Прижать кепку к полу', () => 'Логотип вспыхнул, кепка задымилась. Сработало.']);
    $('bufferOpts').innerHTML = '';
    opts.forEach(([label, pay], i) => {
      const b = document.createElement('button');
      b.className = 'btn' + (i === 0 ? ' primary' : ''); b.innerHTML = `${label} <kbd>${i + 1}</kbd>`;
      b.onclick = () => selfRelease(pay(), kind);
      $('bufferOpts').appendChild(b);
    });
    G.bufferOpts = opts.map(([, pay]) => () => selfRelease(pay(), kind));
    hud.screen('buffer', true);
  }
  function selfRelease(msg, kind) {
    const P = G.player, L = G.L;
    P.bufferUsed = true;
    hud.screen('buffer', false); document.body.classList.remove('menu');
    // abort any fight: rooms unlock, bosses retreat, the ticket stays
    for (const R of L.rooms) if (R.active) { R.active = false; R.boss = false; lockRoom(R, false); if (R.incident) R.cleared = false; }
    for (const R of L.rooms) if (R.sealed) sealRoom(R, true);
    G.enemies = []; G.bullets = []; G.hazards = []; G.beams = []; G.waves = [];
    for (const t of G.tickets) if (t.boss && t.state === 'active') t.state = 'open';
    G.nightTarget = 0; G.night = 0; G.cinematic = null; hud.screen('bossCard', false);
    EJ.audio.setMode('explore'); EJ.audio.setIntensity(0.1);
    const desk = L.rooms[0].desk503 || L.rooms[0];
    P.x = desk.x + (desk.w || 0) / 2; P.y = desk.y + (desk.d || 0) + 1.2;
    P.alive = true; G.camSnap = true; P.hp.cur = Math.ceil(P.hp.max / 2); P.burnout.cur = Math.min(P.burnout.cur, 60); P.iframes = 2;
    G.state = 'play';
    hud.banner('САМОВЫПУСК ИЗ БУФЕРА', `${msg} «Тридцать лет никто не догадывался». — Браин`, '#9b5cff', 4);
  }
  function gameOver(kind) {
    G.state = 'over';
    document.body.classList.add('menu');
    $('overTitle').textContent = 'СОТРУДНИК НЕ НАЙДЕН';
    $('overReason').textContent = kind === 'burnout'
      ? 'Выгорание 100%. Увольнение по собственному желанию — желание было не твоё.'
      : 'На третий запрос система ответила: «Результатов не найдено» — и добавила от себя: «Прекрати».';
    hud.stats('overStats', G);
    hud.screen('over', true);
  }

  // ================================================================ day end (state_camp.go: rest / vacation)
  const ticketDur = q => 1.6 + q.exp * 0.45;
  // canon energy cost → working time: 30 min … 3 h
  const workMinutes = q => 30 + q.energy * 30;
  const fmtDur = m => (m >= 60 ? `${Math.floor(m / 60)}ч${m % 60 ? ' ' + (m % 60) + 'м' : ''}` : `${m}м`);
  EJ.workMinutes = workMinutes; EJ.fmtDur = fmtDur;
  function endDay(vacation, forced) {
    if (G.state !== 'play') return;
    if (G.enemies.some(e => !e.patrol) && !forced) { hud.toast('Нельзя закрыть день посреди инцидента.', 2); sfx('deny'); return; }
    const P = G.player, ds = G.dayStats;
    if (vacation) {
      // GoVacation: 50 gold, energy full, burnout −50
      P.gold -= 50; P.energy.cur = P.energy.max; P.burnout.cur = Math.max(0, P.burnout.cur - 50); P.hp.cur = P.hp.max;
    } else {
      P.energy.cur = P.energy.max; P.burnout.cur = Math.max(0, P.burnout.cur - 15); P.hp.cur = Math.min(P.hp.max, P.hp.cur + Math.ceil(P.hp.max * 0.3));
    }
    P.workT = 0;
    G.state = 'intro';
    G.enemies = []; G.bullets = []; G.hazards = []; G.beams = []; G.waves = [];
    for (const R of G.L.rooms) if (R.active) {
      R.active = false; R.boss = false; R.waves = []; R.waveDelay = 0;
      lockRoom(R, false);
    }
    sfx('heal');
    $('fcEyebrow').textContent = `ВЕЧЕР · ДЕНЬ ${G.day}${G.overtime ? ' · ОВЕРТАЙМ' : ''}`;
    $('fcTitle').textContent = forced ? 'Охрана выключила свет' : vacation ? 'Отпуск' : 'Отдых';
    $('fcSub').textContent = `Тасок закрыто: ${ds.tickets} · золото: ${P.gold} ◆ · выгорание ${Math.round(P.burnout.cur)}% · ${vacation ? 'энергия и здоровье полностью' : 'энергия полностью, здоровье +30%'}`;
    $('floorCard').querySelector('.fc-bar').innerHTML = '<i></i>';
    hud.screen('floorCard', true);
    setTimeout(() => {
      hud.screen('floorCard', false);
      G.day++;
      G.drops = G.drops.filter(d => d.kind !== 'coin');
      const desk = G.L.rooms[0].desk503;
      P.x = desk.x + 0.9; P.y = desk.y + 1.5; P.iframes = 1;
      G.state = 'play'; G.camSnap = true;
      startDay(false);
    }, 2000);
  }

  // clock: 9 working hours ≈ 5.5 min; overtime until midnight
  const CLOCK_RATE = 540 / 330;
  function updateClock(dt) {
    if (G.floor.key === 'penthouse' || G.L.rooms.some(r => r.boss) || G.pendingScene) return;
    G.clock += dt * CLOCK_RATE;
    if (!G.overtime && G.clock >= 18 * 60) {
      G.overtime = true; G.nightTarget = Math.max(G.nightTarget, 0.45);
      hud.banner('18:00 · ОВЕРТАЙМ', 'Свет гаснет через одну. Награды ×1.5, выгорание ×2. Закрыть день — место 503', '#ffb03a', 3.5);
      sfx('alarm');
    }
    if (G.clock >= G.nextTicketAt && (G.clock < 18 * 60 || G.patrol)) {
      G.nextTicketAt = G.clock + (G.patrol ? 30 + rand() * 20 : 60 + rand() * 40);
      if (G.tickets.filter(t => t.kind === 'normal' && t.state === 'open').length < (G.patrol ? 6 : 4)) {
        const t = addNormalTicket();
        if (t) { hud.toast(`📨 Новая таска ${t.id}: «${t.title}» · ⏱ ${fmtDur(workMinutes(t.quest))}`, 3); sfx('ui'); if (!G.selTicket || G.selTicket.state !== 'open') G.selTicket = t; }
      }
    }
    if (G.overtime && (G.nightIncidentT -= dt) <= 0) {
      G.nightIncidentT = 30;
      const rooms = G.L.rooms.filter(r => ['office', 'print', 'meeting', 'server', 'kitchen'].includes(r.type) && r.cleared && !r.active);
      if (rooms.length) { const R = rooms[Math.floor(rand() * rooms.length)]; R.incident = true; R.cleared = false; hud.alert('НОЧНОЙ ИНЦИДЕНТ'); }
    }
    if (!G.patrol && G.clock >= 24 * 60) startPatrol();
    if (G.patrol) updatePatrol(dt);
    if (G.clock >= 29 * 60 && G.state === 'play') { hud.banner('05:00 · ОХРАНА ВЫСТАВИЛА ЗА ДВЕРЬ', 'Выгорание +20', '#ff2d55', 3); ent.addBurnout(G, 20); if (G.state === 'play' && G.player.alive) endDay(false, true); }
  }

  // 00:00 — night patrol: the security door opens, guards hunt the hero across the floor,
  // tickets pour in and pay double; the night ends at seat 503 (or 05:00, when security throws you out)
  function startPatrol() {
    const door = G.L.rooms[0].secdoor;
    G.patrol = { t: 3, wave: 0, door };
    G.nightTarget = Math.max(G.nightTarget, 0.7);
    G.nextTicketAt = G.clock + 5;
    hud.banner('00:00 · НОЧНОЙ ОБХОД', 'Охрана вышла на этаж. Таски ×2, но охрана сильнее и ищет тебя. Уйти — место 503', '#ff2d55', 4);
    hud.alert('ДВЕРЬ ОХРАНЫ ОТКРЫТА'); sfx('alarm'); sfx('lock');
    EJ.audio.setIntensity(1);
  }
  function updatePatrol(dt) {
    const pt = G.patrol, door = pt.door;
    if (!door || G.state !== 'play') return;
    door.openT = Math.max(0, (door.openT || 0) - dt);
    if ((pt.t -= dt) > 0) return;
    const alive = G.enemies.filter(e => e.patrol).length;
    const cap = 2 + Math.min(4, pt.wave);
    pt.t = Math.max(6, 14 - pt.wave * 1.5);
    if (alive >= cap) return;
    pt.wave++;
    const [fx, fy] = frontOf(door);
    const n = Math.min(cap - alive, 1 + (pt.wave > 3 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const type = G.floorIdx >= 1 && rand() < 0.35 ? 'drone' : 'guard';
      const west = door.wallSide === 'w';
      const spread = (rand() - 0.5) * 0.8, forward = 0.2 + i * 0.4;
      const e = ent.makeEnemy(G, type, fx + (west ? forward : spread), fy + (west ? spread : forward), { room: null, extra: { patrol: true } });
      e.hp = e.maxHp = Math.round(e.maxHp * (1.4 + 0.1 * pt.wave)); e.dmgMul *= 1.3 + 0.05 * pt.wave; e.speed *= 1.15;
    }
    door.openT = 1.2;
    hud.alert(pt.wave === 1 ? 'ОХРАНА ВЫШЛА НА ОБХОД' : 'ПОДКРЕПЛЕНИЕ ОХРАНЫ'); sfx('spawn');
  }

  function nextFloor() {
    if (G.state !== 'play') return;
    sfx('elevator');
    G.bossBeaten = false;
    const go = () => startFloor(G.floorIdx + 1);
    hud.show(false);
    if (G.floorIdx === 0) playScene('mentor', go); else go();
  }

  function finishRun() {
    const P = G.player, meta = loadMeta();
    meta.ceos = (meta.ceos || 0) + 1;
    meta.ceo = { run: meta.runs, level: P.level, skill: P.skill, luck: P.luck, items: Object.keys(P.inv), days: G.day };
    saveMeta(meta);
    G.state = 'ending'; document.body.classList.add('menu');
    $('ceoChain').innerHTML = Array.from({ length: Math.min(4, meta.ceos) }, () => '<span>♛</span>').join('<i>→</i>') + '<i>→</i><span class="q">?</span>';
    $('endingText').textContent = `Эникей из забега #${meta.runs} занял трон: уровень ${P.level}, навык ${P.skill}, ${Object.keys(P.inv).length} предметов. В следующем забеге он будет ждать наверху.`;
    hud.stats('endStats', G);
    hud.screen('ending', true);
  }

  // ================================================================ scenes (typewriter, state_scene.go)
  let sceneCb = null, sceneText = '', sceneShown = 0, sceneT = 0, scenePrevState = 'play';
  function playScene(id, cb) {
    const sc = EJ.SCENES[id];
    if (!sc) { cb(); return; }
    scenePrevState = G.state === 'scene' ? scenePrevState : G.state;
    G.state = 'scene'; sceneCb = cb; sceneText = sc.text; sceneShown = 0; sceneT = 0;
    $('sceneEyebrow').textContent = id === 'ending' ? 'ФИНАЛ' : 'MONOLITH CORP';
    $('sceneTitle').textContent = sc.title;
    $('sceneText').innerHTML = '';
    hud.screen('scene', true);
    document.body.classList.add('menu');
  }
  function updateScene(dt) {
    if (sceneShown < sceneText.length) {
      sceneT += dt;
      const n = Math.min(sceneText.length, Math.floor(sceneT * 70));
      if (n > sceneShown) { sceneShown = n; $('sceneText').innerHTML = escapeHtml(sceneText.slice(0, n)) + '<span class="cur"></span>'; if (n % 3 === 0) EJ.audio.play('hack', 0.03); }
    }
    if (EJ.input.hit('Enter', 'Space') || EJ.input.mouse.clicked) {
      if (sceneShown < sceneText.length) { sceneShown = sceneText.length; $('sceneText').innerHTML = escapeHtml(sceneText); }
      else {
        hud.screen('scene', false);
        G.state = scenePrevState === 'title' || scenePrevState === 'scene' ? 'play' : scenePrevState;
        if (G.state === 'play') document.body.classList.remove('menu');
        const cb = sceneCb; sceneCb = null; cb && cb();
      }
    }
  }
  const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  // ================================================================ main update
  const rootSeq = ['KeyR', 'KeyO', 'KeyO', 'KeyT'];
  let rootIdx = 0;
  function update(dt) {
    const P = G.player, L = G.L, inp = EJ.input;
    G.stats.time += dt;
    G.night += (G.nightTarget - G.night) * Math.min(1, dt * 1.2);
    // Root easter egg: say his name and the building goes dark (scenes.yaml «name_not_found_404»)
    for (const c of inp.down) if (inp.hit(c)) { if (c === rootSeq[rootIdx]) { rootIdx++; if (rootIdx === 4) { rootIdx = 0; G.blackoutT = 5; sfx('phase'); } } else rootIdx = c === 'KeyR' ? 1 : 0; }
    if (G.blackoutT > 0) { G.blackoutT -= dt; G.blackout = Math.min(1, G.blackout + dt * 4); if (G.blackoutT <= 0) { hud.speech(G.npcs.find(n => n.kind === 'gregor') || P, 'Грэгор', 'Тсс. Имя. Не произноси его вслух. Никогда. Здание — это он.', 5); } }
    else G.blackout = Math.max(0, G.blackout - dt * 0.6);

    if (G.cinematic) {
      G.cinematic.t += dt;
      for (const e of G.enemies) if (e.spawnT > 0) e.spawnT -= dt;
      if (G.cinematic.t > 1 && !G.cinematic.roared) { G.cinematic.roared = true; EJ.fx.shake(G, 8); sfx('phase'); }
      if (G.cinematic.t >= G.cinematic.dur) { G.cinematic = null; hud.screen('bossCard', false); }
      ent.updateParticles(G, dt);
    } else {
      G.uiBlock = false;
      if (inp.hit('Tab')) { const open = G.tickets.filter(t => t.state === 'open'); if (open.length) { G.selTicket = open[(open.indexOf(G.selTicket) + 1) % open.length]; sfx('ui'); } }
      ent.updatePlayer(G, dt);
      ent.updateAllies(G, dt);
      updateClock(dt);
      // Midnight can call endDay(), clear enemies and change the screen. Stop
      // this frame before updateRooms() can restart combat and relock its doors.
      if (G.state !== 'play') return;
      const tile = Math.floor(P.x) + Math.floor(P.y) * L.w;
      G.flowT -= dt;
      if (tile !== G.flowTile || G.flowT <= 0) { G.flow = EJ.level.flowField(L, P.x, P.y); G.flowTile = tile; G.flowT = 0.4; }
      ent.updateEnemies(G, dt);
      EJ.boss.updateBeams(G, dt); EJ.boss.updateWaves(G, dt);
      ent.updateBullets(G, dt);
      ent.updateHazards(G, dt);
      ent.updateDrops(G, dt);
      if (P.alive) EJ.watch.updateAlerts(G, dt);
      ent.updateParticles(G, dt);
      for (const n of G.npcs) n.say = Math.max(0, (n.say || 0) - dt);
      if (P.alive) { updateRooms(dt); updateInteract(dt); updatePendingScene(dt); updateRoutineScene(); }
      
    }
    let tx = EJ.isoX(P.x, P.y), ty = EJ.isoY(P.x, P.y) - 10;
    if (G.cinematic) { tx = EJ.isoX(G.cinematic.x, G.cinematic.y); ty = EJ.isoY(G.cinematic.x, G.cinematic.y) - 30; }
    else if (G.mouseWorld && inp.mouse.over) {
      const [W, H] = EJ.render.size;
      tx += EJ.clamp((G.mouseWorld.px - W / 2) * 0.18, -40, 40);
      ty += EJ.clamp((G.mouseWorld.py - H / 2) * 0.18, -26, 26);
    }
    const k = G.camSnap ? 1 : 1 - Math.exp(-dt * (G.cinematic ? 3 : 7));
    G.camSnap = false;
    G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  }

  // ================================================================ loop
  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const inp = EJ.input;
    let keepInput = false;
    if (G.L && (G.state === 'play' || G.state === 'intro')) {
      G.mouseWorld = EJ.render.screenToWorld(inp.mouse.x, inp.mouse.y, 11);
      if (G.state === 'play') {
        if (inp.hit('Escape', 'KeyP')) pause(true);
        else if (inp.hit('KeyI')) openInventory(true);
        else if (G.hitstop > 0) { G.hitstop -= realDt; keepInput = true; }
        else { if (G.slowT > 0) G.slowT -= realDt; update(realDt * (G.slowT > 0 ? 0.3 : G.timeScale)); }
      }
    } else if (G.state === 'pause') { if (inp.hit('Escape', 'KeyP')) pause(false); }
    else if (G.state === 'inventory') { if (inp.hit('KeyI', 'Escape', 'Tab')) openInventory(false); }
    else if (G.state === 'scene') updateScene(realDt);
    else if (G.state === 'buffer') { for (let i = 0; i < 3; i++) if (inp.hit('Digit' + (i + 1)) && G.bufferOpts[i]) { G.bufferOpts[i](); break; } }
    else if (G.state === 'title') titleKeys(inp);
    else if ((G.state === 'over' || G.state === 'ending') && inp.hit('Enter')) restart();
    if (G.L) { G.shake = Math.max(0, G.shake - realDt * 28); G.hurtFlash = Math.max(0, G.hurtFlash - realDt * 3); G.burnFlash = Math.max(0, (G.burnFlash || 0) - realDt * 2.5); }
    if (inp.hit('KeyM')) toggleSound();
    if (!keepInput) inp.endFrame();
    if (G.L && G.state !== 'title') {
      EJ.render.frame(G, ['pause', 'inventory', 'camp', 'buffer'].includes(G.state) ? 0 : realDt);
      if (G.player && G.state !== 'scene') hud.update(G, realDt);
    }
    requestAnimationFrame(frame);
  }

  function pause(on) {
    if (on) { G.state = 'pause'; hud.screen('pause', true); document.body.classList.add('menu'); EJ.input.mouse.down = false; }
    else { G.state = 'play'; hud.screen('pause', false); document.body.classList.remove('menu'); }
  }
  function openInventory(on) {
    if (on) { G.state = 'inventory'; hud.inventory(G); hud.screen('inventory', true); document.body.classList.add('menu'); }
    else { G.state = 'play'; hud.screen('inventory', false); document.body.classList.remove('menu'); }
  }
  function toggleSound() {
    EJ.audio.init();
    const m = EJ.audio.toggleMute();
    $('soundBtn').classList.toggle('off', m);
    hud.toast(m ? 'Звук выключен (M)' : 'Звук включён (M)', 1.4);
  }

  // ================================================================ title
  // main menu: a neon column under the logo; the 04:04 mail pops up as a notification
  const MENUS = ['menuMain', 'menuSettings', 'menuControls'];
  let menuSel = 0, mailTimer = null;
  const menuItems = () => [...document.querySelectorAll(`#${MENUS.find(m => !$(m).hidden)} .tm-item`)];
  function menuFocus(i) {
    const it = menuItems(); if (!it.length) return;
    menuSel = (i + it.length) % it.length;
    it.forEach((b, k) => b.classList.toggle('sel', k === menuSel));
  }
  function showMenu(id) { for (const m of MENUS) $(m).hidden = m !== id; menuFocus(0); }
  function refreshSettings() {
    const N = { painted: 'детальная', pixel: 'пиксельная' };
    $('tmSound').textContent = `Звук: ${EJ.audio.muted ? 'выкл' : 'вкл'}`;
  }
  function titleAct(a) {
    EJ.audio.init(); sfx('ui');
    if (a === 'new' || a === 'skip') { clearTimeout(mailTimer); $('mailToast').hidden = true; hud.screen('title', false); EJ.audio.startMusic('explore'); newRun(a === 'skip'); return; }
    if (a === 'settings') { refreshSettings(); showMenu('menuSettings'); }
    if (a === 'controls') showMenu('menuControls');
    if (a === 'back') showMenu('menuMain');
    if (a === 'sound') { toggleSound(); refreshSettings(); }
    if (a === 'style') { const S = EJ.assets.STYLES; EJ.assets.setStyle(S[(S.indexOf(EJ.assets.style) + 1) % S.length]); }
  }
  function titleKeys(inp) {
    if (inp.hit('ArrowDown', 'KeyS')) { menuFocus(menuSel + 1); sfx('step'); }
    if (inp.hit('ArrowUp', 'KeyW')) { menuFocus(menuSel - 1); sfx('step'); }
    if (inp.hit('Enter', 'Space')) { const b = menuItems()[menuSel]; if (b) titleAct(b.dataset.menu); }
    if (inp.hit('Escape', 'Backspace')) titleAct('back');
  }
  function showTitle() {
    showMenu('menuMain');
    $('mailToast').hidden = true; $('mailBody').hidden = true;
    clearTimeout(mailTimer);
    mailTimer = setTimeout(() => { if (G.state === 'title') { $('mailToast').hidden = false; EJ.audio.play('ui'); } }, 2500);
  }
  function restart() { for (const s of ['over', 'ending']) hud.screen(s, false); hud.show(false); newRun(true); }
  function toMenu() {
    for (const s of ['over', 'ending', 'pause', 'camp', 'inventory']) hud.screen(s, false);
    hud.show(false);
    G.state = 'title'; G.L = null;
    showPrevCeo();
    $('mailLine').textContent = '«Кандидат Эникей. Ваше место за вами. Буквально — оно прикручено к полу.»';
    hud.screen('title', true);
    showTitle();
    document.body.classList.add('menu');
  }
  function showPrevCeo() {
    const c = loadMeta().ceo;
    $('prevCeo').hidden = !c;
    if (c) $('prevCeo').textContent = `♛ Сейчас наверху: CEO — Эникей из забега #${c.run} · уровень ${c.level} · навык ${c.skill}`;
  }

  // ================================================================ boot
  function boot() {
    EJ.render.init($('game'));
    hud.init();
    showPrevCeo();
    document.querySelectorAll('[data-menu]').forEach(b => {
      b.addEventListener('click', () => { b.blur(); titleAct(b.dataset.menu); });
      b.addEventListener('mouseenter', () => { const i = menuItems().indexOf(b); if (i >= 0 && i !== menuSel) { menuFocus(i); } });
    });
    $('mailToggle').onclick = () => { $('mailToggle').blur(); $('mailBody').hidden = !$('mailBody').hidden; $('mailToast').classList.toggle('open', !$('mailBody').hidden); sfx('ui'); };
    showTitle();
    $('resumeBtn').onclick = () => pause(false);
    $('quitBtn').onclick = toMenu;
    $('retryBtn').onclick = restart;
    $('menuBtn').onclick = toMenu;
    $('ngBtn').onclick = restart;
    $('endMenuBtn').onclick = toMenu;
    $('soundBtn').onclick = e => { e.stopPropagation(); toggleSound(); };
    $('game').addEventListener('mousemove', () => { EJ.input.mouse.over = true; });
    document.addEventListener('mouseleave', () => { EJ.input.mouse.over = false; });
    addEventListener('blur', () => { if (G.state === 'play') pause(true); });
    if (matchMedia('(pointer: coarse)').matches) $('touchNote').hidden = false;
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 10px Oswald')]).catch(() => {});
    requestAnimationFrame(frame);
    EJ.assets.load().then(() => { if (/[?&]autostart\b/.test(location.search)) { hud.screen('title', false); newRun(true); } });
  }
  boot();
})();
