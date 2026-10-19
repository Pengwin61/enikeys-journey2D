/* Enikey Journey — floor generation (rooms + corridors), props, baking of floor/wall art, collision. */
'use strict';
(() => {
  const WALL_H = 50, LOW_H = 12, CELL = 15, MARGIN = 3;
  const { box, poly, line, canvas, lightSprite, rgba } = EJ;

  // ================================================================ generation
  function generate(floorIdx, seed) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const L = tryGenerate(floorIdx, seed + attempt * 7919);
      if (L) return L;
    }
    throw new Error('level generation failed');
  }

  // Room types: start (ряд 7 / open space), office, print, meeting, server, kitchen, lift, boss, lobby, hall, throne
  function tryGenerate(floorIdx, seed) {
    const rng = EJ.makeRng(seed);
    const theme = EJ.FLOORS[floorIdx];
    const penthouse = theme.key === 'penthouse';
    const GC = 4, GR = 4;
    const W = GC * CELL + MARGIN * 2, H = GR * CELL + MARGIN * 2;
    const pathLen = penthouse ? 4 : 6;

    const key = (x, y) => x + ',' + y;
    const taken = new Map();
    let cur = [rng.int(0, GC - 1), rng.int(0, GR - 1)];
    const path = [cur]; taken.set(key(...cur), 0);
    const edges = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const freeNbrs = c => rng.shuffle(dirs.slice()).map(([dx, dy]) => [c[0] + dx, c[1] + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < GC && y < GR && !taken.has(key(x, y)));
    while (path.length < pathLen) {
      const opts = freeNbrs(cur);
      if (!opts.length) return null;
      cur = opts[0];
      taken.set(key(...cur), path.length);
      edges.push([path.length - 1, path.length]);
      path.push(cur);
    }
    const cells = path.slice();
    const branches = penthouse ? 0 : 3;
    for (let b = 0; b < branches; b++) {
      let placed = false;
      for (const ci of rng.shuffle(cells.map((_, i) => i).slice(1))) {
        const opts = freeNbrs(cells[ci]);
        if (!opts.length) continue;
        taken.set(key(...opts[0]), cells.length);
        edges.push([ci, cells.length]);
        cells.push(opts[0]);
        placed = true; break;
      }
      if (!placed) return null;
    }

    // assign room types
    const types = [];
    if (penthouse) types.push('lobby', 'hall', 'hall', 'throne');
    else {
      types.push('start');
      const pool = rng.shuffle(['office', 'print', 'meeting', 'server', 'kitchen', 'office', 'server', 'print']);
      for (let i = 1; i < cells.length; i++) types.push(pool[(i - 1) % pool.length]);
      types[pathLen - 1] = 'lift';
      if (theme.boss === 'hydra') types[pathLen - 2] = 'boss';
      // guarantee every device type exists on the floor
      for (const need of ['office', 'print', 'meeting', 'server', 'kitchen']) {
        if (types.includes(need)) continue;
        const i = types.findIndex((t, k) => k > 0 && ['office', 'print', 'meeting', 'server', 'kitchen'].includes(t) && types.filter(x => x === t).length > 1);
        if (i < 0) return null;
        types[i] = need;
      }
    }

    const L = {
      floorIdx, theme, seed, w: W, h: H,
      tiles: new Uint8Array(W * H), wallH: new Uint8Array(W * H), roomAt: new Int16Array(W * H).fill(-1),
      rooms: [], doors: [], props: [], walls: [],
    };
    const idx = (x, y) => y * W + x;
    L.idx = idx;

    cells.forEach(([gx, gy], i) => {
      const type = types[i];
      let rw, rh;
      if (type === 'start' || type === 'boss' || type === 'throne') rw = rh = type === 'start' ? 12 : 13;
      else if (type === 'lift' || type === 'lobby') { rw = rng.int(7, 8); rh = rng.int(7, 8); }
      else { rw = rng.int(8, 11); rh = rng.int(8, 11); }
      const ccx = MARGIN + gx * CELL + (CELL >> 1), ccy = MARGIN + gy * CELL + (CELL >> 1);
      const jit = rw >= 12 ? 0 : 1;
      const x = ccx - (rw >> 1) + rng.int(-jit, jit), y = ccy - (rh >> 1) + rng.int(-jit, jit);
      L.rooms.push({ id: i, type, gx, gy, x, y, w: rw, h: rh, ccx, ccy, cx: x + rw / 2, cy: y + rh / 2, doors: [], links: [], visited: i === 0, cleared: true, active: false, sealed: false });
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) { L.tiles[idx(xx, yy)] = 1; L.roomAt[idx(xx, yy)] = i; }
    });
    for (const [a, b] of edges) {
      const A = L.rooms[a], B = L.rooms[b];
      A.links.push(b); B.links.push(a);
      if (A.gy === B.gy) {
        const [P, Q] = A.gx < B.gx ? [A, B] : [B, A];
        const cy = P.ccy;
        for (let x = P.x + P.w; x < Q.x; x++) for (let y = cy - 1; y <= cy + 1; y++) L.tiles[idx(x, y)] = 1;
        for (let y = cy - 1; y <= cy + 1; y++) { addDoor(L, P, P.x + P.w, y, 'e'); addDoor(L, Q, Q.x - 1, y, 'w'); }
      } else {
        const [P, Q] = A.gy < B.gy ? [A, B] : [B, A];
        const cx = P.ccx;
        for (let y = P.y + P.h; y < Q.y; y++) for (let x = cx - 1; x <= cx + 1; x++) L.tiles[idx(x, y)] = 1;
        for (let x = cx - 1; x <= cx + 1; x++) { addDoor(L, P, x, P.y + P.h, 's'); addDoor(L, Q, x, Q.y - 1, 'n'); }
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (L.tiles[idx(x, y)]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && L.tiles[idx(nx, ny)] === 1) { near = true; break; }
      }
      if (!near) continue;
      L.tiles[idx(x, y)] = 2;
      const f = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < W && ny < H && L.tiles[idx(nx, ny)] === 1; };
      L.wallH[idx(x, y)] = f(1, 0) || f(0, 1) || f(1, 1) ? WALL_H : LOW_H;
    }

    if (!furnish(L, rng)) return null;
    if (!validate(L)) return null;
    return L;
  }

  function addDoor(L, room, x, y, side) {
    const d = { x, y, room: room.id, side, locked: false, t: 0 };
    room.doors.push(d); L.doors.push(d);
  }

  // ================================================================ props
  // device: what kind of ticket can be bound to the prop
  const PROP = {
    desk: { w: 1.8, d: 0.9, h: 11, solid: true, tall: false, device: 'pc' },
    rack: { w: 0.9, d: 0.9, h: 46, solid: true, tall: true, device: 'rack' },
    pillar: { w: 1, d: 1, h: 58, solid: true, tall: true },
    plant: { w: 0.55, d: 0.55, h: 8, solid: true, tall: false },
    cabinet: { w: 0.7, d: 0.6, h: 26, solid: true, tall: true, device: 'cabinet' },
    cooler: { w: 0.45, d: 0.45, h: 18, solid: true, tall: false },
    vending: { w: 1.1, d: 0.7, h: 40, solid: true, tall: true, device: 'coffee' },
    printer: { w: 0.9, d: 0.7, h: 16, solid: true, tall: false, device: 'printer' },
    router: { w: 0.5, d: 0.5, h: 20, solid: true, tall: false, device: 'router' },
    ups: { w: 0.7, d: 0.7, h: 22, solid: true, tall: true, device: 'ups' },
    mtable: { w: 2.6, d: 1.4, h: 10, solid: true, tall: false, device: 'projector' },
    elevator: { w: 2, d: 0.45, h: 52, solid: true, tall: true },
    crate: { w: 0.75, d: 0.75, h: 11, solid: true, tall: false },
    sofa: { w: 1.6, d: 0.7, h: 9, solid: true, tall: false },
    throne: { w: 1.6, d: 1.0, h: 44, solid: true, tall: true },
    kiosk: { w: 0.7, d: 0.6, h: 14, solid: true, tall: false },
    itshelf: { w: 1.6, d: 0.6, h: 20, solid: true, tall: false },
  };

  function furnish(L, rng) {
    const W = L.w, idx = L.idx;
    const reserved = new Uint8Array(W * L.h);
    const occ = new Uint8Array(W * L.h);

    for (const R of L.rooms) {
      for (const d of R.doors) {
        if (d.side === 'e' || d.side === 'w') for (let x = R.x; x < R.x + R.w; x++) { if ((d.side === 'e' && x >= R.ccx - 1) || (d.side === 'w' && x <= R.ccx + 1)) reserved[idx(x, d.y)] = 1; }
        else for (let y = R.y; y < R.y + R.h; y++) { if ((d.side === 's' && y >= R.ccy - 1) || (d.side === 'n' && y <= R.ccy + 1)) reserved[idx(d.x, y)] = 1; }
      }
      for (let y = R.ccy - 1; y <= R.ccy + 1; y++) for (let x = R.ccx - 1; x <= R.ccx + 1; x++) reserved[idx(x, y)] = 1;

      const free = (x, y, w, h) => {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
          if (xx < R.x || yy < R.y || xx >= R.x + R.w || yy >= R.y + R.h) return false;
          if (reserved[idx(xx, yy)] || occ[idx(xx, yy)]) return false;
        }
        return true;
      };
      const put = (kind, tx, ty, tw, th, ox = 0, oy = 0, extra = {}) => {
        if (!free(tx, ty, tw, th)) return null;
        for (let yy = ty; yy < ty + th; yy++) for (let xx = tx; xx < tx + tw; xx++) occ[idx(xx, yy)] = 1;
        const p = { kind, x: tx + ox, y: ty + oy, ...PROP[kind], room: R.id, ...extra };
        L.props.push(p);
        return p;
      };
      const center = (kind, tx, ty, tw, th, extra) => put(kind, tx, ty, tw, th, (tw - PROP[kind].w) / 2, (th - PROP[kind].d) / 2, extra);
      const corners = (kinds, p = 0.6) => { for (const [dx, dy] of [[0, 0], [R.w - 1, 0], [0, R.h - 1], [R.w - 1, R.h - 1]]) if (rng.chance(p)) center(rng.pick(kinds), R.x + dx, R.y + dy, 1, 1); };
      const alongBack = (kinds, p) => { for (let x = R.x; x < R.x + R.w; x++) if (rng.chance(p)) center(rng.pick(kinds), x, R.y, 1, 1); };
      const deskRows = (p, opts = {}) => {
        for (let ty = R.y + (opts.top ?? 1); ty < R.y + R.h - 1; ty += 2) for (let tx = R.x + 1; tx < R.x + R.w - 2; tx += 3) {
          if (opts.keepCenter && Math.abs(tx + 1 - R.cx) < 3.5 && Math.abs(ty + 0.5 - R.cy) < 3) continue;
          if (rng.chance(p)) center('desk', tx, ty, 2, 1, { monitors: rng.chance(0.3) ? 2 : 1 });
        }
      };

      switch (R.type) {
        case 'start': {
          // Ряд 7: desk rows around an open centre (the night-duty arena on floor 1)
          deskRows(0.9, { keepCenter: true });
          const desks = L.props.filter(p => p.room === R.id && p.kind === 'desk');
          desks.sort((a, b) => EJ.dist(a.x + 0.9, a.y + 0.45, R.cx, R.cy + 2) - EJ.dist(b.x + 0.9, b.y + 0.45, R.cx, R.cy + 2));
          if (desks.length < 2) return false;
          R.desk503 = desks[0]; desks[0].seat = 503; desks[0].monitors = 0; desks[0].laptop = true; desks[0].device = null;
          R.desk200 = desks[desks.length > 3 ? 3 : 1]; R.desk200.seat = 200; R.desk200.device = null;
          // camp stations of ряд 7: HR (vacation), learning (courses), IT-шкаф (shop)
          const station = (kind, extra) => {
            for (let x = R.x + 1; x < R.x + R.w - 2; x++) { const p = put(kind, x, R.y, kind === 'itshelf' ? 2 : 1, 1, kind === 'itshelf' ? 0.2 : 0.15, 0.1, extra); if (p) return p; }
            for (let y = R.y + 1; y < R.y + R.h - 2; y++) { const p = put(kind, R.x, y, kind === 'itshelf' ? 2 : 1, 1, 0.15, 0.2, extra); if (p) return p; }
            return null;
          };
          R.hr = station('kiosk', { camp: 'hr' });
          R.learn = station('kiosk', { camp: 'learn' });
          R.shelf = station('itshelf', { camp: 'shop' });
          if (!R.hr || !R.learn || !R.shelf) return false;
          corners(['plant', 'cooler'], 0.8);
          break;
        }
        case 'office': deskRows(0.65); alongBack(['cabinet', 'rack', 'printer'], 0.2); corners(['plant', 'cooler'], 0.6); break;
        case 'print': {
          for (let k = 0; k < 3; k++) center('printer', R.x + 1 + k * 3, R.y, 1, 1);
          alongBack(['cabinet'], 0.5);
          center('router', R.x + R.w - 1, R.y + 1, 1, 1);
          for (let n = 0; n < 5; n++) center(rng.pick(['crate', 'cabinet', 'printer']), rng.int(R.x, R.x + R.w - 1), rng.int(R.y + 2, R.y + R.h - 1), 1, 1);
          corners(['plant'], 0.5);
          break;
        }
        case 'meeting': {
          const t = put('mtable', R.ccx - 1, R.ccy - 3 > R.y ? R.ccy - 3 : R.y + 1, 3, 2, 0.2, 0.3);
          if (!t) put('mtable', R.x + 1, R.y + 1, 3, 2, 0.2, 0.3);
          alongBack(['cabinet', 'plant'], 0.3);
          center('router', R.x, R.y + R.h - 1, 1, 1);
          corners(['plant', 'sofa'], 0.5);
          break;
        }
        case 'server': {
          for (let ty = R.y + 1; ty < R.y + R.h - 1; ty += 3) for (let tx = R.x + 1; tx < R.x + R.w - 1; tx++) if (rng.chance(0.65)) center('rack', tx, ty, 1, 1);
          center('ups', R.x, R.y, 1, 1); center('ups', R.x + R.w - 1, R.y, 1, 1);
          center('router', R.x, R.y + R.h - 1, 1, 1);
          break;
        }
        case 'kitchen': {
          put('vending', R.x + 1, R.y, 2, 1, 0.45, 0.05) || put('vending', R.x + R.w - 3, R.y, 2, 1, 0.45, 0.05);
          center('cooler', R.x + 4, R.y, 1, 1);
          center('sofa', R.x + R.w - 2, R.y + R.h - 1, 2, 1);
          put('mtable', R.x + 1, R.y + R.h - 3, 3, 2, 0.2, 0.3, { device: null, kitchen: true });
          corners(['plant'], 0.6);
          break;
        }
        case 'lift': {
          R.elevator = put('elevator', R.x + 1, R.y, 2, 1, 0, 0.02) || put('elevator', R.x + R.w - 3, R.y, 2, 1, 0, 0.02);
          if (!R.elevator) return false;
          L.elevator = R.elevator;
          corners(['plant'], 0.9);
          break;
        }
        case 'boss': {
          for (const [dx, dy] of [[3, 3], [R.w - 4, 3], [3, R.h - 4], [R.w - 4, R.h - 4]]) put('pillar', R.x + dx, R.y + dy, 1, 1);
          alongBack(['cabinet', 'plant'], 0.4);
          break;
        }
        case 'lobby': {
          R.elevator = put('elevator', R.x + 1, R.y, 2, 1, 0, 0.02) || put('elevator', R.x + R.w - 3, R.y, 2, 1, 0, 0.02);
          L.elevator = R.elevator;
          corners(['plant', 'sofa'], 0.9);
          break;
        }
        case 'hall': {
          for (const [dx, dy] of [[2, 2], [R.w - 3, 2], [2, R.h - 3], [R.w - 3, R.h - 3]]) put('pillar', R.x + dx, R.y + dy, 1, 1);
          corners(['plant'], 0.7);
          break;
        }
        case 'throne': {
          R.throne = put('throne', R.ccx - 1, R.y, 2, 1, 0.2, 0.0);
          for (const [dx, dy] of [[3, 3], [R.w - 4, 3], [3, R.h - 4], [R.w - 4, R.h - 4]]) put('pillar', R.x + dx, R.y + dy, 1, 1);
          break;
        }
      }
    }
    return true;
  }

  function validate(L) {
    const essential = p => ['elevator', 'throne'].includes(p.kind) || p.seat || p.camp;
    for (let pass = 0; pass < 50; pass++) {
      computeBlockGrid(L);
      const dist = bfs(L, Math.floor(L.rooms[0].cx), Math.floor(L.rooms[0].cy), true);
      let bad = null;
      for (const d of L.doors) if (dist[L.idx(d.x, d.y)] < 0) { bad = d; break; }
      // every device must be reachable from its front
      if (!bad) for (const p of L.props) {
        if (!p.device && !p.kind.match(/elevator|throne/) && !p.seat && !p.camp) continue;
        const fx = Math.floor(p.x + p.w / 2), fy = Math.floor(p.y + p.d + 0.6);
        if (fy >= L.h || L.block[L.idx(fx, fy)] || dist[L.idx(fx, fy)] < 0) {
          if (essential(p)) { bad = { x: fx, y: fy }; break; }
          p.device = null; // keep as decoration, just not a ticket target
        }
      }
      if (!bad) {
        let pocket = null;
        for (const R of L.rooms) for (let y = R.y; y < R.y + R.h && !pocket; y++) for (let x = R.x; x < R.x + R.w; x++) {
          const i = L.idx(x, y);
          if (!L.block[i] && dist[i] < 0) { pocket = { x, y }; break; }
        }
        if (!pocket) return true;
        bad = pocket;
      }
      let best = -1, bd = 1e9;
      L.props.forEach((p, i) => {
        if (essential(p)) return;
        const d = EJ.dist(p.x + p.w / 2, p.y + p.d / 2, bad.x + 0.5, bad.y + 0.5);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return false;
      L.props.splice(best, 1);
    }
    return false;
  }

  function computeBlockGrid(L) {
    L.propCells = new Map();
    for (const p of L.props) {
      if (!p.solid) continue;
      for (let y = Math.floor(p.y); y <= Math.floor(p.y + p.d); y++) for (let x = Math.floor(p.x); x <= Math.floor(p.x + p.w); x++) {
        const k = L.idx(x, y);
        if (!L.propCells.has(k)) L.propCells.set(k, []);
        L.propCells.get(k).push(p);
      }
    }
    L.block = new Uint8Array(L.w * L.h);
    for (let i = 0; i < L.tiles.length; i++) if (L.tiles[i] !== 1) L.block[i] = 1;
    for (const p of L.props) {
      if (!p.solid) continue;
      for (let y = Math.floor(p.y - 0.2); y <= Math.floor(p.y + p.d + 0.2); y++) for (let x = Math.floor(p.x - 0.2); x <= Math.floor(p.x + p.w + 0.2); x++) {
        if (x + 0.5 > p.x - 0.28 && x + 0.5 < p.x + p.w + 0.28 && y + 0.5 > p.y - 0.28 && y + 0.5 < p.y + p.d + 0.28) L.block[L.idx(x, y)] = 1;
      }
    }
  }

  function bfs(L, sx, sy, ignoreDoors, maxSteps = 1e9) {
    const dist = new Int16Array(L.w * L.h).fill(-1);
    const q = new Int32Array(L.w * L.h);
    let h = 0, t = 0;
    const s = L.idx(sx, sy);
    if (L.block[s]) return dist;
    dist[s] = 0; q[t++] = s;
    while (h < t) {
      const c = q[h++], cx = c % L.w, cy = (c / L.w) | 0, cd = dist[c];
      if (cd >= maxSteps) continue;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const n = ny * L.w + nx;
        if (dist[n] >= 0 || L.block[n]) continue;
        if (!ignoreDoors && L.doorLock && L.doorLock[n]) continue;
        dist[n] = cd + 1; q[t++] = n;
      }
    }
    return dist;
  }

  // Shortest tile path between two points (for the neon guide thread).
  function path(L, ax, ay, bx, by) {
    const dist = bfs(L, Math.floor(bx), Math.floor(by), false, 400);
    let x = Math.floor(ax), y = Math.floor(ay);
    if (dist[L.idx(x, y)] < 0) return null;
    const out = [[x + 0.5, y + 0.5]];
    for (let guard = 0; guard < 400 && dist[L.idx(x, y)] > 0; guard++) {
      let best = null, bv = dist[L.idx(x, y)];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = dist[L.idx(x + dx, y + dy)];
        if (v >= 0 && v < bv) { bv = v; best = [x + dx, y + dy]; }
      }
      if (!best) break;
      [x, y] = best;
      out.push([x + 0.5, y + 0.5]);
    }
    return out;
  }

  // ================================================================ baking
  function bake(L) {
    const theme = L.theme, idx = L.idx;
    const rng = EJ.makeRng(L.seed ^ 0xabcdef);
    const FOX = L.h * 16 + 24, FOY = WALL_H + 70;
    const CW = (L.w + L.h) * 16 + 48, CH = (L.w + L.h) * 8 + FOY + 40;
    L.FOX = FOX; L.FOY = FOY;
    const floor = canvas(CW, CH), glow = canvas(CW, CH);
    const fc = floor.getContext('2d'), gc = glow.getContext('2d');
    L.floorCanvas = floor; L.glowCanvas = glow;
    const P = (x, y, z = 0) => [FOX + (x - y) * 16, FOY + (x + y) * 8 - z];

    // ---- floor tiles
    const styleOf = (x, y) => {
      const r = L.roomAt[idx(x, y)];
      if (r < 0) return 'corridor';
      const R = L.rooms[r];
      if (R.type === 'boss' || R.type === 'throne' || R.type === 'hall' || R.type === 'lobby') return 'marble';
      if (R.type === 'start' || R.type === 'office') return theme.key === 'dev' ? 'carpet' : 'carpet2';
      if (R.type === 'server') return 'grate';
      if (R.type === 'meeting') return 'carpet';
      return 'tile';
    };
    const PALETTE = {
      tile: ['#191b27', '#1b1e2b', '#12131c'],
      carpet: ['#1c1726', '#1e1929', '#18131f'],
      carpet2: ['#171a26', '#181b28', '#141621'],
      grate: ['#14171e', '#161a22', '#0d0f14'],
      marble: ['#120e15', '#141017', '#0b080d'],
      corridor: ['#15161f', '#171823', '#0f1017'],
    };
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (L.tiles[idx(x, y)] !== 1) continue;
      const st = styleOf(x, y), pal = PALETTE[st];
      const [sx, sy] = P(x, y);
      const base = ((x + y) & 1) && st !== 'carpet' && st !== 'carpet2' ? pal[1] : pal[0];
      for (let r = 0; r < 16; r++) {
        const hw = r < 8 ? (r + 1) * 2 : (16 - r) * 2;
        fc.fillStyle = base; fc.fillRect(sx - hw, sy + r, hw * 2, 1);
        if (st === 'tile' || st === 'corridor' || st === 'marble') {
          if (r < 8) { fc.fillStyle = pal[2]; fc.fillRect(sx - hw, sy + r, 2, 1); fc.fillRect(sx + hw - 2, sy + r, 2, 1); }
        }
      }
      if (st === 'grate') {
        fc.fillStyle = pal[2];
        for (let k = 2; k < 14; k += 3) { const hw = k < 8 ? (k + 1) * 2 : (16 - k) * 2; fc.fillRect(sx - hw + 3, sy + k, hw * 2 - 6, 1); }
      }
      if (st === 'carpet' || st === 'carpet2') {
        for (let n = 0; n < 7; n++) {
          const r = rng.int(1, 14), hw = r < 8 ? (r + 1) * 2 : (16 - r) * 2;
          fc.fillStyle = rng.chance(0.5) ? pal[1] : pal[2];
          fc.fillRect(Math.round(sx - hw + rng() * hw * 2), sy + r, 1, 1);
        }
      }
      if (st === 'marble' && rng.chance(0.25)) {
        fc.fillStyle = 'rgba(160,30,50,0.25)';
        let vx = sx - 8 + rng.int(0, 16), vy = sy + 4 + rng.int(0, 6);
        for (let k = 0; k < 9; k++) { fc.fillRect(vx, vy, 1, 1); vx += rng.int(-1, 2); vy += rng.int(0, 1) ? 1 : 0; }
      }
      // specks / grime
      if (rng.chance(0.35)) { fc.fillStyle = 'rgba(255,255,255,0.025)'; fc.fillRect(sx - 6 + rng.int(0, 12), sy + 4 + rng.int(0, 7), rng.int(2, 6), 1); }
    }

    // separate decal / light layers so painted floor tiles (assets/gen) can sit underneath them
    const layered = EJ.assets && EJ.assets.has('floor_tile');
    const decalCanvas = layered ? canvas(CW, CH) : floor, poolCanvas = layered ? canvas(CW, CH) : floor;
    const dc = decalCanvas.getContext('2d'), pc = poolCanvas.getContext('2d');
    if (layered) { L.decalCanvas = decalCanvas; L.poolCanvas = poolCanvas; }
    // ---- floor decals: papers, cables, stains
    for (const R of L.rooms) {
      const n = Math.floor(R.w * R.h / 9);
      for (let i = 0; i < n; i++) {
        const x = R.x + rng() * R.w, y = R.y + rng() * R.h;
        const [sx, sy] = P(x, y);
        const k = rng();
        if (k < 0.45) { // paper sheet
          const a = rng() * Math.PI;
          const c = Math.cos(a) * 3, s = Math.sin(a) * 1.5;
          poly(dc, [sx - c, sy - s - 1, sx + s * 2, sy - c * 0.5, sx + c, sy + s + 1, sx - s * 2, sy + c * 0.5], rng.chance(0.8) ? '#4b4d5c' : '#6a6d7d');
        } else if (k < 0.7) { // cable
          dc.fillStyle = '#0a0b10';
          let cx = sx, cy = sy, dir = rng.chance(0.5) ? 1 : -1;
          for (let s = 0; s < 40; s++) { dc.fillRect(Math.round(cx), Math.round(cy), 2, 1); cx += dir * 2; cy += 1 + (rng() - 0.5) * 0.6; if (rng.chance(0.08)) dir = -dir; }
        } else if (k < 0.85) { // dark stain
          dc.fillStyle = rng.chance(0.4) ? 'rgba(90,10,20,0.35)' : 'rgba(0,0,0,0.3)';
          EJ.groundEllipse(dc, sx, sy, 0.25 + rng() * 0.35, dc.fillStyle);
        } else if (L.floorIdx !== 1) { // warning stripe patch
          dc.fillStyle = 'rgba(255,190,40,0.08)';
          for (let s = 0; s < 6; s++) dc.fillRect(sx - 8 + s * 3, sy + s, 2, 1);
        }
      }
    }
    // corp crown sigil on start + boss floors (emissive)
    for (const R of L.rooms) {
      if (R.type !== 'boss' && R.type !== 'throne') continue;
      const [sx, sy] = P(R.cx, R.cy);
      const col = R.type === 'boss' ? theme.accent : rgba(theme.accent, 0.5);
      for (const [r, ring] of [[R.type === 'boss' ? 4.6 : 2.2, 1], [R.type === 'boss' ? 4.0 : 1.9, 1]]) {
        EJ.groundEllipse(dc, sx, sy, r, rgba(theme.accent, R.type === 'boss' ? 0.55 : 0.25), ring);
        EJ.groundEllipse(gc, sx, sy, r, rgba(theme.accent, R.type === 'boss' ? 0.5 : 0.2), ring);
      }
      if (R.type === 'boss') drawCrownFloor(dc, gc, sx, sy, col);
    }

    // ---- light pools from monitors etc. added below with props; wall neon here
    const pools = [];
    // ---- walls
    const wallTiles = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.tiles[idx(x, y)] === 2) wallTiles.push({ x, y, h: L.wallH[idx(x, y)] });
    wallTiles.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
    const wallCanvas = canvas(CW, CH), wc = wallCanvas.getContext('2d');
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && L.tiles[idx(x, y)] === 1;
    for (const t of wallTiles) {
      const tall = t.h === WALL_H;
      const c = tall ? theme.wall : { top: '#262838', l: '#161722', r: '#12131b' };
      box(wc, FOX, FOY, t.x, t.y, 1, 1, 0, t.h, c);
      if (tall) {
        // faces: seams, baseboard, trim
        const faceY = isFloor(t.x, t.y + 1), faceX = isFloor(t.x + 1, t.y);
        const [lx, ly] = P(t.x, t.y + 1), [bx, by] = P(t.x + 1, t.y + 1), [rx, ry] = P(t.x + 1, t.y);
        line(wc, lx, ly - 4, bx, by - 4, '#0f1018');
        line(wc, bx, by - 4, rx, ry - 4, '#0c0d14');
        line(wc, lx, ly - t.h + 3, bx, by - t.h + 3, theme.wall.trim);
        line(wc, bx, by - t.h + 3, rx, ry - t.h + 3, theme.wall.trim);
        wc.fillStyle = 'rgba(0,0,0,0.25)'; wc.fillRect(bx, by - t.h + 1, 1, t.h - 1);
        if (((t.x * 7 + t.y * 13) % 2) === 0) { wc.fillStyle = 'rgba(255,255,255,0.025)'; wc.fillRect(lx + 8, ly + 4 - t.h + 6, 1, t.h - 12); }
        // top edge highlight
        const [tx0, ty0] = P(t.x, t.y + 1, t.h), [tx1, ty1] = P(t.x + 1, t.y + 1, t.h), [tx2, ty2] = P(t.x + 1, t.y, t.h);
        line(wc, tx0, ty0, tx1, ty1, '#2d3044'); line(wc, tx1, ty1, tx2, ty2, '#262838');
        t.faceY = faceY; t.faceX = faceX;
      } else {
        const [tx0, ty0] = P(t.x, t.y + 1, t.h), [tx1, ty1] = P(t.x + 1, t.y + 1, t.h), [tx2, ty2] = P(t.x + 1, t.y, t.h);
        line(wc, tx0, ty0, tx1, ty1, '#3a3d52'); line(wc, tx1, ty1, tx2, ty2, '#34374a');
      }
    }
    decorateWalls(L, wallTiles, wc, gc, pc, P, rng, pools);

    // ---- props: bake sprites, their glows into the static glow layer and light pools on floor
    for (const p of L.props) {
      bakeProp(p, theme, rng);
      const [sx, sy] = P(p.x, p.y);
      if (p.glowImg && !(EJ.assets && EJ.assets.forProp(p))) gc.drawImage(p.glowImg, sx + p.px, sy + p.py);
      if (p.light) pools.push([p.x + p.w / 2 + (p.lightOff?.[0] || 0), p.y + p.d / 2 + (p.lightOff?.[1] || 0.6), p.light, p.lightR || 1.6, p.lightA || 0.35]);
    }

    // ---- apply light pools (additive) on floor
    pc.globalCompositeOperation = 'lighter';
    for (const [x, y, col, r, a] of pools) {
      const [sx, sy] = P(x, y);
      const spr = lightSprite(EJ.rgba(col, a));
      const rw = r * 46, rh = r * 23;
      pc.drawImage(spr, sx - rw / 2, sy - rh / 2, rw, rh);
    }
    pc.globalCompositeOperation = 'source-over';
    if (layered) {
      // fallback floor (seen only where no painted tile lands) still gets everything
      fc.drawImage(decalCanvas, 0, 0);
      fc.globalCompositeOperation = 'lighter'; fc.drawImage(poolCanvas, 0, 0); fc.globalCompositeOperation = 'source-over';
    }

    // ---- slice walls into per-tile sprites so they depth-sort with actors
    for (const t of wallTiles) {
      const w = 34, h = 18 + t.h;
      const c = canvas(w, h), cx = c.getContext('2d');
      const [ox, oy] = P(t.x, t.y, t.h); // top corner of the box top
      const sx0 = ox - 17, sy0 = oy - 1;
      const pts = [...P(t.x, t.y, t.h), ...P(t.x + 1, t.y, t.h), ...P(t.x + 1, t.y, 0), ...P(t.x + 1, t.y + 1, 0), ...P(t.x, t.y + 1, 0), ...P(t.x, t.y + 1, t.h)].map((v, i) => v - (i % 2 ? sy0 : sx0));
      // crisp mask (same scanline rasteriser as the faces) → no seams between tiles
      poly(cx, pts, '#fff');
      cx.globalCompositeOperation = 'source-in';
      cx.drawImage(wallCanvas, -sx0, -sy0);
      L.walls.push({ x: t.x, y: t.y, tall: t.h === WALL_H, h: t.h, img: c, ox: sx0 - FOX, oy: sy0 - FOY, depth: t.x + t.y + 1, fade: 1 });
    }
    computeBlockGrid(L);
    L.doorLock = new Uint8Array(L.w * L.h);
  }

  function drawCrownFloor(fc, gc, sx, sy, col) {
    const pts = [[-16, 4], [-12, -6], [-6, 1], [0, -9], [6, 1], [12, -6], [16, 4]];
    for (const ctx of [fc, gc]) {
      ctx.fillStyle = col;
      for (let i = 0; i < pts.length - 1; i++) EJ.line(ctx, sx + pts[i][0], sy + pts[i][1], sx + pts[i + 1][0], sy + pts[i + 1][1], col);
      EJ.line(ctx, sx - 16, sy + 4, sx + 16, sy + 4, col);
    }
  }

  function faceCtx(ctx, kind, x0, y0) {
    // kind 'Y': face along +x (wall north of a room), u axis (1, .5); kind 'X': along -y, u axis (1, -.5)
    ctx.setTransform(1, kind === 'Y' ? 0.5 : -0.5, 0, 1, x0, y0);
  }

  function decorateWalls(L, wallTiles, wc, gc, fc, P, rng, pools) {
    const theme = L.theme;
    const tall = wallTiles.filter(t => t.h === WALL_H);
    const used = new Set();
    // runs of north walls (face Y) per row, and west walls (face X) per column
    const runs = [];
    const collect = (filter, keyA, keyB, kind) => {
      const list = tall.filter(filter).sort((a, b) => a[keyA] - b[keyA] || a[keyB] - b[keyB]);
      let run = [];
      for (const t of list) {
        const prev = run[run.length - 1];
        if (prev && prev[keyA] === t[keyA] && t[keyB] === prev[keyB] + 1) run.push(t);
        else { if (run.length) runs.push({ kind, tiles: kind === 'X' ? run.reverse() : run }); run = [t]; }
      }
      if (run.length) runs.push({ kind, tiles: kind === 'X' ? run.reverse() : run });
    };
    collect(t => t.faceY, 'y', 'x', 'Y');
    collect(t => t.faceX && !t.faceY, 'x', 'y', 'X');

    for (const run of runs) {
      const n = run.tiles.length;
      const t0 = run.tiles[0];
      // face origin (top-left of the face, in canvas coords)
      const origin = t => run.kind === 'Y' ? P(t.x, t.y + 1, WALL_H) : P(t.x + 1, t.y + 1, WALL_H);
      const [ox, oy] = origin(t0);
      const room = run.kind === 'Y' ? L.roomAt[L.idx(t0.x, t0.y + 1)] : L.roomAt[L.idx(t0.x + 1, t0.y)];
      const R = room >= 0 ? L.rooms[room] : null;

      // big sign in the middle of long runs
      let signFrom = -1, signLen = 0;
      if (R && n >= 5 && rng.chance(0.85)) {
        signLen = Math.min(n - 2, R.type === 'boss' ? 5 : rng.int(3, 4));
        signFrom = Math.floor((n - signLen) / 2);
        const sign = ['boss', 'start', 'throne', 'lobby', 'lift'].includes(R.type) ? ['NAXRAMUS'] : rng.pick(theme.signs);
        const uX = signFrom * 16, uW = signLen * 16;
        for (const ctx of [wc, gc]) {
          faceCtx(ctx, run.kind, ox, oy);
          if (sign[0] === 'NAXRAMUS') {
            if (ctx === wc) {
              ctx.fillStyle = '#4a0b18'; ctx.fillRect(uX + 2, 5, uW - 4, 38);
              ctx.fillStyle = '#360712';
              for (let k = uX + 6; k < uX + uW - 4; k += 7) ctx.fillRect(k, 5, 2, 38);
              ctx.fillStyle = '#5e0f20'; ctx.fillRect(uX + 2, 5, uW - 4, 2);
            }
            ctx.fillStyle = ctx === wc ? '#ff3355' : 'rgba(255,40,80,0.8)';
            const cxm = uX + uW / 2;
            // crown
            ctx.fillRect(cxm - 7, 16, 14, 3);
            for (const [dx, hh] of [[-7, 5], [-3, 4], [0, 7], [3, 4], [6, 5]]) ctx.fillRect(cxm + dx, 16 - hh, 1 + (dx === 0 ? 1 : 0), hh);
            ctx.font = 'bold 9px "Oswald", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('NAXRAMUS', cxm, 28); ctx.font = 'bold 6px "Oswald", sans-serif'; ctx.fillText('L A B S', cxm, 37);
          } else if (ctx === wc) {
            ctx.fillStyle = 'rgba(120,125,150,0.20)';
            ctx.font = 'bold 11px "Oswald", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const lh = Math.min(12, 38 / sign.length);
            sign.forEach((s, i) => ctx.fillText(s, uX + uW / 2, 25 - ((sign.length - 1) * lh) / 2 + i * lh));
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        if (sign[0] === 'NAXRAMUS') {
          const mid = run.tiles[signFrom + (signLen >> 1)];
          pools.push(run.kind === 'Y' ? [mid.x + 0.5, mid.y + 2, theme.accent, 3.2, 0.32] : [mid.x + 2, mid.y + 0.5, theme.accent, 3.2, 0.32]);
        }
        for (let i = signFrom; i < signFrom + signLen; i++) used.add(run.tiles[i]);
      }

      run.tiles.forEach((t, i) => {
        if (used.has(t)) return;
        const [fx, fy] = origin(t);
        const u0 = 0;
        const roll = (t.x * 31 + t.y * 17 + L.seed) % 7;
        if (i % 3 === 1 && roll !== 3) {
          // vertical neon strip
          for (const ctx of [wc, gc]) {
            faceCtx(ctx, run.kind, fx, fy);
            ctx.fillStyle = ctx === wc ? '#3a0a14' : 'rgba(0,0,0,0)';
            if (ctx === wc) ctx.fillRect(u0 + 6, 6, 4, WALL_H - 12);
            ctx.fillStyle = theme.accent; ctx.fillRect(u0 + 7, 7, 2, WALL_H - 14);
            if (ctx === wc) { ctx.fillStyle = '#ffd0da'; ctx.fillRect(u0 + 7, 9, 1, WALL_H - 18); }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          const g = run.kind === 'Y' ? [t.x + 0.5, t.y + 1.6] : [t.x + 1.6, t.y + 0.5];
          pools.push([...g, theme.accent, 1.9, 0.45]);
          // wet reflection streak
          const [px, py] = run.kind === 'Y' ? P(t.x + 0.5, t.y + 1) : P(t.x + 1, t.y + 0.5);
          fc.globalCompositeOperation = 'lighter';
          fc.fillStyle = rgba(theme.accent, 0.12); fc.fillRect(px - 1, py + 1, 2, 18);
          fc.fillStyle = rgba(theme.accent, 0.06); fc.fillRect(px - 2, py + 1, 4, 26);
          fc.globalCompositeOperation = 'source-over';
        } else if (roll === 3 && R) {
          // wall screen / dashboard
          for (const ctx of [wc, gc]) {
            faceCtx(ctx, run.kind, fx, fy);
            if (ctx === wc) { ctx.fillStyle = '#07080c'; ctx.fillRect(2, 12, 12, 10); }
            ctx.fillStyle = rgba(theme.accent2, ctx === wc ? 0.85 : 0.6); ctx.fillRect(3, 13, 10, 8);
            if (ctx === wc) {
              ctx.fillStyle = '#0b1a2a';
              for (let k = 0; k < 4; k++) ctx.fillRect(4, 14 + k * 2, 3 + ((k * 5 + t.x) % 6), 1);
              ctx.fillStyle = theme.accent; ctx.fillRect(10, 14, 2, 2);
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          const g = run.kind === 'Y' ? [t.x + 0.5, t.y + 1.5] : [t.x + 1.5, t.y + 0.5];
          pools.push([...g, theme.accent2, 1.3, 0.3]);
        } else if (roll === 5) {
          // vent
          faceCtx(wc, run.kind, fx, fy);
          wc.fillStyle = '#0d0e15'; wc.fillRect(3, 30, 10, 8);
          wc.fillStyle = '#25283a'; for (let k = 0; k < 4; k++) wc.fillRect(4, 31 + k * 2, 8, 1);
          wc.setTransform(1, 0, 0, 1, 0, 0);
        }
      });
    }
  }

  // ---------------------------------------------------------------- prop sprites
  function bakeProp(p, theme, rng) {
    const pad = 4, top = p.h + 26;
    const W = (p.w + p.d) * 16 + pad * 2, H = (p.w + p.d) * 8 + top + 4;
    const img = canvas(W, H), glow = canvas(W, H);
    const c = img.getContext('2d'), g = glow.getContext('2d');
    const ox = p.d * 16 + pad, oy = top;
    p.px = -ox; p.py = -oy; p.img = img; p.glowImg = null;
    let glowUsed = false;
    const G = fn => { fn(g); glowUsed = true; };
    const Pt = (x, y, z = 0) => [ox + (x - y) * 16, oy + (x + y) * 8 - z];
    const { w, d, h } = p;
    const A2 = theme.accent2, A = theme.accent;

    switch (p.kind) {
      case 'desk': {
        box(c, ox, oy, 0.05, 0.05, w - 0.1, d - 0.1, 0, h - 3, { top: '#1c1a24', l: '#1a1822', r: '#14131b' });
        box(c, ox, oy, 0, 0, w, d, h - 3, 3, { top: '#3a3446', l: '#2a2533', r: '#221e2a', edge: '#4a4458' });
        const n = p.laptop ? 0 : p.monitors || 1;
        if (p.laptop) {
          // место 503: the black laptop that opened by itself
          box(c, ox, oy, 0.55, 0.3, 0.6, 0.35, h, 1, { top: '#111117', l: '#0b0b10', r: '#09090d' });
          const s = box(c, ox, oy, 0.55, 0.24, 0.6, 0.06, h + 1, 9, { top: '#0e0e14', l: '#16161f', r: '#0b0b10' });
          const scr = [s.a[0] + 1, s.a[1] - 1, s.b[0] - 1, s.b[1] - 1, s.bt[0] - 1, s.bt[1] + 1, s.at[0] + 1, s.at[1] + 1];
          poly(c, scr, '#0a1a24');
          G(gg => poly(gg, scr, 'rgba(63,216,255,0.35)'));
          c.fillStyle = '#3fd8ff'; c.fillRect(Math.round(s.at[0] + 3), Math.round(s.at[1] + 4), 3, 1);
        }
        for (let m = 0; m < n; m++) {
          const mx = n === 1 ? 0.55 : 0.18 + m * 0.82;
          box(c, ox, oy, mx + 0.25, 0.22, 0.1, 0.1, h, 4, { top: '#111', l: '#16161d', r: '#0e0e13' });
          const s = box(c, ox, oy, mx, 0.12, 0.62, 0.08, h + 4, 12, { top: '#0e0f15', l: '#14151d', r: '#0b0c11' });
          // screen on +y face
          const scr = [s.a[0] + 1, s.a[1] - 2, s.b[0] - 1, s.b[1] - 2, s.bt[0] - 1, s.bt[1] + 1, s.at[0] + 1, s.at[1] + 1];
          const col = rng.chance(0.85) ? A2 : A;
          poly(c, scr, col);
          G(gg => poly(gg, scr, EJ.rgba(col, 0.9)));
          // UI lines on the screen
          c.fillStyle = 'rgba(5,10,25,0.55)';
          for (let k = 0; k < 4; k++) { const yy = s.at[1] + 3 + k * 2.4; c.fillRect(Math.round(s.at[0] + 3), Math.round(yy + k * 0.6), 4 + ((k * 3 + n) % 5), 1); }
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(Math.round(s.at[0] + 2), Math.round(s.at[1] + 2), 2, 1);
        }
        box(c, ox, oy, 0.5, 0.45, 0.6, 0.22, h, 1, { top: '#454a5e', l: '#2d3040', r: '#2a2d3b' });
        if (rng.chance(0.5)) box(c, ox, oy, 1.45, 0.4, 0.12, 0.12, h, 4, { top: '#d8d4cc', l: '#bdb8af', r: '#a49f97' });
        if (rng.chance(0.5)) box(c, ox, oy, 0.12, 0.45, 0.3, 0.25, h, 2, { top: '#b9bccb', l: '#8b8e9c', r: '#7d808e' });
        p.light = A2; p.lightR = 1.8; p.lightA = 0.42; p.lightOff = [0, 0.7];
        break;
      }
      case 'rack': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#20232e', l: '#14161e', r: '#101219', edge: '#2b2f3e' });
        const [ax, ay] = Pt(0, d), [bx, by] = Pt(w, d);
        p.leds = [];
        for (let row = 0; row < 8; row++) {
          const z = 6 + row * 5;
          line(c, ax + 2, ay - z, bx - 2, by - z, '#07080c');
          for (let k = 0; k < 3; k++) {
            const t = 0.2 + k * 0.25;
            const lx = Math.round(EJ.lerp(ax, bx, t)), ly = Math.round(EJ.lerp(ay, by, t) - z - 2);
            const col = rng.chance(0.25) ? A : rng.chance(0.5) ? '#4dff9a' : A2;
            p.leds.push([lx, ly, col, rng() * 10, 0.6 + rng() * 2.5]);
            c.fillStyle = '#0a0b10'; c.fillRect(lx, ly, 1, 1);
          }
        }
        // glowing blue panel down the side
        const [ex, ey] = Pt(w, 0), [fx, fy] = Pt(w, d);
        const strip = [fx - 3, fy - 6, ex + 0, ey - 6 + 1.5 - 3, ex + 0, ey - h + 6 - 1.5, fx - 3, fy - h + 6];
        line(c, fx - 4, fy - 6, fx - 4, fy - h + 6, '#060709');
        G(gg => { line(gg, ax + 1, ay - 3, ax + 1, ay - h + 4, EJ.rgba(A2, 0.7)); });
        line(c, ax + 1, ay - 3, ax + 1, ay - h + 4, A2);
        p.light = A2; p.lightR = 1.3; p.lightA = 0.22;
        void strip;
        break;
      }
      case 'pillar': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#1e2130', l: '#191b27', r: '#13141d', edge: '#2c3044' });
        const [ax, ay] = Pt(0.5, d), [bx, by] = Pt(w, 0.5);
        for (const ctx of [c, g]) {
          line(ctx, ax, ay - 4, ax, ay - h + 4, A);
          line(ctx, bx, by - 4, bx, by - h + 4, A);
        }
        c.fillStyle = '#ffd6de'; c.fillRect(ax, ay - h + 8, 1, h - 16);
        glowUsed = true;
        p.light = A; p.lightR = 2.2; p.lightA = 0.4;
        break;
      }
      case 'plant': {
        box(c, ox, oy, 0.08, 0.08, 0.4, 0.4, 0, h, { top: '#1a1414', l: '#4a3a46', r: '#3a2d38', edge: '#5e4c5a' });
        const [cx0, cy0] = Pt(w / 2, d / 2, h + 2);
        const greens = ['#16382a', '#1f4d35', '#2c6a45', '#3f8a55'];
        for (let i = 0; i < 26; i++) {
          const a = rng() * Math.PI * 2, r = rng() * 7;
          const lx = cx0 + Math.cos(a) * r * 1.2, ly = cy0 - 4 - rng() * 14 + Math.sin(a) * r * 0.4;
          c.fillStyle = greens[Math.min(3, Math.floor((cy0 - ly) / 5) + rng.int(0, 1))];
          c.fillRect(Math.round(lx), Math.round(ly), rng.int(2, 3), rng.int(1, 3));
          if (rng.chance(0.3)) { c.fillRect(Math.round(lx + Math.cos(a) * 3), Math.round(ly + 1), 2, 1); }
        }
        break;
      }
      case 'cabinet': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#3a3f50', l: '#2b2f3d', r: '#22252f', edge: '#4c5266' });
        const [ax, ay] = Pt(0, d), [bx, by] = Pt(w, d);
        for (let k = 1; k < 3; k++) { const z = (h / 3) * k; line(c, ax + 1, ay - z, bx - 1, by - z, '#1a1c25'); }
        for (let k = 0; k < 3; k++) { const z = (h / 3) * k + h / 6; const mx = (ax + bx) / 2, my = (ay + by) / 2; c.fillStyle = '#8890a8'; c.fillRect(Math.round(mx - 1), Math.round(my - z), 3, 1); }
        break;
      }
      case 'cooler': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#d5d7e0', l: '#a9acba', r: '#8f92a0' });
        box(c, ox, oy, 0.06, 0.06, 0.33, 0.33, h, 12, { top: '#7fd0ff', l: '#3c8fd0', r: '#2f74ad' });
        const [sx, sy] = Pt(0.2, d, 10);
        c.fillStyle = '#ff3355'; c.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        c.fillStyle = '#3fd8ff'; c.fillRect(Math.round(sx + 3), Math.round(sy + 1), 1, 1);
        break;
      }
      case 'vending': {
        const s = box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#2a1d30', l: '#1b1220', r: '#140d18', edge: '#3a2944' });
        const panel = [s.a[0] + 2, s.a[1] - 4, s.b[0] - 6, s.b[1] - 4, s.bt[0] - 6, s.bt[1] + 4, s.at[0] + 2, s.at[1] + 4];
        poly(c, panel, '#3a0d38');
        G(gg => poly(gg, panel, 'rgba(255,61,154,0.55)'));
        // product grid
        for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
          const t = 0.12 + k * 0.17, z = 10 + r * 6;
          const x = EJ.lerp(s.a[0], s.b[0], t), y = EJ.lerp(s.a[1], s.b[1], t) - z;
          c.fillStyle = ['#ff3d9a', '#ffd166', '#3fd8ff', '#9cff6a'][(r + k) % 4];
          c.fillRect(Math.round(x), Math.round(y - 3), 2, 3);
        }
        // side stripe with label
        const bx2 = EJ.lerp(s.a[0], s.b[0], 0.86), by2 = EJ.lerp(s.a[1], s.b[1], 0.86);
        for (const ctx of [c, g]) line(ctx, bx2, by2 - 5, bx2, by2 - h + 5, '#ff3d9a');
        glowUsed = true;
        c.save(); c.setTransform(1, 0.5, 0, 1, s.at[0] + 4, s.at[1] + 2);
        c.fillStyle = '#ffe1f1'; c.font = 'bold 6px "Oswald", sans-serif'; c.fillText('КОФЕ', 2, 5); c.restore();
        p.light = '#ff3d9a'; p.lightR = 2.4; p.lightA = 0.45; p.lightOff = [0, 0.9];
        break;
      }
      case 'kiosk': {
        const col = p.camp === 'hr' ? '#ff5ad1' : '#4dff9a';
        box(c, ox, oy, 0.1, 0.1, w - 0.2, d - 0.2, 0, h, { top: '#2a2f40', l: '#1c2030', r: '#151824', edge: '#3a4058' });
        const s = box(c, ox, oy, 0.08, 0.15, w - 0.16, 0.12, h, 14, { top: '#10131c', l: '#151a26', r: '#0d1018' });
        const scr = [s.a[0] + 1, s.a[1] - 2, s.b[0] - 1, s.b[1] - 2, s.bt[0] - 1, s.bt[1] + 2, s.at[0] + 1, s.at[1] + 2];
        poly(c, scr, col); G(gg => poly(gg, scr, EJ.rgba(col, 0.85)));
        c.save(); c.setTransform(1, 0.5, 0, 1, s.at[0] + 2, s.at[1] + 3);
        c.fillStyle = '#05060a'; c.font = 'bold 6px monospace'; c.fillText(p.camp === 'hr' ? 'HR' : 'EDU', 1, 7); c.restore();
        p.light = col; p.lightR = 1.6; p.lightA = 0.4; p.lightOff = [0, 0.7];
        break;
      }
      case 'itshelf': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#3a3f50', l: '#2b2f3d', r: '#22252f', edge: '#4c5266' });
        const [ax, ay] = Pt(0, d), [bx, by] = Pt(w, d);
        for (let k = 1; k < 3; k++) { const z = (h / 3) * k; line(c, ax + 1, ay - z, bx - 1, by - z, '#1a1c25'); }
        for (let k = 0; k < 5; k++) { const t = 0.12 + k * 0.18; c.fillStyle = ['#ffb03a', '#3fd8ff', '#9aa0b4', '#ff5a6a', '#4dff9a'][k]; c.fillRect(Math.round(EJ.lerp(ax, bx, t)), Math.round(EJ.lerp(ay, by, t) - 9), 2, 3); }
        p.light = '#3fd8ff'; p.lightR = 1.4; p.lightA = 0.25;
        break;
      }
      case 'elevator': {
        const s = box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#1b1d29', l: '#1d2030', r: '#171925', edge: '#2e3247' });
        const lerpF = (t, z) => [EJ.lerp(s.a[0], s.b[0], t), EJ.lerp(s.a[1], s.b[1], t) - z];
        const door = [...lerpF(0.18, 3), ...lerpF(0.82, 3), ...lerpF(0.82, 38), ...lerpF(0.18, 38)];
        poly(c, door, '#2e3446');
        const m0 = lerpF(0.5, 3), m1 = lerpF(0.5, 38);
        line(c, m0[0], m0[1], m1[0], m1[1], '#151821');
        for (const tt of [0.3, 0.7]) { const q0 = lerpF(tt, 6), q1 = lerpF(tt, 35); line(c, q0[0], q0[1], q1[0], q1[1], '#3b4258'); }
        p.frame = { a: lerpF(0.14, 2), b: lerpF(0.86, 2), c: lerpF(0.86, 41), d: lerpF(0.14, 41), disp: lerpF(0.5, 46) };
        p.light = '#ff2d55'; p.lightR = 2.2; p.lightA = 0.3; p.lightOff = [0, 0.8];
        break;
      }
      case 'crate': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#6b5536', l: '#56432a', r: '#473722', edge: '#7d6642' });
        const [ax, ay] = Pt(0, d, h / 2), [bx, by] = Pt(w, d, h / 2);
        line(c, ax, ay, bx, by, '#3a2c1a');
        break;
      }
      case 'sofa': {
        box(c, ox, oy, 0, 0, w, d, 0, 5, { top: '#3b2440', l: '#2c1a31', r: '#241528' });
        box(c, ox, oy, 0, 0, w, 0.22, 5, 8, { top: '#4a2d50', l: '#3b2440', r: '#2c1a31' });
        break;
      }
      case 'printer': {
        box(c, ox, oy, 0, 0, w, d, 0, 8, { top: '#2a2d3a', l: '#20222d', r: '#191b24' });
        box(c, ox, oy, 0.05, 0.05, w - 0.1, d - 0.1, 8, 7, { top: '#7d8294', l: '#5e6274', r: '#4f5364', edge: '#9aa0b4' });
        box(c, ox, oy, 0.15, 0.3, w - 0.3, 0.35, 15, 1, { top: '#d8d8e0', l: '#b8b8c2', r: '#a8a8b2' });
        const [lx, ly] = Pt(w * 0.8, d, 11);
        for (const ctx of [c, g]) { ctx.fillStyle = '#4dff9a'; ctx.fillRect(Math.round(lx), Math.round(ly), 2, 1); }
        glowUsed = true;
        p.leds = [[Math.round(lx) - 3, Math.round(ly), '#ffb03a', 0, 3]];
        break;
      }
      case 'router': {
        box(c, ox, oy, 0.05, 0.05, w - 0.1, d - 0.1, 0, 12, { top: '#2b2f3e', l: '#20232f', r: '#191b25' });
        box(c, ox, oy, 0.08, 0.1, w - 0.16, d - 0.2, 12, 3, { top: '#14151b', l: '#0e0f14', r: '#0b0c10' });
        const [a1x, a1y] = Pt(0.12, 0.25, 15), [a2x, a2y] = Pt(w - 0.12, 0.25, 15);
        line(c, a1x, a1y, a1x - 2, a1y - 8, '#0b0c10'); line(c, a2x, a2y, a2x + 2, a2y - 8, '#0b0c10');
        p.leds = [];
        for (let k = 0; k < 4; k++) { const [lx, ly] = Pt(0.12 + k * 0.08, d - 0.1, 14); p.leds.push([Math.round(lx), Math.round(ly), k === 3 ? A : '#4dff9a', k, 4 + k]); }
        p.light = '#4dff9a'; p.lightR = 0.9; p.lightA = 0.2;
        break;
      }
      case 'ups': {
        box(c, ox, oy, 0, 0, w, d, 0, h, { top: '#252836', l: '#1a1c27', r: '#14161f', edge: '#323648' });
        const s = { a: Pt(0, d, 0), b: Pt(w, d, 0) };
        const lcd = [s.a[0] + 3, s.a[1] - 15, s.b[0] - 3, s.b[1] - 15, s.b[0] - 3, s.b[1] - 19, s.a[0] + 3, s.a[1] - 19];
        poly(c, lcd, '#b7ff6a'); G(gg => poly(gg, lcd, 'rgba(183,255,106,0.7)'));
        p.leds = [[Math.round(s.a[0] + 4), Math.round(s.a[1] - 8), '#ff2d55', 0, 6]];
        p.light = '#b7ff6a'; p.lightR = 1.1; p.lightA = 0.22;
        break;
      }
      case 'mtable': {
        box(c, ox, oy, 0.1, 0.1, w - 0.2, d - 0.2, 0, h - 2, { top: '#1a1820', l: '#16141c', r: '#110f16' });
        box(c, ox, oy, 0, 0, w, d, h - 2, 2, { top: p.kitchen ? '#4a3a30' : '#2c2a36', l: '#211f29', r: '#1a1820', edge: p.kitchen ? '#5e4a3c' : '#3e3b4c' });
        if (!p.kitchen) {
          // projector + beam spot
          box(c, ox, oy, w / 2 - 0.2, d / 2 - 0.15, 0.4, 0.3, h, 4, { top: '#d6d8e0', l: '#9a9eac', r: '#8a8e9c' });
          const [lx, ly] = Pt(w / 2 - 0.2, d / 2 + 0.15, h + 2);
          for (const ctx of [c, g]) { ctx.fillStyle = '#e9f8ff'; ctx.fillRect(Math.round(lx) + 1, Math.round(ly), 2, 2); }
          glowUsed = true;
          for (let k = 0; k < 6; k++) { const [px, py] = Pt(0.3 + k * 0.38, 0.25, h); c.fillStyle = '#d0d0d8'; c.fillRect(Math.round(px), Math.round(py), 3, 1); }
          p.light = A2; p.lightR = 1.6; p.lightA = 0.2;
        } else {
          box(c, ox, oy, 0.5, 0.4, 0.15, 0.15, h, 4, { top: '#e8e4dc', l: '#c4c0b8', r: '#aaa69e' });
          box(c, ox, oy, 1.6, 0.6, 0.15, 0.15, h, 4, { top: '#ff5a6a', l: '#c8404e', r: '#a83442' });
        }
        break;
      }
      case 'throne': {
        box(c, ox, oy, 0, 0, w, d, 0, 8, { top: '#3a0d18', l: '#2a0912', r: '#21070e' });
        box(c, ox, oy, 0.2, 0.05, w - 0.4, 0.3, 8, 36, { top: '#4a1020', l: '#5a1426', r: '#3a0c18', edge: '#ffc04a' });
        box(c, ox, oy, 0.25, 0.35, w - 0.5, 0.5, 8, 6, { top: '#7a1a30', l: '#5a1426', r: '#3a0c18' });
        box(c, ox, oy, 0.05, 0.3, 0.2, 0.6, 8, 12, { top: '#ffc04a', l: '#c48a20', r: '#a0701a' });
        box(c, ox, oy, w - 0.25, 0.3, 0.2, 0.6, 8, 12, { top: '#ffc04a', l: '#c48a20', r: '#a0701a' });
        const [cx0, cy0] = Pt(w / 2, 0.2, 48);
        for (const ctx of [c, g]) {
          ctx.fillStyle = '#ffc04a';
          ctx.fillRect(Math.round(cx0) - 5, Math.round(cy0), 11, 2);
          for (const [dx, hh] of [[-5, 4], [-2, 3], [0, 6], [2, 3], [5, 4]]) ctx.fillRect(Math.round(cx0) + dx, Math.round(cy0) - hh, 1, hh);
        }
        glowUsed = true;
        p.light = '#ff2a3a'; p.lightR = 3.2; p.lightA = 0.45; p.lightOff = [0, 1.2];
        break;
      }
    }
    if (glowUsed) p.glowImg = glow;
  }

  // ================================================================ runtime queries
  function tileAt(L, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return 0;
    return L.tiles[L.idx(tx, ty)];
  }
  // Movement collision for a circle of radius r.
  function solidAt(L, x, y, r = 0.28, ignoreProps = false) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) {
      const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
      if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return true;
      const i = L.idx(tx, ty);
      if (L.tiles[i] !== 1 || L.doorLock[i]) return true;
    }
    if (ignoreProps) return false;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      const cell = L.propCells.get(L.idx(tx, ty));
      if (!cell) continue;
      for (const p of cell) if (x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.d) return true;
    }
    return false;
  }
  function bulletBlocked(L, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return true;
    const i = L.idx(tx, ty);
    if (L.tiles[i] !== 1 || L.doorLock[i]) return true;
    const cell = L.propCells.get(i);
    if (cell) for (const p of cell) if (p.tall && x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.d) return true;
    return false;
  }
  function los(L, ax, ay, bx, by) {
    const d = EJ.dist(ax, ay, bx, by), n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) { const t = i / n; if (bulletBlocked(L, EJ.lerp(ax, bx, t), EJ.lerp(ay, by, t))) return false; }
    return true;
  }
  function roomOf(L, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return null;
    const r = L.roomAt[L.idx(tx, ty)];
    return r >= 0 ? L.rooms[r] : null;
  }
  function flowField(L, x, y) {
    return bfs(L, Math.floor(x), Math.floor(y), false, 60);
  }
  function setRoomLock(L, R, locked) {
    for (const d of R.doors) { d.locked = locked; L.doorLock[L.idx(d.x, d.y)] = locked ? 1 : 0; }
  }

  EJ.level = { generate, bake, path, solidAt, bulletBlocked, los, roomOf, flowField, setRoomLock, tileAt, WALL_H, PROP, bakeProp };
})();
