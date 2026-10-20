// Ensure SVG lettering reaches the display-resolution scene, not the wall bake.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
let svgDraws = 0;
const rectColors = [];
function canvas() {
  const methods = {
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage(img) { if (img.path && img.path.endsWith('.svg')) svgDraws++; },
    fillRect() { rectColors.push(this.fillStyle); },
  };
  const ctx = new Proxy(methods, { get: (o,k) => k in o ? o[k] : () => {}, set: (o,k,v) => (o[k]=v,true) });
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}
const context = {
  console, addEventListener() {}, innerWidth: 1500, innerHeight: 1500, devicePixelRatio: 1,
  document: { createElement: canvas },
  Image: class { set src(value) { this.path=value; queueMicrotask(() => this.onload()); } },
};
context.window=context; vm.createContext(context);
const read = file => fs.readFileSync(path.join(__dirname, '../src', file+'.js'), 'utf8');
for (const file of ['core','brand','data','level']) vm.runInContext(read(file), context);
vm.runInContext(read('render').replace('return { init, resize, frame,', 'return { testDrawWall: drawWall, init, resize, frame,'), context);
(async () => {
  const EJ=context.EJ;
  await EJ.brand.load();
  EJ.assets={has:()=>false,forProp:()=>null,
    pillarColor:G=>G?.overtime?'#ff2d55':'#3a8bff',pillarNight:G=>!!G?.overtime};
  for (let floor=0; floor<3; floor++) {
    const L=EJ.level.generate(floor,4242);
    const before=svgDraws;
    EJ.level.bake(L);
    assert.equal(svgDraws,before,'No SVG logo may be reduced into the pixel wall/glow bake');
    assert.ok(L.wallSigns.length>0);
    for (const sign of L.wallSigns) assert.ok(L.walls.some(w=>w.signs.includes(sign)),'Every sign must attach to depth-sorted wall slices');
    const display=canvas(); EJ.render.init(display);
    // 1500 / 300 gives scale=5: this previously fell back to RES=1.
    assert.equal(display.width,1500);
    const walls=L.walls.filter(w=>w.signs.length);
    for (const wall of walls) EJ.render.testDrawWall(wall,wall.ox,wall.oy);
    assert.ok(svgDraws>before,'Real SVG must be drawn with the wall at scene resolution');
    assert.ok(L.wallNeons.length>0, 'Include the wall lighting seen in the starting office');
    for (const neon of L.wallNeons) assert.ok(L.walls.some(w=>w.neon===neon));
    const neonWall=L.walls.find(w=>w.neon);
    for (const overtime of [false,true,false]) {
      rectColors.length=0;
      EJ.render.testDrawWall(neonWall,neonWall.ox,neonWall.oy,{overtime});
      assert.ok(rectColors.includes(overtime?'#ff2d55':'#3a8bff'),'Wall strips must switch blue/red/blue with the day');
      assert.ok(!rectColors.includes(overtime?'#3a8bff':'#ff2d55'),'No previous light color should remain');
    }
  }
  console.log('PASS: 3 floors, native-resolution wall logos, depth masks, scale 5, blue/red/blue wall neon.');
})().catch(error=>{ console.error(error); process.exitCode=1; });
