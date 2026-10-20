/* Enikey Journey — core: namespace, math, pixel drawing primitives, input. */
'use strict';
const EJ = (window.EJ = {});

// ---------------------------------------------------------------- math
EJ.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
EJ.lerp = (a, b, t) => a + (b - a) * t;
EJ.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
EJ.norm = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
EJ.approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
EJ.ease = t => 1 - Math.pow(1 - t, 3);

// Seeded RNG (mulberry32) — levels are reproducible per seed.
EJ.makeRng = seed => {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return r;
};
EJ.rand = EJ.makeRng((Date.now() ^ 0x5bd1e995) >>> 0);

// ---------------------------------------------------------------- isometry
// World unit = one tile. A tile is 32×16 scene pixels.
EJ.TW = 32; EJ.TH = 16;
EJ.isoX = (x, y) => (x - y) * 16;
EJ.isoY = (x, y, z = 0) => (x + y) * 8 - z;
EJ.unIso = (sx, sy) => { const a = sx / 16, b = sy / 8; return [(a + b) / 2, (b - a) / 2]; };

// ---------------------------------------------------------------- crisp pixel primitives
// Canvas polygons are anti-aliased; scanline fills keep a clean pixel-art edge.
EJ.poly = (ctx, pts, color) => {
  let minY = Infinity, maxY = -Infinity;
  const n = pts.length;
  for (let i = 1; i < n; i += 2) { if (pts[i] < minY) minY = pts[i]; if (pts[i] > maxY) maxY = pts[i]; }
  ctx.fillStyle = color;
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < n; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % n], by = pts[(i + 3) % n];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        const x = ax + ((yc - ay) / (by - ay)) * (bx - ax);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    if (xr > xl) { const a = Math.round(xl), b = Math.round(xr); if (b > a) ctx.fillRect(a, y, b - a, 1); }
  }
};

EJ.line = (ctx, x0, y0, x1, y1, color) => {
  ctx.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4000; guard++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};

// Iso box: x,y = min corner in tiles, w along x, d along y, z/h in pixels.
// colors: { top, l (+y face, lower-left), r (+x face, lower-right), edge? }
EJ.box = (ctx, ox, oy, x, y, w, d, z, h, c) => {
  const P = (X, Y, Z) => [ox + (X - Y) * 16, oy + (X + Y) * 8 - Z];
  const a = P(x, y + d, z), b = P(x + w, y + d, z), e = P(x + w, y, z);
  const at = P(x, y + d, z + h), bt = P(x + w, y + d, z + h), et = P(x + w, y, z + h), ft = P(x, y, z + h);
  if (h > 0) {
    EJ.poly(ctx, [...a, ...b, ...bt, ...at], c.l);
    EJ.poly(ctx, [...b, ...e, ...et, ...bt], c.r);
  }
  EJ.poly(ctx, [...ft, ...et, ...bt, ...at], c.top);
  if (c.edge) {
    EJ.line(ctx, at[0], at[1], bt[0], bt[1], c.edge);
    EJ.line(ctx, bt[0], bt[1], et[0], et[1], c.edge);
  }
  return { a, b, e, at, bt, et, ft };
};

// Iso ellipse on the ground plane (radius in tiles). Drawn as a vector path so it stays smooth on the
// high-resolution scene; `ring` > 0 strokes an outline of that thickness instead of filling.
EJ.groundEllipse = (ctx, cx, cy, r, color, ring = 0) => {
  const rx = r * 22.6, ry = r * 11.3;
  if (rx <= 0.5) return;
  ctx.beginPath();
  if (ring > 0) {
    ctx.ellipse(cx, cy, Math.max(0.5, rx - ring / 2), Math.max(0.5, ry - ring / 2), 0, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = ring; ctx.stroke();
  } else {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  }
};

EJ.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// Cached soft radial light sprites by color.
const lightCache = new Map();
EJ.lightSprite = color => {
  let c = lightCache.get(color);
  if (c) return c;
  c = EJ.canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color.replace(/[\d.]+\)$/, m => (parseFloat(m) * 0.45).toFixed(3) + ')'));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  lightCache.set(color, c);
  return c;
};
EJ.rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------- input
EJ.input = (() => {
  const down = new Set(), pressed = new Set();
  const mouse = { x: -1, y: -1, down: false, right: false, clicked: false, rclicked: false, moved: false, over: false };
  const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  addEventListener('keydown', e => {
    if (block.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); mouse.down = mouse.right = false; });
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });
  addEventListener('mousedown', e => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
    if (e.button === 2) { mouse.right = true; mouse.rclicked = true; }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  return {
    down, mouse,
    held: (...codes) => codes.some(c => down.has(c)),
    hit: (...codes) => codes.some(c => pressed.has(c)),
    endFrame() { pressed.clear(); mouse.clicked = mouse.rclicked = false; },
  };
})();
