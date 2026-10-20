// Regression: midnight during elite combat must not restart/lock the fight.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const timers = [], elements = new Map();
const noop = () => {};
const stub = () => new Proxy({}, { get: () => noop });
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', style: {}, classList: stub(), querySelector: () => ({ innerHTML: '' }),
  });
  return elements.get(id);
}
const context = {
  console, performance, location: { search: '' }, addEventListener: noop,
  document: { getElementById: element, body: { classList: stub() } },
  setTimeout: fn => timers.push(fn),
};
context.window = context;
vm.createContext(context);
const read = file => fs.readFileSync(path.join(__dirname, '../src', file + '.js'), 'utf8');
for (const file of ['core', 'data', 'level']) vm.runInContext(read(file), context);
const EJ = context.EJ;
let enemyUpdates = 0;
EJ.hud = stub(); EJ.audio = stub();
EJ.ent = { updatePlayer: noop, updateAllies: noop, updateEnemies() { enemyUpdates++; } };
// Test-only hooks in memory; production code has no test API and boots normally.
vm.runInContext(read('game').replace('  boot();', '  EJ.test = { update, endDay, startDay, checkBossTicket, updateRoutineScene };'), context);
const G = EJ.G;
const door = { x: 12, y: 5, locked: true, t: .25 };
const seal = { x: 20, y: 5, sealed: true, locked: true, t: .25 };
const start = { id: 0, type: 'start', doors: [door], desk503: { x: 2, y: 2 } };
const room = { id: 1, type: 'server', doors: [door, seal], x: 10, y: 2, w: 8, h: 8,
  cx: 14, cy: 6, active: true, incident: true, cleared: false, elite: 'frontend', waves: [['bug']], waveDelay: .4 };
const bossRoom = { id: 2, type: 'boss', sealed: true, doors: [seal] };
const L = { rooms: [start, room, bossRoom], props: [], doors: [door, seal], w: 32,
  idx: (x,y) => y * 32 + x, doorLock: new Uint8Array(1024) };
L.doorLock[L.idx(door.x,door.y)] = 1; L.doorLock[L.idx(seal.x,seal.y)] = 1;
Object.assign(G, {
  L, state: 'play', day: 1, floorStartDay: 1, clock: 1440 - .01, overtime: true,
  nightIncidentT: 30, nextTicketAt: 1500, floorIdx: 0, floor: EJ.FLOORS[0],
  enemies: [{ type: 'elite', room: 1 }], bullets: [{}], hazards: [{}], beams: [{}], waves: [{}], drops: [],
  stats: { time: 0, kills: 0 }, dayStats: { tickets: 0 },
  player: { x: 14, y: 6, alive: true, hp: { cur: 10, max: 30 }, energy: { cur: 0, max: 20 },
    burnout: { cur: 40 }, gold: 0, inv: {}, luck: 0, passes: 0, workT: 4 },
});
EJ.test.update(.05);
assert.equal(G.state, 'intro');
assert.equal(enemyUpdates, 0, 'Combat must not update after midnight ends the day');
assert.equal(room.active, false);
assert.equal(door.locked, false);
assert.equal(L.doorLock[L.idx(door.x,door.y)], 0, 'Collision grid must unlock too');
for (const key of ['enemies','bullets','hazards','beams','waves']) assert.equal(G[key].length, 0, key);
assert.equal(room.waves.length, 0);
assert.equal(timers.length, 1);
timers.shift()();
assert.equal(G.day, 2); assert.equal(G.state, 'play');
assert.equal(room.active, false); assert.equal(door.locked, false);
assert.equal(G.player.x, 2.9); assert.equal(G.player.y, 3.5);
assert.equal(seal.locked, true, 'Shared boss entrance must retain its progression seal');
assert.equal(L.doorLock[L.idx(seal.x,seal.y)], 1);

// Existing runs with stale non-active locks must recover on the next day too.
door.locked = true; L.doorLock[L.idx(door.x,door.y)] = 1;
EJ.test.startDay(false);
assert.equal(door.locked, false); assert.equal(seal.locked, true);
console.log('PASS: midnight during elite fight, no post-transition combat, next-day recovery, stale locks, preserved shared boss seals.');

// «Тебя заметили»: passes earned mid-shift only become a scene next morning
// near Gregor, without combat or repeats. The duty ticket appears with it.
Object.assign(G, { state: 'play', routinePending: false, routineShown: false, tickets: [],
  enemies: [], pendingScene: null, bossBeaten: false });
G.player.passes = G.floor.passes;
G.npcs = [{ kind: 'gregor', x: 10, y: 10 }];
EJ.test.checkBossTicket();
assert.equal(G.routinePending, false, 'Pass pickup must wait until a new day');
assert.equal(G.tickets.length, 0);
EJ.test.checkBossTicket(true);
assert.equal(G.routinePending, true);
EJ.test.updateRoutineScene();
assert.equal(G.state, 'play', 'Scene must wait until the player approaches Gregor');
Object.assign(G.player, { x: 10, y: 11, workT: 0 });
G.enemies = [{ type: 'elite' }]; EJ.test.updateRoutineScene();
assert.equal(G.state, 'play', 'Scene must not interrupt combat');
G.enemies = []; EJ.test.updateRoutineScene();
assert.equal(G.state, 'scene'); assert.equal(G.routineShown, true);
assert.equal(element('sceneTitle').textContent, 'Тебя заметили');
assert.equal(G.tickets.filter(t=>t.id==='MON-58').length, 1);
G.state='play'; EJ.test.updateRoutineScene(); EJ.test.checkBossTicket(true);
assert.equal(G.state, 'play');
assert.equal(G.tickets.filter(t=>t.id==='MON-58').length, 1, 'Do not duplicate the duty ticket');
console.log('PASS: routine scene waits for new day + Gregor proximity + no combat, then runs once.');
