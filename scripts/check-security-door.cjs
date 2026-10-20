const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const noop = () => {};
const scales = [], ellipses = [];
function canvas() {
  const methods = {
    scale: (...args) => scales.push(args),
    ellipse: (...args) => ellipses.push(args),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const ctx = new Proxy(methods, { get: (o, k) => k in o ? o[k] : noop });
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}
const stub = () => new Proxy({}, { get: () => noop });
const context = {
  console, performance, location: { search: '' }, addEventListener: noop,
  innerWidth: 1500, innerHeight: 1500, devicePixelRatio: 1,
  document: { createElement: canvas, getElementById: () => ({ addEventListener: noop }) },
};
context.window = context; vm.createContext(context);
const read = file => fs.readFileSync(path.join(__dirname, '../src', file + '.js'), 'utf8');
for (const file of ['core', 'data', 'level']) vm.runInContext(read(file), context);
const EJ = context.EJ, spawned = [];
EJ.hud = stub(); EJ.audio = stub();
EJ.ent = { makeEnemy(G, type, x, y) {
  const e = { x, y, hp: 10, dmgMul: 1, speed: 1 };
  spawned.push(e); return e;
} };
vm.runInContext(read('game').replace('  boot();', '  EJ.test = { frontOf, updatePatrol };'), context);
vm.runInContext(read('render').replace('return { init, resize, frame,', 'return { testDrawProp: drawProp, init, resize, frame,'), context);
EJ.render.init(canvas());

// Generated footprints must run along their mounting wall, including fallback placement.
for (let floor = 0; floor < 3; floor++) for (let seed = 1; seed <= 40; seed++) {
  const L = EJ.level.generate(floor, seed), R = L.rooms[0], p = R.secdoor;
  if (R.type !== 'start') continue;
  assert.ok(p);
  assert.ok(p.wallSide === 'n' || p.wallSide === 'w');
  assert.equal(p.wallSide === 'n' ? p.y : p.x, (p.wallSide === 'n' ? R.y : R.x) + .02);
  assert.ok(p.wallSide === 'n' ? p.w > p.d : p.d > p.w);
}

// Exercise both mounting sides even when a generated seed always fits the north wall.
for (const side of ['n', 'w']) {
  const p = { kind: 'secdoor', wallSide: side, x: 10, y: 10,
    w: side === 'n' ? 1.6 : .35, d: side === 'n' ? .35 : 1.6, h: 50, openT: 1.2 };
  const [fx, fy] = EJ.test.frontOf(p);
  assert.ok(side === 'n' ? fy > p.y + p.d : fx > p.x + p.w);
  const art = { img: {}, x: 0, y: 0, w: 480, h: 750 };
  EJ.assets = { forProp: () => art };
  scales.length = 0; ellipses.length = 0;
  for (let i = 0; i < 3; i++) EJ.render.testDrawProp({ patrol: null }, p, 0, 0);
  assert.equal(p.openT, 1.2, 'Rendering must not advance the open timer');
  assert.equal(scales.some(([x]) => x === -1), side === 'n', 'Mirror only the north-facing sprite');
  const h = Math.min(750 * ((p.w + p.d) * 16 * 1.12) / 480, 58);
  const lampX = (p.x + p.w / 2 - p.y - p.d / 2) * 16 + (side === 'n' ? -.09 : .09) * h * 480 / 750;
  const lampY = (p.x + p.w + p.y + p.d) * 8 + 2 - h * .76;
  assert.ok(Math.abs(ellipses[0][0] - lampX) < 1e-9);
  assert.ok(Math.abs(ellipses[0][1] - lampY) < 1e-9, 'Lamp must be attached to the scaled door header');
  Object.assign(EJ.G, { state: 'play', patrol: { door: p, t: 2, wave: 0 }, enemies: [] });
  EJ.test.updatePatrol(.3);
  assert.ok(Math.abs(p.openT - .9) < 1e-9, 'Door timer advances by simulation seconds');
  EJ.G.patrol.t = 0; spawned.length = 0;
  EJ.test.updatePatrol(.1);
  assert.equal(p.openT, 1.2);
  assert.equal(spawned.length, 1);
  assert.ok(side === 'n' ? spawned[0].y > p.y + p.d : spawned[0].x > p.x + p.w,
    'Patrol emerges into the room in front of the mounting wall');
  // Procedural fallback must use that same visible face.
  EJ.level.bakeProp(p, EJ.FLOORS[0], EJ.makeRng(42));
  assert.ok(side === 'n' ? p.frame.a[0] < p.frame.b[0] : p.frame.a[0] > p.frame.b[0]);
}
console.log('PASS: 120 generated floors; both door orientations, lamp anchors, render-independent timer and patrol exits.');
