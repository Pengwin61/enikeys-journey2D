/* Enikey Journey — optional painted assets (assets/gen/*.png). Missing files fall back to procedural art. */
'use strict';
EJ.assets = (() => {
  // assets/gen/<folder>/<name>.png — see assets/gen/README.md
  const MANIFEST = {
    characters: ['enikey_front', 'enikey_back', 'gregor_front', 'gregor_back', 'gregor_talk', 'gregor_fade', 'paul_front', 'paul_back', 'paul_talk', 'paul_cast'],
    props: ['security_door', 'security_door_open', 'wall_screen', 'wall_vent', 'desk_pc', 'desk_503', 'plant', 'sofa', 'coffee_machine', 'server_rack', 'pillar_neon', 'pillar_neon_blue', 'filing_cabinet', 'water_cooler',
      'printer_station', 'router', 'ups', 'meeting_table', 'crate', 'kiosk_hr', 'kiosk_edu', 'it_shelf', 'cubicle_wall'],
    tiles: ['floor_tile', 'wall_face', 'wall_face_alt', 'wall_top'],
    fx: ['player_ring'],
    ui: ['coin_token', 'quest_marker', 'item_box'],
    enemy: ['guard_front', 'cultist_front'],
  };
  const NAMES = Object.entries(MANIFEST).flatMap(([dir, names]) => names.map(n => [n, `${dir}/${n}`]));
  const map = new Map();
  const off = /[?&]noart\b/.test(location.search);
  // two art directions live side by side: assets/gen/painted/… and assets/gen/pixel/…
  const STYLES = ['painted'];
  // the painted direction is chosen; the pixel set lives in archive/art/pixel (not loaded)
  const style = 'painted';

  // crop to the opaque bounding box and key out a flat magenta background if the generator used one
  function prepare(img, name) {
    const a = { img, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    if (name === 'floor_tile') return a;
    try {
      const c = EJ.canvas(a.w, a.h), g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, a.w, a.h), px = d.data;
      let keyed = false, minX = a.w, minY = a.h, maxX = -1, maxY = -1;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 235 && px[i + 1] < 30 && px[i + 2] > 235) { px[i + 3] = 0; keyed = true; }
        if (px[i + 3] > 24) { const p = i / 4, x = p % a.w, y = (p / a.w) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (keyed) { g.putImageData(d, 0, 0); a.img = c; }
      if (maxX > minX && maxY > minY) Object.assign(a, { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    } catch (e) { /* file:// canvases are tainted — use the image as is */ }
    return a;
  }

  function load() {
    if (off) return EJ.brand.load();
    return Promise.all([EJ.brand.load(), ...NAMES.map(([name, file]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { map.set(name, prepare(img, name)); res(); };
      img.onerror = () => res();
      img.src = `assets/gen/${style}/${file}.png`;
    }))]);
  }
  const PROP_ART = {
    desk: p => (p.laptop ? 'desk_503' : 'desk_pc'), plant: () => 'plant', sofa: () => 'sofa', vending: () => 'coffee_machine',
    rack: () => 'server_rack', pillar: () => 'pillar_neon', cabinet: () => 'filing_cabinet', cooler: () => 'water_cooler',
    printer: () => 'printer_station', router: () => 'router', ups: () => 'ups', mtable: () => 'meeting_table', crate: () => 'crate',
    kiosk: p => (p.camp === 'hr' ? 'kiosk_hr' : 'kiosk_edu'), itshelf: () => 'it_shelf',
  };
  const pillarNight = G => !!G && (!!G.overtime || G.nightTarget > 0);
  const pillarColor = G => pillarNight(G) ? '#ff2d55' : '#3a8bff';
  const forProp = (p, G) => {
    if (p.kind === 'pillar') return map.get(pillarNight(G) ? 'pillar_neon' : 'pillar_neon_blue') || null;
    if (p.kind === 'secdoor') return map.get(G && G.patrol && p.openT > 0 ? 'security_door_open' : 'security_door') || map.get('security_door') || null;
    const f = PROP_ART[p.kind]; return f ? map.get(f(p)) || null : null;
  };
  function setStyle(next) {
    try { localStorage.setItem('enikey-journey.style', next); } catch (e) { /* storage blocked */ }
    const url = new URL(location.href); url.searchParams.delete('style'); location.href = url.toString();
  }
  return { load, forProp, pillarNight, pillarColor, style, STYLES, setStyle, get: name => map.get(name) || null, has: name => map.has(name), names: () => [...map.keys()] };
})();
