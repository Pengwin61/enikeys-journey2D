const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const noop = () => {};
const elements = new Map(), marks = [];
const ctx = new Proxy({
  fill() { marks.push(this.fillStyle); },
  fillRect() { marks.push(this.fillStyle); },
}, { get: (o, k) => k in o ? o[k] : noop });
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    style: { setProperty: noop }, classList: { add: noop, remove: noop },
    getBoundingClientRect: () => ({ width: 300, height: 170 }), getContext: () => ctx,
  });
  return elements.get(id);
}
const context = { console, performance, addEventListener: noop, document: { getElementById: element }, devicePixelRatio: 1 };
context.window = context; vm.createContext(context);
const read = f => fs.readFileSync(path.join(__dirname, '../src', f + '.js'), 'utf8');
for (const f of ['core', 'data', 'level', 'watch', 'entities']) vm.runInContext(read(f), context);
vm.runInContext(read('ui').replace('return { init, show, update,', 'return { testDrawMinimap: drawMinimap, init, show, update,'), context);
const EJ = context.EJ;
EJ.audio = { play: noop };
const rooms = [0, 1, 2].map(id => ({ id, x: id * 10, y: 0, w: 8, h: 8,
  cx: id * 10 + 4, cy: 4, ccx: id * 10 + 4, ccy: 4, doors: [],
  links: id === 1 ? [0, 2] : [1], visited: id === 0, type: 'office' }));
const G = { player: { x: 2, y: 2, inv: {}, gold: 0 }, L: { rooms, doors: [] },
  enemies: [], tickets: [], floaters: [], badgeMap: true };
Object.assign(G.L, { w: 30, h: 8, idx: (x, y) => y * 30 + x, roomAt: new Int16Array(240).fill(-1) });
for (const R of rooms) for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
  G.L.roomAt[G.L.idx(x, y)] = R.id;
}
const ids = () => [...EJ.watch.knownRooms(G)].sort();
assert.equal(EJ.watch.grade(G.player), -1);
assert.deepEqual(ids(), []);
const expected = [[0], [0, 1], [0, 1], [0, 1, 2]];
for (let grade = 0; grade < 4; grade++) {
  G.player.inv.smartwatch = grade;
  assert.deepEqual(ids(), expected[grade], 'Map knowledge must follow rarity, ignoring obsolete badgeMap');
  assert.equal(EJ.watch.canTrack(G, 2, 2), grade >= 2);
  assert.equal(EJ.watch.canTrack(G, 12, 2), false, 'No markers in unvisited rooms');
  assert.equal(EJ.watch.canTrack(G, -20, -20), false);
}
// Verify the real renderer gates both tasks and live enemy markers.
G.tickets = [
  { state: 'open', kind: 'normal', target: { x: 2, y: 2, w: 1, d: 1 } },
  { state: 'open', kind: 'normal', target: { x: 12, y: 2, w: 1, d: 1 } },
];
G.enemies = [
  { type: 'guard', x: 3, y: 3, hp: 10, patrol: true },
  { type: 'guard', x: 13, y: 3, hp: 10, patrol: true },
  { type: 'elite', x: 4, y: 3, hp: 10 },
  { type: 'elite', x: 14, y: 3, hp: 10 },
  { type: 'guard', x: 3, y: 3, hp: 0, dead: true },
];
for (let grade = 0; grade < 4; grade++) {
  G.player.inv.smartwatch = grade; marks.length = 0;
  EJ.hud.testDrawMinimap(G);
  for (const color of ['#3fd8ff', '#ffb03a', '#b26bff']) {
    assert.equal(marks.filter(c => c === color).length, grade >= 2 ? 1 : 0,
      'Render only one visited-room marker of each kind at purple or better');
  }
  EJ.hud.loot('smartwatch', grade, true);
  assert.equal(element('lootText').textContent, EJ.watch.description(grade));
}

// Upgrades replace the existing passive watch. Same/lower rarity converts to gold.
G.player.inv.smartwatch = 0;
assert.equal(EJ.ent.giveItem(G, 'smartwatch', 2), true);
assert.equal(G.player.inv.smartwatch, 2);
assert.equal(G.player.gold, 0);
assert.equal(EJ.ent.giveItem(G, 'smartwatch', 1), false);
assert.equal(G.player.inv.smartwatch, 2);
assert.equal(G.player.gold, 10);
assert.equal(EJ.ent.giveItem(G, 'smartwatch', 2), false);
assert.equal(G.player.gold, 25);
assert.equal(EJ.ent.giveItem(G, 'smartwatch', 3), true);
assert.equal(G.player.inv.smartwatch, 3);

let alerts = 0;
G.hud = { alert() { alerts++; } };
G.enemies = [{ type: 'guard', x: 7, y: 2, hp: 10, patrol: true }];
for (let grade = 0; grade < 3; grade++) {
  G.player.inv.smartwatch = grade; EJ.watch.updateAlerts(G, .1);
}
assert.equal(alerts, 0);
G.player.inv.smartwatch = 3;
for (let i = 0; i < 100; i++) EJ.watch.updateAlerts(G, .1);
assert.equal(alerts, 1, 'Do not repeat every frame while a patrol stays nearby');
G.enemies[0].x = 30; EJ.watch.updateAlerts(G, 13);
G.enemies[0].x = 7; EJ.watch.updateAlerts(G, .1);
assert.equal(alerts, 2, 'Rearm after the patrol leaves and returns');
G.enemies[0].dead = true; EJ.watch.updateAlerts(G, 13);
assert.equal(G.watchPatrolNear, false);
console.log('PASS: four watch tiers, hidden-room secrecy, real minimap markers, pickup descriptions, upgrades, duplicate payouts and patrol warning debounce.');
