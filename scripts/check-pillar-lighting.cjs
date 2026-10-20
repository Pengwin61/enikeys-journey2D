const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8');
async function check(style) {
  const lights = [], draws = [];
  function canvas() {
    const ctx = new Proxy({
      drawImage(img) { draws.push(img.src || 'cached-canvas'); },
      getImageData() { throw new Error('Use uncropped test image'); },
    }, { get: (o,k) => k in o ? o[k] : () => {}, set: (o,k,v) => (o[k]=v,true) });
    return { width: 0, height: 0, style: {}, getContext: () => ctx };
  }
  const context = {
    console, addEventListener() {}, innerWidth: 1440, innerHeight: 900,
    document: { createElement: canvas }, location: { search: '?style=' + style },
    localStorage: { getItem() { return null; } },
    Image: class {
      naturalWidth = 256; naturalHeight = 800;
      set src(value) { this.path=value; queueMicrotask(() => fs.existsSync(path.join(root,value)) ? this.onload() : this.onerror()); }
      get src() { return this.path; }
    },
  };
  context.window=context; vm.createContext(context);
  vm.runInContext(read('core'),context);
  const EJ=context.EJ;
  EJ.brand={load:()=>Promise.resolve()};
  EJ.lightSprite=color=>{lights.push(color);return {};};
  vm.runInContext(read('assets'),context); await EJ.assets.load();
  vm.runInContext(read('render').replace('return { init, resize, frame,','return { testProp: drawProp, testLights: drawLights, testDrop: drawDrop, testMarker: drawTicketMarker, init, resize, frame,'),context);
  EJ.render.init(canvas());
  const pillar={kind:'pillar',x:4,y:4,w:1,d:1,h:58,fade:1,img:canvas()};
  const G={player:{alive:false},lights:[],hazards:[],L:{props:[pillar]}};
  const scenarios=[
    [{overtime:false,nightTarget:0},'pillar_neon_blue','#3a8bff'],
    [{overtime:true,nightTarget:.45},'pillar_neon','#ff2d55'],
    [{overtime:false,nightTarget:1},'pillar_neon','#ff2d55'],
    [{overtime:false,nightTarget:0,night:.1},'pillar_neon_blue','#3a8bff'],
  ];
  for (const [state,name,color] of scenarios) {
    Object.assign(G,state); draws.length=0; lights.length=0;
    const art=EJ.assets.forProp(pillar,G);
    assert.ok(art.img.src.endsWith('/'+name+'.png'));
    assert.equal(EJ.assets.pillarColor(G),color);
    EJ.render.testProp(G,pillar,0,0); EJ.render.testLights(G);
    assert.ok(draws.length > 0, 'Selected art must be drawn, including cached sprites');
    assert.ok(lights.includes(EJ.rgba(color,.4)), 'Floor light must match the selected sprite');
  }
  // The same day/night state must also control missing-art strip rendering.
  EJ.assets.forProp=()=>null;
  for (const [state] of scenarios) { Object.assign(G,state); EJ.render.testProp(G,pillar,0,0); }

  // Generated currency and task markers must also render in both styles.
  assert.ok(EJ.assets.has('coin_token')); assert.ok(EJ.assets.has('quest_marker'));
  const drop={kind:'coin',x:4,y:4,z:0,vz:0,life:10};
  EJ.render.testDrop(drop);
  for (const kind of ['normal','elite','boss']) {
    const t={kind,target:pillar,progress:.5,state:'open'};
    G.selTicket=t; EJ.render.testMarker(G,t);
    G.selTicket=null; EJ.render.testMarker(G,t);
  }
  const get=EJ.assets.get; EJ.assets.get=()=>null;
  EJ.sprites={COIN:{img:canvas(),w:6,h:6}};
  EJ.render.testDrop(drop);
  EJ.render.testMarker(G,{kind:'normal',target:pillar,progress:.5,state:'open'});
  EJ.assets.get=get;
}
(async()=>{await check('painted');await check('pixel');console.log('PASS: pillar day/night lighting, coin drops, selected/normal/elite/boss markers, both styles and fallbacks.');})().catch(error=>{console.error(error);process.exitCode=1;});
