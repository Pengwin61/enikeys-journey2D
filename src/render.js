/* Enikey Journey — renderer: low-res pixel scene, additive lights, emissive bloom, depth sorting. */
'use strict';
EJ.render = (() => {
  const { canvas, groundEllipse, line, poly, lightSprite, rgba } = EJ;
  const S = () => EJ.sprites;
  let display, dctx, scene, sc, glow, gc, b1, b2, b3, W = 480, H = 270, scale = 3, dpr = 1, RES = 1;
  let ox = 0, oy = 0, time = 0;
  const flipCache = new WeakMap();
  const hasFilter = (() => { try { const c = document.createElement('canvas').getContext('2d'); return typeof c.filter === 'string'; } catch (e) { return false; } })();

  function init(el) {
    display = el; dctx = display.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wd = Math.round(innerWidth * dpr), hd = Math.round(innerHeight * dpr);
    scale = Math.max(2, Math.round(hd / 300));
    W = Math.ceil(wd / scale); H = Math.ceil(hd / scale);
    display.width = W * scale; display.height = H * scale;
    display.style.width = (W * scale) / dpr + 'px'; display.style.height = (H * scale) / dpr + 'px';
    // the scene is rendered at RES× its logical size so painted assets keep their detail;
    // RES divides the display scale, so procedural pixel art stays perfectly crisp
    RES = [3, 2, 1].find(r => scale % r === 0);
    scene = canvas(W * RES, H * RES); sc = scene.getContext('2d');
    glow = canvas(W, H); gc = glow.getContext('2d');
    b1 = canvas(W / 2, H / 2); b2 = canvas(W / 4, H / 4); b3 = canvas(W / 8, H / 8);
  }

  const flipped = img => {
    let f = flipCache.get(img);
    if (!f) { f = canvas(img.width, img.height); const g = f.getContext('2d'); g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0); flipCache.set(img, f); }
    return f;
  };
  const sx = (x, y) => ox + (x - y) * 16;
  const sy = (x, y, z = 0) => oy + (x + y) * 8 - z;

  // screen → world (ground plane, optional height)
  function screenToWorld(cssX, cssY, z = 0) {
    const px = (cssX * dpr) / scale, py = (cssY * dpr) / scale;
    const [x, y] = EJ.unIso(px - ox, py - oy + z);
    return { x, y, px, py };
  }
  function worldToCss(x, y, z = 0) { return [((sx(x, y)) * scale) / dpr, ((sy(x, y, z)) * scale) / dpr]; }

  function sprite(spr, x, y, flip, { flash = false, alpha = 1, glowA = 1, silhouette = false } = {}) {
    const img = silhouette ? spr.sil : flash ? spr.flash : spr.img;
    const dx = Math.round(x - spr.w / 2), dy = Math.round(y - spr.h + 1);
    sc.globalAlpha = alpha;
    sc.drawImage(flip ? flipped(img) : img, dx, dy);
    sc.globalAlpha = 1;
    if (spr.glow && glowA > 0 && !silhouette) { gc.globalAlpha = glowA * alpha; gc.drawImage(flip ? flipped(spr.glow) : spr.glow, dx, dy); gc.globalAlpha = 1; }
  }

  // ---------------------------------------------------------------- frame
  function frame(G, dt) {
    time += dt;
    const L = G.L;
    const shx = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake) : 0;
    const shy = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 0.7) : 0;
    ox = Math.round(W / 2 - G.cam.x) + shx; oy = Math.round(H / 2 - G.cam.y) + shy;

    sc.setTransform(RES, 0, 0, RES, 0, 0); sc.imageSmoothingEnabled = false;
    sc.globalCompositeOperation = 'source-over';
    sc.fillStyle = '#040409'; sc.fillRect(0, 0, W, H);
    gc.clearRect(0, 0, W, H);
    blitRegion(sc, L.floorCanvas, L.FOX, L.FOY);
    drawAssetFloor(L);
    const dark = Math.max(G.night || 0, G.blackout || 0);
    gc.globalAlpha = 1 - (G.blackout || 0) * 0.95 - (G.night || 0) * 0.35;
    blitRegion(gc, L.glowCanvas, L.FOX, L.FOY);
    gc.globalAlpha = 1;

    drawLights(G);
    drawGround(G);
    // night: the floor sinks into darkness first, actors and walls stay readable
    if (dark > 0) { sc.fillStyle = `rgba(2,3,12,${0.55 * (G.night || 0) + 0.9 * (G.blackout || 0)})`; sc.fillRect(0, 0, W, H); }
    drawSorted(G);
    if (dark > 0) {
      sc.fillStyle = `rgba(2,3,12,${0.22 * (G.night || 0) + 0.85 * (G.blackout || 0)})`;
      sc.fillRect(0, 0, W, H);
      if (G.night && !G.blackout) {
        const P = G.player;
        sc.globalCompositeOperation = 'lighter';
        const spr = lightSprite('rgba(90,160,255,0.3)');
        const X = sx(P.x, P.y), Y = sy(P.x, P.y);
        sc.drawImage(spr, X - 70, Y - 40, 140, 70);
        sc.globalCompositeOperation = 'source-over';
      }
    }
    drawBeamsAndWaves(G);
    drawParticles(G);
    drawMotes(G);
    composite(G);
    drawOverlay(G);
  }

  function blitRegion(ctx, src, FOX, FOY) {
    let sx0 = FOX - ox, sy0 = FOY - oy, dx = 0, dy = 0, w = W, h = H;
    if (sx0 < 0) { dx = -sx0; w += sx0; sx0 = 0; }
    if (sy0 < 0) { dy = -sy0; h += sy0; sy0 = 0; }
    w = Math.min(w, src.width - sx0); h = Math.min(h, src.height - sy0);
    if (w > 0 && h > 0) ctx.drawImage(src, sx0, sy0, w, h, dx, dy, w, h);
  }

  // ---------------------------------------------------------------- ground layer
  function drawGround(G) {
    const P = G.player;
    // neon guide thread to the selected ticket (prologue: «неоновая нить потянулась вперёд»)
    if (G.thread && G.thread.length > 1 && P.alive) {
      const pts = G.thread;
      const col = G.threadColor || '#3fd8ff';
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        for (let s = 0; s < 4; s++) {
          acc++;
          const t = s / 4, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          const phase = (acc - time * 10) % 6;
          if (phase < 0 ? phase + 6 < 2.5 : phase < 2.5) {
            const X = Math.round(sx(x, y)), Y = Math.round(sy(x, y));
            const a = Math.max(0.15, 1 - i / 40);
            sc.fillStyle = rgba(col, 0.75 * a); sc.fillRect(X - 1, Y, 2, 1);
            gc.fillStyle = rgba(col, 0.9 * a); gc.fillRect(X - 1, Y, 3, 1);
          }
        }
      }
    }
    // scan cone (Найти уязвимость)
    if (G.scanFx) {
      const f = G.scanFx, a = f.t / 0.35;
      for (let r = 1; r < 6.5; r += 0.5) for (let k = -6; k <= 6; k++) {
        const an = f.a + (k / 6) * 0.75, x = f.x + Math.cos(an) * r, y = f.y + Math.sin(an) * r;
        if (Math.abs(k) === 6 || (r * 2) % 2 === 0) { sc.fillStyle = rgba('#ff2d55', 0.5 * a); sc.fillRect(Math.round(sx(x, y)), Math.round(sy(x, y)), 1, 1); gc.fillStyle = rgba('#ff2d55', 0.6 * a); gc.fillRect(Math.round(sx(x, y)), Math.round(sy(x, y)), 1, 1); }
      }
    }
    for (const h of G.hazards) {
      const x = sx(h.x, h.y), y = sy(h.x, h.y);
      const col = h.kind === 'ritual' ? '#ff2a4f' : '#ff8a2a';
      if (h.warn > 0) {
        const k = 1 - h.warn / h.warnMax, pulse = Math.floor(time * 12) % 2 ? 0.9 : 0.6;
        groundEllipse(sc, x, y, h.r, rgba(col, 0.12)); groundEllipse(sc, x, y, h.r * k, rgba(col, 0.28));
        groundEllipse(sc, x, y, h.r, rgba(col, pulse), 1); groundEllipse(gc, x, y, h.r, rgba(col, 0.6), 1);
        if (h.kind === 'ritual') for (let i = 0; i < 3; i++) {
          const a0 = time * 2 + (i * Math.PI * 2) / 3, a1 = a0 + (Math.PI * 2) / 3, r = h.r * 0.75;
          line(sc, x + Math.cos(a0) * r * 22.6, y + Math.sin(a0) * r * 11.3, x + Math.cos(a1) * r * 22.6, y + Math.sin(a1) * r * 11.3, rgba(col, 0.8));
        } else { sc.fillStyle = rgba('#ffcf5a', pulse); sc.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 5); sc.fillRect(Math.round(x) - 1, Math.round(y) + 2, 2, 2); }
      } else {
        const a = Math.min(1, h.active / 0.3);
        groundEllipse(sc, x, y, h.r, rgba(col, 0.45 * a)); groundEllipse(gc, x, y, h.r, rgba(col, 0.55 * a));
        groundEllipse(sc, x, y, h.r * 0.6, rgba('#ffe0a0', 0.35 * a));
      }
    }
    for (const e of G.enemies) {
      if (e.type === 'guard' && e.state === 'wind') {
        const blink = Math.floor(time * 16) % 2 === 0;
        for (let dd = 0.6; dd < 5; dd += 0.45) {
          const X = Math.round(sx(e.x + Math.cos(e.chargeA) * dd, e.y + Math.sin(e.chargeA) * dd)), Y = Math.round(sy(e.x + Math.cos(e.chargeA) * dd, e.y + Math.sin(e.chargeA) * dd));
          const c = blink ? '#ff2445' : '#a0102a';
          sc.fillStyle = c; sc.fillRect(X - 2, Y, 4, 1); gc.fillStyle = c; gc.fillRect(X - 2, Y - 1, 4, 3);
        }
      }
      if (e.elite && !e.dead && e.spawnT <= 0) {
        const X = sx(e.x, e.y), Y = sy(e.x, e.y);
        const col = e.elite.color, pulse = 0.45 + Math.sin(time * 4) * 0.2;
        groundEllipse(sc, X, Y, 0.55, rgba(col, pulse), 1); groundEllipse(gc, X, Y, 0.55, rgba(col, pulse), 1);
      }
    }
    const shadow = (x, y, r, a = 0.45) => groundEllipse(sc, sx(x, y), sy(x, y), r, `rgba(0,0,0,${a})`);
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.type === 'head') continue;
      const big = e.def.r > 0.5;
      shadow(e.x, e.y, big ? 0.95 : e.def.fly ? 0.22 : 0.3, e.def.fly ? 0.3 : 0.5);
    }
    for (const n of G.npcs) if (n.visible !== false) shadow(n.x, n.y, 0.3, 0.4);
    for (const d of G.drops) shadow(d.x, d.y, 0.1, 0.4);
    for (const b of G.bullets) if (b.team === 'e') { sc.fillStyle = 'rgba(0,0,0,0.35)'; sc.fillRect(Math.round(sx(b.x, b.y)) - 1, Math.round(sy(b.x, b.y)), 3, 1); }
    if (P.alive) {
      shadow(P.x, P.y, 0.3, 0.5);
      const x = sx(P.x, P.y), y = sy(P.x, P.y);
      groundEllipse(sc, x, y, 0.5, 'rgba(255,140,70,0.55)', 1);
      groundEllipse(gc, x, y, 0.5, 'rgba(255,120,60,0.35)', 1);
      const ax = x + (P.aimX - P.aimY) * 0.5 * 16, ay = y + (P.aimX + P.aimY) * 0.5 * 8;
      sc.fillStyle = '#ffd0a0'; sc.fillRect(Math.round(ax) - 1, Math.round(ay), 2, 1);
    }
  }

  function drawBeamsAndWaves(G) {
    for (const z of G.zaps || []) {
      let px = sx(z.ax, z.ay), py = sy(z.ax, z.ay, z.az);
      const tx = sx(z.bx, z.by), ty = sy(z.bx, z.by, z.bz);
      for (let i = 1; i <= 5; i++) {
        const t = i / 5, nx = px + (tx - px) / (6 - i) + (i < 5 ? (Math.random() - 0.5) * 6 : 0), ny = py + (ty - py) / (6 - i) + (i < 5 ? (Math.random() - 0.5) * 6 : 0);
        line(sc, px, py, nx, ny, '#ffffff'); line(gc, px, py, nx, ny, '#7fd4ff');
        px = nx; py = ny;
      }
      pushLight(z.bx, z.by, 'rgba(127,212,255,0.5)', 1.2);
    }
    if (G.spinFx) {
      const f = G.spinFx, k = 1 - f.t / 0.22;
      for (let j = 0; j < 3; j++) {
        const a = k * Math.PI * 2.5 + j * 2.1;
        const X0 = sx(f.x, f.y), Y0 = sy(f.x, f.y, 8), X1 = sx(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r), Y1 = sy(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, 8);
        line(sc, X0, Y0, X1, Y1, '#ffd27a'); line(gc, X0, Y0, X1, Y1, '#ffb03a');
      }
    }
    for (const w of G.waves) {
      const a = 1 - w.r / w.maxR;
      groundEllipse(sc, sx(w.x, w.y), sy(w.x, w.y), w.r, rgba(w.color, 0.85 * a + 0.15), 2);
      groundEllipse(gc, sx(w.x, w.y), sy(w.x, w.y), w.r, rgba(w.color, 0.9 * a), 2);
    }
    for (const b of G.beams) {
      const ang = b.warn > 0 ? b.a + (b.a1 - b.a) * 0 : b.cur;
      const X0 = sx(b.x, b.y), Y0 = sy(b.x, b.y, 34);
      if (b.warn > 0) {
        // telegraph: the sweep sector as thin flickering rays
        if (Math.floor(time * 20) % 2) for (const a of [b.a, b.a1]) line(sc, X0, Y0, sx(b.x + Math.cos(a) * b.len, b.y + Math.sin(a) * b.len), sy(b.x + Math.cos(a) * b.len, b.y + Math.sin(a) * b.len), rgba(b.color, 0.5));
        line(gc, X0, Y0, sx(b.x + Math.cos(ang) * b.len, b.y + Math.sin(ang) * b.len), sy(b.x + Math.cos(ang) * b.len, b.y + Math.sin(ang) * b.len), rgba(b.color, 0.6));
        continue;
      }
      const ex = b.x + Math.cos(ang) * b.len, ey = b.y + Math.sin(ang) * b.len;
      const X1 = sx(ex, ey), Y1 = sy(ex, ey, 2);
      for (let o = -1; o <= 1; o++) { line(sc, X0, Y0 + o, X1, Y1 + o, o ? b.color : '#ffffff'); line(gc, X0, Y0 + o, X1, Y1 + o, b.color); }
      pushLight(ex, ey, rgba(b.color, 0.7), 1.6);
    }
  }

  // ---------------------------------------------------------------- sorted world objects
  const items = [];
  function drawSorted(G) {
    const L = G.L, P = G.player;
    items.length = 0;
    const psx = sx(P.x, P.y), psy = sy(P.x, P.y) - 12, pDepth = P.x + P.y;
    let occluded = false;
    for (const w of L.walls) {
      const x = ox + w.ox, y = oy + w.oy;
      if (x > W + 4 || y > H + 4 || x + 36 < 0 || y + w.img.height < 0) continue;
      let target = 1;
      if (w.tall && w.depth > pDepth + 0.4 && psx > x - 4 && psx < x + 38 && psy > y - 6 && psy < y + w.img.height + 4) { target = 0.28; occluded = true; }
      w.fade += (target - w.fade) * 0.18;
      items.push({ d: w.depth, k: 0, o: w, x, y });
    }
    for (const p of L.props) {
      const x = sx(p.x, p.y) + p.px, y = sy(p.x, p.y) + p.py;
      if (x > W + 4 || y > H + 4 || x + p.img.width < 0 || y + p.img.height < 0) continue;
      let target = 1;
      const depth = p.x + p.w / 2 + p.y + p.d / 2;
      if (p.tall && depth > pDepth + 0.3 && psx > x - 2 && psx < x + p.img.width + 2 && psy > y && psy < y + p.img.height) { target = 0.35; occluded = true; }
      p.fade = (p.fade ?? 1) + (target - (p.fade ?? 1)) * 0.18;
      items.push({ d: depth, k: 1, o: p, x, y });
    }
    const actorDepth = (x, y) => {
      let d = x + y;
      for (const p of L.props) {
        if (Math.abs(x - (p.x + p.w / 2)) > p.w / 2 + 1.5 || Math.abs(y - (p.y + p.d / 2)) > p.d / 2 + 1.5) continue;
        const pd = p.x + p.w / 2 + p.y + p.d / 2;
        if (x >= p.x + p.w || y >= p.y + p.d) d = Math.max(d, pd + 0.01);
        else if (x <= p.x || y <= p.y) d = Math.min(d, pd - 0.01);
      }
      return d;
    };
    for (const d of L.doors) if (d.locked || d.t > 0) items.push({ d: d.x + d.y + 1, k: 2, o: d });
    for (const p of G.drops) items.push({ d: p.x + p.y, k: 4, o: p });
    for (const e of G.enemies) items.push({ d: e.type === 'head' ? e.x + e.y + 0.5 : actorDepth(e.x, e.y), k: 5, o: e });
    for (const n of G.npcs) if (n.visible !== false) items.push({ d: actorDepth(n.x, n.y), k: 6, o: n });
    for (const b of G.bullets) items.push({ d: b.x + b.y + 0.2, k: 7, o: b });
    for (const a of P.afterimages) items.push({ d: a.x + a.y - 0.01, k: 8, o: a });
    if (P.alive) items.push({ d: actorDepth(P.x, P.y), k: 9, o: P });
    for (const a of G.allies || []) items.push({ d: a.x + a.y, k: 11, o: a });
    for (const t of G.tickets || []) if (t.target && t.state !== 'done') items.push({ d: t.target.x + t.target.w + t.target.y + t.target.d + 0.5, k: 10, o: t });
    items.sort((a, b) => a.d - b.d);

    for (const it of items) {
      switch (it.k) {
        case 0: sc.globalAlpha = it.o.fade; sc.drawImage(it.o.img, it.x, it.y); sc.globalAlpha = 1; break;
        case 1: drawProp(G, it.o, it.x, it.y); break;
        case 2: drawBarrier(G, it.o); break;
        case 4: drawDrop(it.o); break;
        case 5: drawEnemy(G, it.o); break;
        case 6: drawNpc(G, it.o); break;
        case 7: drawBullet(it.o); break;
        case 8: { const a = it.o; sprite(S().hero[a.facing][0], sx(a.x, a.y), sy(a.x, a.y), a.flip, { silhouette: true, alpha: a.t / 0.22 }); break; }
        case 9: drawPlayer(G, P); break;
        case 10: drawTicketMarker(G, it.o); break;
        case 11: drawAlly(it.o); break;
      }
    }
    if (P.alive && occluded) sprite(heroSprite(P), sx(P.x, P.y), sy(P.x, P.y), P.flip, { silhouette: true, alpha: 0.35 });
  }

  // ---------------------------------------------------------------- painted assets (assets/gen, optional)
  const HERO_H = 34, ART_SCALE = 32 / 256;
  // tall art is capped so it stays in proportion with the 50 px walls
  const ART_MAX_H = { pillar: 66, rack: 54, cabinet: 32, cooler: 28, vending: 50, kiosk: 26, ups: 26, router: 22 };
  const propArt = p => EJ.assets.forProp(p);
  // painted art is pre-scaled once per on-screen size and cached, then blitted 1:1 in device pixels
  const artCache = new Map();
  function scaledArt(a, h, flip) {
    const H2 = Math.max(1, Math.round(h * RES)), key = a;
    let per = artCache.get(key);
    if (!per) { per = new Map(); artCache.set(key, per); }
    const k2 = H2 + (flip ? 'f' : '');
    let c = per.get(k2);
    if (!c) {
      const W2 = Math.max(1, Math.round(a.w * H2 / a.h));
      c = EJ.canvas(W2, H2);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (flip) { g.translate(W2, 0); g.scale(-1, 1); }
      g.drawImage(a.img, a.x, a.y, a.w, a.h, 0, 0, W2, H2);
      if (per.size > 24) per.clear();
      per.set(k2, c);
    }
    return c;
  }
  function drawArt(a, cx, bottom, height, flip, alpha, flash) {
    const h = height || a.h * ART_SCALE;
    const c = scaledArt(a, h, flip);
    const dx = Math.round(cx * RES - c.width / 2), dy = Math.round(bottom * RES - c.height);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = alpha;
    sc.drawImage(c, dx, dy);
    if (flash) { sc.globalCompositeOperation = 'lighter'; sc.globalAlpha = 0.6 * alpha; sc.drawImage(c, dx, dy); sc.globalCompositeOperation = 'source-over'; }
    sc.globalAlpha = 1;
    sc.setTransform(RES, 0, 0, RES, 0, 0);
  }
  let floorTileC = null, floorTileRes = 0;
  function drawAssetFloor(L) {
    const tile = EJ.assets.get('floor_tile');
    if (!tile || !L.decalCanvas) return;
    if (floorTileRes !== RES) {
      floorTileRes = RES;
      floorTileC = EJ.canvas(Math.ceil(32.8 * RES), Math.ceil(16.4 * RES));
      const g = floorTileC.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(tile.img, 0, 0, floorTileC.width, floorTileC.height);
    }
    sc.setTransform(1, 0, 0, 1, 0, 0);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (L.tiles[L.idx(x, y)] !== 1) continue;
      const X = sx(x, y), Y = sy(x, y);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      sc.drawImage(floorTileC, Math.round((X - 16.4) * RES), Math.round((Y - 0.2) * RES));
    }
    sc.setTransform(RES, 0, 0, RES, 0, 0);
    blitRegion(sc, L.decalCanvas, L.FOX, L.FOY);
    sc.globalCompositeOperation = 'lighter';
    blitRegion(sc, L.poolCanvas, L.FOX, L.FOY);
    sc.globalCompositeOperation = 'source-over';
  }

  function heroSprite(P) { return S().hero[P.facing][P.moving ? 1 + (Math.floor(P.anim) % 2) : 0]; }

  function drawPlayer(G, P) {
    const x = sx(P.x, P.y), y = sy(P.x, P.y);
    const blink = P.iframes > 0 && P.dashT <= 0 && Math.floor(time * 20) % 2 === 0;
    const bob = P.moving && Math.floor(P.anim) % 2 ? -1 : 0;
    const art = EJ.assets.get(P.facing === 'front' ? 'enikey_front' : 'enikey_back');
    if (art) drawArt(art, x, y + bob, HERO_H, P.facing === 'front' ? !P.flip : P.flip, blink ? 0.45 : 1, P.hurtT > 0.15);
    else sprite(heroSprite(P), x, y + bob, P.flip, { flash: P.hurtT > 0.15, alpha: blink ? 0.45 : 1 });
    if (P.defending) {
      // shield arc in front of the hero
      const a0 = Math.atan2(P.aimY, P.aimX);
      for (let k = -5; k <= 5; k++) {
        const a = a0 + k * 0.18, X = Math.round(x + (Math.cos(a) - Math.sin(a)) * 0.55 * 16), Y = Math.round(y - 10 + (Math.cos(a) + Math.sin(a)) * 0.55 * 8);
        sc.fillStyle = 'rgba(120,220,255,0.8)'; sc.fillRect(X, Y - 3, 1, 7); gc.fillStyle = 'rgba(80,200,255,0.8)'; gc.fillRect(X, Y - 3, 1, 7);
      }
      pushLight(P.x, P.y, 'rgba(80,200,255,0.3)', 1.4);
    }
    if (P.marked > 0 && Math.floor(time * 8) % 2) reticle(x, y - 30, '#ff2d55');
    if (P.parryT > 0) { groundEllipse(sc, x, y, 0.75, 'rgba(233,248,255,0.85)', 1); groundEllipse(gc, x, y, 0.75, 'rgba(159,216,255,0.9)', 1); }
    if ('usb_linux' in P.inv && P.holdT > 0.15) {
      const k = Math.min(1, P.holdT / 0.7), col = k >= 1 ? '#b7ff6a' : 'rgba(183,255,106,0.6)';
      groundEllipse(sc, x, y, 0.9 - 0.4 * k, col, 1); groundEllipse(gc, x, y, 0.9 - 0.4 * k, col, 1);
      if (k >= 1) pushLight(P.x, P.y, 'rgba(183,255,106,0.4)', 1.4);
    }
    if (P.workT > 0) {
      const X = Math.round(x), Y = Math.round(y - 32);
      sc.fillStyle = '#05070c'; sc.fillRect(X - 9, Y - 1, 18, 4);
      sc.fillStyle = '#3fd8ff'; sc.fillRect(X - 8, Y, Math.round(16 * P.workP), 2);
      gc.fillStyle = '#3fd8ff'; gc.fillRect(X - 8, Y, Math.round(16 * P.workP), 2);
    }
  }
  function reticle(X, Y, col) {
    X = Math.round(X); Y = Math.round(Y);
    for (const ctx of [sc, gc]) {
      ctx.fillStyle = col;
      ctx.fillRect(X - 4, Y, 3, 1); ctx.fillRect(X + 2, Y, 3, 1); ctx.fillRect(X, Y - 4, 1, 3); ctx.fillRect(X, Y + 2, 1, 3);
    }
  }

  function drawTicketMarker(G, t) {
    const p = t.target;
    const cx = p.x + p.w / 2, cy = p.y + p.d / 2;
    const X = Math.round(sx(cx, cy)), Y = Math.round(sy(cx, cy, p.h + 20 + Math.sin(time * 3 + cx) * 2));
    const col = t.kind === 'elite' ? '#b26bff' : t.kind === 'boss' ? '#ff2d55' : '#3fd8ff';
    const sel = G.selTicket === t;
    const s = sel ? 4 : 3;
    // diamond with a pulsing core (prologue marker)
    for (const ctx of [sc, gc]) {
      ctx.fillStyle = col;
      for (let r = -s; r <= s; r++) { const hw = s - Math.abs(r); ctx.fillRect(X - hw, Y + r, hw * 2 + 1, 1); }
    }
    const core = Math.floor(time * 4) % 2 ? '#ffffff' : col;
    sc.fillStyle = core; sc.fillRect(X, Y - 1, 1, 3); sc.fillRect(X - 1, Y, 3, 1);
    sc.fillStyle = '#05060a';
    for (let r = -(s - 1); r <= s - 1; r++) { const hw = s - 1 - Math.abs(r); if (hw > 0 && Math.abs(r) > 0) { sc.fillRect(X - hw, Y + r, 1, 1); sc.fillRect(X + hw, Y + r, 1, 1); } }
    line(gc, X, Y + s + 1, X, Math.round(sy(cx, cy, p.h)), rgba(col, 0.25));
    if (t.progress > 0 && t.state !== 'done') {
      sc.fillStyle = '#05070c'; sc.fillRect(X - 11, Y + 7, 22, 4);
      sc.fillStyle = col; sc.fillRect(X - 10, Y + 8, Math.round(20 * t.progress), 2);
      gc.fillStyle = col; gc.fillRect(X - 10, Y + 8, Math.round(20 * t.progress), 2);
    }
    pushLight(cx, cy + 0.6, rgba(col, 0.25), 1.2);
  }

  function drawProp(G, p, x, y) {
    const art = propArt(p);
    if (art) {
      // painted asset: bottom of the art sits on the footprint's lowest corner, scaled 1 tile = 256 px
      const bx = sx(p.x + p.w / 2, p.y + p.d / 2), by = sy(p.x + p.w, p.y + p.d) + 1;
      // fit the art's width to the footprint's iso width (+12% for overhangs)
      const fitH = art.h * ((p.w + p.d) * 16 * 1.12) / art.w;
      drawArt(art, bx, by, Math.min(fitH, ART_MAX_H[p.kind] || 1e9), false, p.fade ?? 1, false);
    } else {
      sc.globalAlpha = p.fade ?? 1;
      sc.drawImage(p.img, x, y);
      sc.globalAlpha = 1;
    }
    if (p.leds && !art) for (const [lx, ly, col, ph, rate] of p.leds) if (Math.sin(time * rate + ph) > -0.2) { sc.fillStyle = col; sc.fillRect(x + lx, y + ly, 1, 1); gc.fillStyle = col; gc.fillRect(x + lx, y + ly, 2, 1); }
    if (p.camp === 'shop' && G.shop) G.shop.forEach((it, i) => {
      if (it.sold) return;
      const col = EJ.GRADES[it.grade].color;
      const wx2 = sx(p.x + 0.4 + i * 0.8, p.y + 0.3), wy2 = sy(p.x + 0.4 + i * 0.8, p.y + 0.3, p.h + 10 + Math.sin(time * 2.5 + i) * 2);
      sprite(S().ITEMBOX, wx2, wy2, false);
      gc.fillStyle = rgba(col, 0.6); gc.fillRect(Math.round(wx2) - 5, Math.round(wy2) - 9, 10, 9);
      pushLight(p.x + 0.4 + i * 0.8, p.y + 0.9, rgba(col, 0.35), 1);
    });
    if (p.seat === 503) {
      // the lamp above seat 503 blinks in a steady, measured rhythm — it is transmitting
      const on = (time % 1.6) < 0.18 || ((time % 1.6) > 0.36 && (time % 1.6) < 0.5);
      if (on) pushLight(p.x + 0.9, p.y + 0.9, 'rgba(160,220,255,0.55)', 2.2);
      const X = Math.round(sx(p.x + 0.9, p.y + 0.45)), Y = Math.round(sy(p.x + 0.9, p.y + 0.45, 44));
      sc.fillStyle = on ? '#e9f8ff' : '#3a4050'; sc.fillRect(X - 4, Y, 9, 1);
      if (on) { gc.fillStyle = '#9fd8ff'; gc.fillRect(X - 5, Y - 1, 11, 3); }
      line(sc, X, Y, X, Y - 18, '#1b1d27');
    }
    if (p.kind === 'elevator') {
      const f = p.frame, col = p.locked ? '#ff2d55' : '#4dff9a';
      const pulse = p.locked ? 0.75 : 0.75 + Math.sin(time * 5) * 0.25;
      const pts = [f.a, f.d, f.c, f.b];
      for (const ctx of [sc, gc]) for (let i = 0; i < 3; i++) line(ctx, x + pts[i][0], y + pts[i][1], x + pts[i + 1][0], y + pts[i + 1][1], rgba(col, pulse));
      const [dx, dy] = f.disp;
      sc.fillStyle = '#07080c'; sc.fillRect(Math.round(x + dx - 5), Math.round(y + dy - 2), 10, 5);
      for (const ctx of [sc, gc]) {
        ctx.fillStyle = col;
        const yy = Math.round(y + dy) + (p.locked ? 0 : (Math.floor(time * 3) % 2 ? -1 : 0));
        ctx.fillRect(Math.round(x + dx) - 1, yy - 1, 2, 1); ctx.fillRect(Math.round(x + dx) - 2, yy, 4, 1); ctx.fillRect(Math.round(x + dx) - 1, yy + 1, 2, 1);
      }
      pushLight(p.x + 1, p.y + 0.9, rgba(col, 0.35), 2.2);
    }
  }

  function drawBarrier(G, d) {
    const k = d.locked ? Math.min(1, d.t / 0.25) : Math.max(0, d.t / 0.25);
    if (k <= 0) return;
    const vertical = d.side === 'e' || d.side === 'w';
    const ax = vertical ? d.x + 0.5 : d.x, ay = vertical ? d.y : d.y + 0.5;
    const bx = vertical ? d.x + 0.5 : d.x + 1, by = vertical ? d.y + 1 : d.y + 0.5;
    const col = d.sealed ? '#9b5cff' : '#ff2d55', light = d.sealed ? '#c9a2ff' : '#ff5577';
    const h = 30 * k;
    const p0 = [sx(ax, ay), sy(ax, ay)], p1 = [sx(bx, by), sy(bx, by)];
    sc.globalAlpha = 0.16; poly(sc, [p0[0], p0[1], p1[0], p1[1], p1[0], p1[1] - h, p0[0], p0[1] - h], col); sc.globalAlpha = 1;
    for (let z = 3; z < h; z += 5) {
      if ((Math.floor(time * 20) + z) % 7 === 0) continue;
      line(sc, p0[0], p0[1] - z, p1[0], p1[1] - z, light); line(gc, p0[0], p0[1] - z, p1[0], p1[1] - z, col);
    }
    sc.fillStyle = '#2a2d3e'; sc.fillRect(Math.round(p0[0]) - 1, Math.round(p0[1] - h - 2), 2, Math.round(h + 2));
    for (const ctx of [sc, gc]) { ctx.fillStyle = col; ctx.fillRect(Math.round(p0[0]) - 1, Math.round(p0[1] - h - 3), 2, 2); }
    pushLight((ax + bx) / 2, (ay + by) / 2, rgba(col, 0.22), 1.4);
  }

  function drawDrop(d) {
    const x = sx(d.x, d.y), y = sy(d.x, d.y, d.z + 3 + (d.vz === 0 ? Math.sin(time * 5 + d.x * 3) : 0));
    if (d.life < 3 && Math.floor(time * 10) % 2) return;
    if (d.kind === 'coin') {
      const spr = S().COIN, w = Math.max(1, Math.round(Math.abs(Math.cos(time * 5 + d.x * 4)) * spr.w));
      sc.drawImage(spr.img, Math.round(x - w / 2), Math.round(y - spr.h), w, spr.h);
      gc.globalAlpha = 0.5; gc.drawImage(spr.img, Math.round(x - w / 2), Math.round(y - spr.h), w, spr.h); gc.globalAlpha = 1;
    } else if (d.kind === 'item') {
      const col = EJ.GRADES[d.grade].color;
      groundEllipse(sc, sx(d.x, d.y), sy(d.x, d.y), 0.35, rgba(col, 0.7), 1); groundEllipse(gc, sx(d.x, d.y), sy(d.x, d.y), 0.35, rgba(col, 0.8), 1);
      sprite(S().ITEMBOX, x, y - 2, false);
      gc.fillStyle = rgba(col, 0.6); gc.fillRect(Math.round(x) - 5, Math.round(y) - 11, 10, 9);
      line(gc, x, y - 12, x, y - 26, rgba(col, 0.4));
      pushLight(d.x, d.y, rgba(col, 0.45), 1.3);
    } else if (d.kind === 'pass') {
      sprite(S().PASS, x, y - 4 + Math.sin(time * 3) * 2, false);
      groundEllipse(gc, sx(d.x, d.y), sy(d.x, d.y), 0.4, 'rgba(155,92,255,0.7)', 1);
      pushLight(d.x, d.y, 'rgba(155,92,255,0.6)', 1.8);
    }
  }

  function drawBullet(b) {
    const x = sx(b.x, b.y), y = sy(b.x, b.y, b.z);
    if (b.sudo) {
      const tx = x - (b.vx - b.vy) * 16 * 0.06, ty = y - (b.vx + b.vy) * 8 * 0.06;
      for (let o = -2; o <= 2; o++) { line(sc, tx, ty + o, x, y + o, Math.abs(o) < 1 ? '#ffffff' : b.color); line(gc, tx, ty + o, x, y + o, b.color); }
      pushLight(b.x, b.y, 'rgba(183,255,106,0.7)', 2);
      return;
    }
    if (b.team === 'p' || b.streak) {
      const tx = x - (b.vx - b.vy) * 16 * 0.05, ty = y - (b.vx + b.vy) * 8 * 0.05;
      line(sc, tx, ty, x, y, b.color); line(sc, tx, ty + 1, x, y + 1, EJ.rgba(b.color, 0.55));
      line(gc, tx, ty, x, y, b.color); line(gc, tx, ty + 1, x, y + 1, b.color);
      sc.fillStyle = '#ffffff'; sc.fillRect(Math.round(x) - 1, Math.round(y), 2, 1);
      gc.fillStyle = b.color; gc.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
      pushLight(b.x, b.y, EJ.rgba(b.color, 0.45), 1.1);
    } else {
      const s = b.size > 1.15 ? 2 : 1, X = Math.round(x), Y = Math.round(y);
      sc.fillStyle = b.color; sc.fillRect(X - s, Y - s, s * 2 + 1, s * 2 + 1);
      sc.fillStyle = '#fff2f4'; sc.fillRect(X - (s - 1), Y - (s - 1), Math.max(1, (s - 1) * 2 + 1), Math.max(1, (s - 1) * 2 + 1));
      gc.fillStyle = b.color; gc.fillRect(X - s - 1, Y - s - 1, s * 2 + 3, s * 2 + 3);
      pushLight(b.x, b.y, EJ.rgba(b.color, 0.4), 0.8);
    }
  }

  function drawNpc(G, n) {
    const x = sx(n.x, n.y), y = sy(n.x, n.y);
    const P = G.player;
    const flip = P.x - P.y < n.x - n.y;
    let alpha = 1;
    if (n.kind === 'gregor') alpha = 0.72 + Math.sin(time * 7) * 0.08 + (Math.random() < 0.02 ? -0.4 : 0);
    // painted Gregor: faces the hero, talks while his line is up, and now and then dissolves for a moment
    const faceFront = P.x + P.y >= n.x + n.y;
    if (n.kind === 'gregor') {
      const glitch = (time + n.x * 3) % 9 < 0.7;
      const pose = !faceFront ? 'gregor_back' : n.say > 0 ? 'gregor_talk' : glitch ? 'gregor_fade' : 'gregor_front';
      const art = EJ.assets.get(pose) || EJ.assets.get('gregor_front');
      if (art) { drawArt(art, x, y, HERO_H, faceFront ? P.x - P.y > n.x - n.y : false, Math.min(1, alpha + 0.15), false); pushLight(n.x, n.y, 'rgba(90,160,255,0.35)', 1.5); return; }
    }
    const spr = S()[n.kind][0];
    sprite(spr, x, y + (n.kind === 'paul' ? Math.round(Math.sin(time * 2) - 1) : 0), flip, { alpha });
    if (n.kind === 'paul') pushLight(n.x, n.y, 'rgba(255,138,42,0.3)', 1.3);
  }

  // ---------------------------------------------------------------- enemies
  const ELITE_SPR = { backend: 'backend', frontend: 'frontend', sre: 'sreEng', qa: 'qa' };
  function drawEnemy(G, e) {
    const x = sx(e.x, e.y), y = sy(e.x, e.y, e.z);
    const P = G.player;
    const flip = P.x - P.y < e.x - e.y;
    if (e.spawnT > 0) {
      const k = 1 - e.spawnT / 0.7, gx = sx(e.x, e.y), gy = sy(e.x, e.y);
      groundEllipse(sc, gx, gy, 0.6 * (1.4 - k), rgba('#ff2d55', 0.8), 1); groundEllipse(gc, gx, gy, 0.6 * (1.4 - k), rgba('#ff2d55', 0.8), 1);
      const bh = Math.round(40 * k);
      for (const ctx of [sc, gc]) { ctx.fillStyle = rgba('#ff2d55', 0.5 + k * 0.5); ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - bh, 2, bh); }
      pushLight(e.x, e.y, 'rgba(255,45,85,0.6)', 1.6 * k);
      return;
    }
    const flash = e.flash > 0;
    const walkF = e.moving ? 1 + (Math.floor(e.anim * 8) % 2) : 0;
    switch (e.type) {
      case 'bug': sprite(S().bug[Math.floor(e.anim * 10) % 2], x, y, flip, { flash: flash || (e.splitT < 0.9 && Math.floor(time * 12) % 2 === 0) }); break;
      case 'imp': sprite(S().imp[Math.floor(e.anim * 5) % 2], x, y, flip, { flash }); pushLight(e.x, e.y, 'rgba(255,138,42,0.2)', 0.9); break;
      case 'spirit': sprite(S().spirit[0], x, y, flip, { flash, alpha: 0.55 + Math.sin(e.anim * 3) * 0.15 }); pushLight(e.x, e.y, 'rgba(127,196,255,0.3)', 1.2); break;
      case 'guard': {
        const wind = e.state === 'wind';
        sprite(S().guard[e.state === 'charge' ? 1 : walkF], x + (wind ? Math.round(Math.sin(time * 60)) : 0), y, flip, { flash: flash || (wind && Math.floor(time * 14) % 2 === 0) });
        if (e.state === 'stun') for (let i = 0; i < 3; i++) { const a = time * 5 + (i * Math.PI * 2) / 3; sc.fillStyle = '#ffd27a'; sc.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y - 27 + Math.sin(a) * 2), 1, 1); }
        break;
      }
      case 'cultist':
        if (e.state === 'cast') { groundEllipse(sc, sx(e.x, e.y), sy(e.x, e.y), 0.6, rgba('#ff2a4f', 0.7), 1); pushLight(e.x, e.y, 'rgba(255,42,79,0.7)', 2); }
        sprite(S().cultist[0], x, y, flip, { flash, glowA: e.state === 'cast' ? 1.6 : 1 });
        break;
      case 'drone': drawDrone(G, e, x, y, flash); break;
      case 'elite': {
        const spr = S()[ELITE_SPR[e.kind]][walkF];
        sprite(spr, x, y, flip, { flash });
        pushLight(e.x, e.y, rgba(e.elite.color, 0.35), 1.5);
        if (e.kind === 'qa' && e.state === 'aim' && Math.floor(time * 24) % 2) {
          const tx = sx(P.x, P.y, 10), ty = sy(P.x, P.y, 10);
          line(sc, x, y - 18, tx, ty, 'rgba(255,45,85,0.5)'); line(gc, x, y - 18, tx, ty, 'rgba(255,45,85,0.7)');
        }
        break;
      }
      case 'golem': drawGolem(G, e, x, y, flash, flip); break;
      case 'hydra': drawHydraBody(G, e, x, y, flash); break;
      case 'head': drawHead(G, e, x, y, flash); break;
      case 'ceo': drawCeo(G, e, x, y, flash, flip); break;
    }
    if (e.stunT > 0) for (let i = 0; i < 3; i++) { const a = time * 6 + (i * Math.PI * 2) / 3; const X = Math.round(x + Math.cos(a) * 6), Y = Math.round(y - (e.def.fly ? 14 : 26) + Math.sin(a) * 2); sc.fillStyle = '#9fd8ff'; sc.fillRect(X, Y, 1, 1); gc.fillStyle = '#3a8bff'; gc.fillRect(X, Y, 2, 1); }
    if (e.vuln > 0) reticle(x, y - (e.def.r > 0.5 ? 70 : 30), Math.floor(time * 10) % 2 ? '#ff2d55' : '#ffffff');
    const small = !['golem', 'hydra', 'ceo', 'head'].includes(e.type);
    if (small && e.hp < e.maxHp) {
      const bw = e.type === 'elite' ? 18 : 12, bx = Math.round(x - bw / 2), by = Math.round(y - (e.def.fly ? 14 : e.type === 'bug' ? 10 : 28));
      sc.fillStyle = '#0a0a10'; sc.fillRect(bx - 1, by - 1, bw + 2, 3);
      sc.fillStyle = e.elite ? e.elite.color : '#ff2d55'; sc.fillRect(bx, by, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 1);
    }
  }

  function drawAlly(a) {
    const X = Math.round(sx(a.x, a.y)), Y = Math.round(sy(a.x, a.y, a.z));
    const col = a.kind === 'laptop' ? '#b48bff' : '#4fe9ff';
    groundEllipse(sc, sx(a.x, a.y), sy(a.x, a.y), 0.18, 'rgba(0,0,0,0.3)');
    if (a.kind === 'laptop') {
      sc.fillStyle = '#16161f'; sc.fillRect(X - 5, Y - 6, 10, 6); sc.fillStyle = '#0b0b10'; sc.fillRect(X - 6, Y, 12, 2);
      for (const ctx of [sc, gc]) { ctx.fillStyle = col; ctx.fillRect(X - 4, Y - 5, 8, 4); }
    } else {
      sc.fillStyle = '#262a36'; sc.fillRect(X - 5, Y - 6, 11, 6); sc.fillStyle = '#454b61'; sc.fillRect(X - 4, Y - 7, 9, 2);
      for (const ctx of [sc, gc]) { ctx.fillStyle = col; ctx.fillRect(X - 2, Y - 4, 4, 3); }
      if (a.t < 3 && Math.floor(time * 8) % 2) { sc.fillStyle = '#ff2d55'; sc.fillRect(X - 1, Y - 3, 2, 1); }
    }
    const r = Math.floor(time * 40) % 3;
    sc.fillStyle = 'rgba(180,190,220,0.55)'; sc.fillRect(X - 10 + r, Y - 8, 5, 1); sc.fillRect(X + 5 - r, Y - 8, 5, 1);
    pushLight(a.x, a.y, rgba(col, 0.3), 1);
  }

  function drawDrone(G, e, x, y, flash) {
    const X = Math.round(x), Y = Math.round(y);
    const body = flash ? '#ffffff' : '#262a36', dark = flash ? '#ffffff' : '#14161d', light = flash ? '#ffffff' : '#454b61';
    sc.fillStyle = dark; sc.fillRect(X - 6, Y - 5, 13, 6);
    sc.fillStyle = body; sc.fillRect(X - 5, Y - 6, 11, 6);
    sc.fillStyle = light; sc.fillRect(X - 4, Y - 7, 9, 2);
    const r = Math.floor(time * 40) % 3;
    sc.fillStyle = 'rgba(180,190,220,0.55)'; sc.fillRect(X - 11 + r, Y - 8, 6, 1); sc.fillRect(X + 6 - r, Y - 8, 6, 1);
    const aiming = e.state === 'aim';
    for (const ctx of [sc, gc]) { ctx.fillStyle = '#ff2a4f'; ctx.fillRect(X - 2, Y - 4, 4, 3); ctx.fillStyle = aiming ? '#ffffff' : '#ff2a4f'; ctx.fillRect(X - 1, Y - 3, 2, 1); }
    pushLight(e.x, e.y, aiming ? 'rgba(255,42,79,0.7)' : 'rgba(255,42,79,0.3)', aiming ? 1.6 : 1);
  }

  // helpers for procedural bosses drawn in screen space (mirrored by f)
  function painter(X, Y, f, flash) {
    const C = c => (flash ? mixWhite(c, 0.45) : c);
    return {
      rect(dx, dy, w, h, col, glowCol) { const rx = f > 0 ? X + dx : X - dx - w; sc.fillStyle = C(col); sc.fillRect(Math.round(rx), Math.round(Y + dy), w, h); if (glowCol) { gc.fillStyle = glowCol; gc.fillRect(Math.round(rx), Math.round(Y + dy), w, h); } },
      quad(pts, col) { poly(sc, pts.flatMap(([dx, dy]) => [X + dx * f, Y + dy]), C(col)); },
      line(x0, y0, x1, y1, col, glowCol) { line(sc, X + x0 * f, Y + y0, X + x1 * f, Y + y1, C(col)); if (glowCol) line(gc, X + x0 * f, Y + y0, X + x1 * f, Y + y1, glowCol); },
      circle(cx, cy, r, col, glowCol) { for (let yy = -r; yy <= r; yy++) { const hw = Math.round(Math.sqrt(r * r - yy * yy)); const rx = X + cx * f - hw; sc.fillStyle = C(col); sc.fillRect(rx, Y + cy + yy, hw * 2 + 1, 1); if (glowCol) { gc.fillStyle = glowCol; gc.fillRect(rx, Y + cy + yy, hw * 2 + 1, 1); } } },
    };
  }

  // SRE-дежурный: three metres of armour welded from server racks, two round dashboards for eyes
  function drawGolem(G, e, x, y, flash, flip) {
    const f = flip ? -1 : 1, X = Math.round(x), Y = Math.round(y);
    const p = painter(X, Y, f, flash);
    const step = e.moving ? Math.round(Math.sin(e.anim * 6) * 2) : 0;
    const cast = e.cast || 0, blue = '#3a8bff', ice = '#9fd8ff';
    // legs: short rack stacks
    p.rect(-15, -20 + step, 12, 20 - step, '#262a3a'); p.rect(3, -20 - step, 12, 20 + step, '#262a3a');
    for (let k = 0; k < 3; k++) { p.rect(-12, -17 + k * 5 + step, 7, 1, '#2a3a5a', 'rgba(58,139,255,0.5)'); p.rect(5, -17 + k * 5 - step, 7, 1, '#2a3a5a', 'rgba(58,139,255,0.5)'); }
    // torso: welded racks with cold blue light in the seams
    p.rect(-22, -58, 44, 38, '#2c3246');
    p.rect(15, -58, 7, 38, '#1e2232');
    p.rect(-22, -58, 44, 2, '#47506e');
    p.rect(-22, -58, 1, 38, '#47506e');
    for (let k = 0; k < 6; k++) {
      p.rect(-17, -54 + k * 6, 28, 1, '#0b0c11');
      p.rect(-16, -52 + k * 6, 3 + ((k * 7) % 9), 1, blue, 'rgba(58,139,255,0.9)');
      if (Math.sin(time * 5 + k * 2) > 0) p.rect(6, -52 + k * 6, 1, 1, k % 3 ? '#4dff9a' : '#ff2d55', '#4dff9a');
    }
    p.rect(-1, -58, 2, 38, '#9fd8ff', 'rgba(159,216,255,0.6)');
    // speaker grille
    p.rect(-7, -30, 14, 7, '#0d0e14'); for (let k = 0; k < 3; k++) p.rect(-6, -29 + k * 2, 12, 1, '#2c3144');
    // arms: rack segments; right palm is a cooler grille that fires the scan
    const raise = cast > 0.4 || G.beams.length ? -14 : 0;
    p.rect(-33, -56, 11, 26, '#2a2f42'); p.rect(-34, -30, 13, 8, '#1e2232');
    p.rect(22, -56 + raise, 11, 26, '#2a2f42'); p.rect(21, -30 + raise, 13, 8, '#1e2232');
    for (let k = 0; k < 4; k++) { p.rect(-31, -52 + k * 6, 7, 1, blue, 'rgba(58,139,255,0.7)'); p.rect(24, -52 + k * 6 + raise, 7, 1, blue, 'rgba(58,139,255,0.7)'); }
    p.circle(27, -26 + raise, 4, '#0b0c11'); p.circle(27, -26 + raise, 2, ice, 'rgba(159,216,255,0.9)');
    p.line(23, -26 + raise, 31, -26 + raise, '#0b0c11'); p.line(27, -30 + raise, 27, -22 + raise, '#0b0c11');
    // head with two round dashboard eyes
    p.rect(-17, -77, 34, 19, '#323a52'); p.rect(-17, -77, 34, 2, '#56608a'); p.rect(13, -77, 4, 19, '#232838');
    for (const ex of [-8, 7]) {
      p.circle(ex, -67, 6, '#06070b');
      p.circle(ex, -67, 5, cast > 0.5 ? '#c9e8ff' : '#123a6a', cast > 0.5 ? 'rgba(201,232,255,0.9)' : 'rgba(58,139,255,0.8)');
      for (let k = 0; k < 4; k++) { const hh = 1 + ((k * 5 + Math.floor(time * 6)) % 5); p.rect(ex - 3 + k * 2, -64 - hh, 1, hh, ice, 'rgba(159,216,255,0.9)'); }
    }
    pushLight(e.x, e.y, `rgba(58,139,255,${0.3 + cast * 0.3})`, 2.6);
  }

  // Team Lead-гидра: the body sits at the stand-up; heads are separate enemies on cable necks
  function drawHydraBody(G, e, x, y, flash) {
    const X = Math.round(x), Y = Math.round(y);
    const p = painter(X, Y, 1, flash);
    const stun = e.stun > 0, slump = stun ? 4 : 0;
    p.rect(-11, -16, 9, 16, '#1d2029'); p.rect(2, -16, 9, 16, '#1d2029');
    p.quad([[-17, -44 + slump], [17, -44 + slump], [13, -16], [-13, -16]], '#2c3140');
    p.quad([[-6, -44 + slump], [6, -44 + slump], [2, -20], [-2, -20]], '#d8dae4');
    p.rect(-1, -42 + slump, 2, 14, '#ff3df0', 'rgba(255,61,240,0.6)');
    p.rect(-22, -44 + slump, 6, 22, '#2c3140'); p.rect(16, -44 + slump, 6, 22, '#2c3140');
    p.rect(-22, -23 + slump, 6, 4, '#e2b08c'); p.rect(16, -23 + slump, 6, 4, '#e2b08c');
    // neck stumps (heads attach via cables)
    p.rect(-8, -48 + slump, 16, 5, '#14151d');
    if (stun) for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.57; sc.fillStyle = '#ffd27a'; sc.fillRect(Math.round(X + Math.cos(a) * 9), Math.round(Y - 52 + Math.sin(a) * 2), 1, 1); }
    pushLight(e.x, e.y, stun ? 'rgba(61,255,176,0.45)' : 'rgba(255,61,240,0.3)', 2.4);
  }
  function drawHead(G, h, x, y, flash) {
    const body = h.body;
    if (!body) return;
    const bx = sx(body.x, body.y), by = sy(body.x, body.y, 46);
    // cable neck (quadratic curve)
    const mx = (bx + x) / 2, my = Math.min(by, y) - 14;
    let px = bx, py = by;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, qx = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * x, qy = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * (y - 6);
      line(sc, px, py, qx, qy, '#0b0c11'); line(sc, px, py + 1, qx, qy + 1, h.down > 0 ? '#2a2d3a' : '#3a3f52');
      if (i % 3 === 0 && h.down <= 0) { gc.fillStyle = rgba(h.color, 0.6); gc.fillRect(Math.round(qx), Math.round(qy), 1, 1); }
      px = qx; py = qy;
    }
    const X = Math.round(x), Y = Math.round(y - (h.down > 0 ? -6 : 0));
    const p = painter(X, Y, 1, flash);
    const down = h.down > 0;
    p.rect(-9, -14, 18, 13, '#0d0e14');
    p.rect(-8, -13, 16, 11, down ? '#1a1c24' : h.color, down ? null : rgba(h.color, 0.85));
    if (!down) {
      // angry face
      p.rect(-5, -10, 3, 1, '#05060a'); p.rect(2, -10, 3, 1, '#05060a'); p.rect(-4, -9, 2, 2, '#05060a'); p.rect(2, -9, 2, 2, '#05060a');
      p.rect(-4, -5, 8, 1, '#05060a');
      pushLight(h.x, h.y, rgba(h.color, 0.3), 1.3);
    } else { p.line(-6, -11, 5, -4, '#3a3f52'); p.line(5, -11, -6, -4, '#3a3f52'); }
    if (h.hp < h.maxHp && !down) { sc.fillStyle = '#0a0a10'; sc.fillRect(X - 9, Y - 18, 18, 3); sc.fillStyle = h.color; sc.fillRect(X - 8, Y - 17, Math.max(1, Math.round(16 * h.hp / h.maxHp)), 1); }
  }

  // CEO: the skeleton king from the concept — or your previous hero, crowned
  function drawCeo(G, e, x, y, flash, flip) {
    const X = Math.round(x), Y = Math.round(y);
    const cast = e.cast || 0;
    if (e.prevHero) {
      const P = G.player;
      const set = S().heroCeo, facing = (P.x + P.y) > (e.x + e.y) ? 'front' : 'back';
      const spr = set[facing][e.moving ? 1 + (Math.floor(e.anim * 8) % 2) : 0];
      const img = flash ? spr.flash : spr.img, w = spr.w * 2, h = spr.h * 2;
      const dx = X - w / 2, dy = Y - h + 2;
      sc.save(); if (flip) { sc.translate(X * 2, 0); sc.scale(-1, 1); }
      sc.drawImage(img, dx, dy, w, h);
      if (spr.glow) { gc.save(); if (flip) { gc.translate(X * 2, 0); gc.scale(-1, 1); } gc.drawImage(spr.glow, dx, dy, w, h); gc.restore(); }
      sc.restore();
      const p = painter(X, Y, 1, flash);
      p.rect(-7, -h - 2, 14, 3, '#ffc04a', 'rgba(255,192,74,0.8)');
      for (const [ddx, hh] of [[-7, 4], [-3, 3], [0, 6], [3, 3], [6, 4]]) p.rect(ddx, -h - 2 - hh, 1 + (ddx === 0 ? 1 : 0), hh, '#ffc04a', 'rgba(255,192,74,0.8)');
      pushLight(e.x, e.y, `rgba(255,43,71,${0.35 + cast * 0.3})`, 2.8);
      return;
    }
    const f = flip ? -1 : 1, p = painter(X, Y, f, flash);
    const step = e.moving ? Math.round(Math.sin(e.anim * 8) * 2) : 0, br = Math.round(Math.sin(time * 2));
    p.rect(-10, -20 + step, 8, 20 - step, '#141018'); p.rect(2, -20 - step, 8, 20 + step, '#141018');
    p.rect(-11, -2, 10, 2, '#06050a'); p.rect(1, -2, 10, 2, '#06050a');
    p.quad([[-17, -50 + br], [17, -50 + br], [13, -18], [-13, -18]], '#1a1420');
    p.quad([[-5, -50 + br], [5, -50 + br], [1, -26], [-1, -26]], '#d8d4dc');
    p.rect(-1, -48 + br, 2, 18, '#b0102a');
    p.rect(-23, -50 + br, 6, 28, '#1a1420'); p.rect(17, -50 + br, 6, 28, '#1a1420');
    p.rect(-23, -23, 6, 4, '#d8d4cc'); p.rect(17, -23, 6, 4, '#d8d4cc');
    // skull
    p.quad([[-8, -52 + br], [-9, -62 + br], [-6, -68 + br], [6, -68 + br], [9, -62 + br], [8, -52 + br]], '#e8e2d4');
    p.rect(-6, -63 + br, 4, 4, '#05040a', null); p.rect(2, -63 + br, 4, 4, '#05040a');
    p.rect(-5, -62 + br, 2, 2, cast > 0.3 ? '#ffffff' : '#ff2b47', 'rgba(255,43,71,1)'); p.rect(3, -62 + br, 2, 2, cast > 0.3 ? '#ffffff' : '#ff2b47', 'rgba(255,43,71,1)');
    for (let k = -4; k <= 4; k += 2) p.rect(k, -55 + br, 1, 2, '#05040a');
    // crown
    p.rect(-8, -71 + br, 16, 3, '#ffc04a', 'rgba(255,192,74,0.9)');
    for (const [dx, hh] of [[-8, 5], [-4, 4], [0, 7], [4, 4], [7, 5]]) p.rect(dx, -71 + br - hh, 1 + (dx === 0 ? 1 : 0), hh, '#ffc04a', 'rgba(255,192,74,0.9)');
    p.rect(-1, -76 + br, 2, 2, '#ff2b47', 'rgba(255,43,71,1)');
    pushLight(e.x, e.y, `rgba(255,43,71,${0.3 + cast * 0.3})`, 3);
  }

  const mixCache = new Map();
  function mixWhite(hex, k) {
    const key = hex + k;
    let v = mixCache.get(key);
    if (!v) {
      const n = parseInt(hex.slice(1), 16), m = c => Math.round(c + (255 - c) * k);
      v = `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
      mixCache.set(key, v);
    }
    return v;
  }

  // ---------------------------------------------------------------- lights
  const dynLights = [];
  function pushLight(x, y, color, r) { dynLights.push([sx(x, y), sy(x, y), color, r]); }
  function pushLightPx(px, py, color, r) { dynLights.push([px, py + 10, color, r]); }

  function drawLights(G) {
    const P = G.player;
    if (P.alive) pushLight(P.x, P.y, 'rgba(79,233,255,0.22)', 2);
    for (const l of G.lights) {
      const a = l.life / l.max;
      pushLight(l.x, l.y, l.color.replace(/[\d.]+\)$/, m => (parseFloat(m) * a).toFixed(3) + ')'), l.r);
    }
    for (const h of G.hazards) if (h.warn <= 0) pushLight(h.x, h.y, h.kind === 'ritual' ? 'rgba(255,42,79,0.5)' : 'rgba(255,140,40,0.55)', h.r * 2);
    sc.globalCompositeOperation = 'lighter'; sc.imageSmoothingEnabled = true;
    for (const [x, y, color, r] of dynLights) {
      const spr = lightSprite(color);
      const rw = r * 46, rh = r * 23;
      sc.drawImage(spr, x - rw / 2, y - rh / 2, rw, rh);
    }
    sc.globalCompositeOperation = 'source-over'; sc.imageSmoothingEnabled = false;
    dynLights.length = 0;
  }

  // ---------------------------------------------------------------- particles
  function drawParticles(G) {
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        const k = 1 - p.life / p.max;
        const r = p.r0 + (p.r1 - p.r0) * EJ.ease(k);
        const col = rgba(p.color, a);
        groundEllipse(sc, sx(p.x, p.y), sy(p.x, p.y), r, col, p.width);
        groundEllipse(gc, sx(p.x, p.y), sy(p.x, p.y), r, col, p.width);
        continue;
      }
      const X = Math.round(sx(p.x, p.y)), Y = Math.round(sy(p.x, p.y, p.z));
      if (X < -4 || Y < -4 || X > W + 4 || Y > H + 4) continue;
      if (p.kind === 'spark') {
        sc.globalAlpha = a; sc.fillStyle = p.color; sc.fillRect(X, Y, p.size, p.size);
        gc.globalAlpha = a; gc.fillStyle = p.color; gc.fillRect(X, Y, p.size + 1, p.size + 1);
        sc.globalAlpha = 1; gc.globalAlpha = 1;
      } else if (p.kind === 'pix') {
        sc.fillStyle = p.color; sc.globalAlpha = Math.min(1, a * 2); sc.fillRect(X, Y, p.size, p.size); sc.globalAlpha = 1;
      } else if (p.kind === 'smoke') {
        sc.globalAlpha = a * 0.6; sc.fillStyle = p.color; const s = Math.round(p.size); sc.fillRect(X - (s >> 1), Y - (s >> 1), s, s); sc.globalAlpha = 1;
      }
    }
  }

  // ambient floating dust in the neon haze
  const motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.2 + Math.random() * 0.8, p: Math.random() * 10 }));
  function drawMotes(G) {
    for (const m of motes) {
      const X = Math.round(((m.x * W + time * 3 * m.s + G.cam.x * -0.15 * m.s) % W + W) % W);
      const Y = Math.round(((m.y * H - time * 2 * m.s + G.cam.y * -0.15 * m.s) % H + H) % H);
      const a = 0.08 + Math.sin(time * 1.3 + m.p) * 0.06;
      sc.fillStyle = `rgba(180,200,255,${a})`; sc.fillRect(X, Y, 1, 1);
    }
  }

  // ---------------------------------------------------------------- composite + bloom
  function blurPass(src, dst, px) {
    const g = dst.getContext('2d');
    g.clearRect(0, 0, dst.width, dst.height);
    g.imageSmoothingEnabled = true;
    if (hasFilter) g.filter = `blur(${px}px)`;
    g.drawImage(src, 0, 0, dst.width, dst.height);
    if (hasFilter) g.filter = 'none';
  }
  function composite(G) {
    dctx.globalCompositeOperation = 'source-over';
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(scene, 0, 0, W * scale, H * scale);
    blurPass(glow, b1, 1);
    blurPass(b1, b2, 1.5);
    blurPass(b2, b3, 2);
    dctx.imageSmoothingEnabled = true;
    dctx.globalCompositeOperation = 'lighter';
    dctx.globalAlpha = 0.55; dctx.drawImage(b1, 0, 0, W * scale, H * scale);
    dctx.globalAlpha = 0.65; dctx.drawImage(b2, 0, 0, W * scale, H * scale);
    dctx.globalAlpha = 0.8; dctx.drawImage(b3, 0, 0, W * scale, H * scale);
    dctx.globalAlpha = 1;
    dctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- crisp overlay (full resolution)
  function label(text, X, Y, size, color) {
    dctx.font = `700 ${size}px "Oswald", "Arial Narrow", sans-serif`;
    dctx.lineWidth = Math.max(2, scale * 0.9); dctx.strokeStyle = 'rgba(5,5,12,0.9)';
    dctx.strokeText(text, X, Y); dctx.fillStyle = color; dctx.fillText(text, X, Y);
  }
  function drawOverlay(G) {
    const k = scale;
    dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
    for (const e of G.enemies) {
      if (e.spawnT > 0) continue;
      if (e.elite) label(e.elite.name, sx(e.x, e.y) * k, (sy(e.x, e.y) - 36) * k, Math.round(4.5 * k), e.elite.color);
      if (e.type === 'head' && e.down <= 0) label(e.hk.name, sx(e.x, e.y) * k, (sy(e.x, e.y, e.z) - 22) * k, Math.round(4 * k), e.color);
    }
    for (const n of G.npcs) if (n.visible !== false && n.say > 0) {
      dctx.globalAlpha = Math.min(1, n.say);
      label(n.name, sx(n.x, n.y) * k, (sy(n.x, n.y) - 32) * k, Math.round(4 * k), '#c9cbe0');
      dctx.globalAlpha = 1;
    }
    const R0 = G.L.rooms[0];
    if (R0.shelf && G.shop) G.shop.forEach((it, i) => {
      if (it.sold) return;
      const p = R0.shelf, X = sx(p.x + 0.4 + i * 0.8, p.y + 0.3) * k, Y = (sy(p.x + 0.4 + i * 0.8, p.y + 0.3, p.h + 24)) * k;
      label(`${it.price} ◆`, X, Y, Math.round(4.5 * k), G.player.gold >= it.price ? '#ffd166' : '#8a8090');
    });
    for (const f of G.floaters) {
      const a = 1 - Math.max(0, (f.t - f.life * 0.6) / (f.life * 0.4));
      const pop = f.t < 0.1 ? 1 + (0.1 - f.t) * 4 : 1;
      dctx.globalAlpha = a;
      label(f.text, sx(f.x, f.y) * k, sy(f.x, f.y, f.z) * k, Math.round((f.big ? 7.5 : 5.5) * k * pop), f.color);
    }
    dctx.globalAlpha = 1;
    const m = EJ.input.mouse;
    if (m.over && G.state === 'play') {
      const X = m.x * dpr, Y = m.y * dpr;
      const r = 7 * dpr + (G.player.fireCd > 0 ? 2 * dpr : 0);
      const col = G.player.defending ? '#9fd8ff' : '#4fe9ff';
      dctx.save(); dctx.translate(X, Y); dctx.rotate(time * 1.5);
      dctx.strokeStyle = col; dctx.lineWidth = 2 * dpr; dctx.shadowColor = col; dctx.shadowBlur = 8 * dpr;
      for (let i = 0; i < 4; i++) { dctx.rotate(Math.PI / 2); dctx.beginPath(); dctx.moveTo(r, 0); dctx.lineTo(r + 5 * dpr, 0); dctx.stroke(); }
      dctx.restore();
      dctx.fillStyle = '#ffffff'; dctx.fillRect(X - dpr, Y - dpr, 2 * dpr, 2 * dpr);
    }
  }

  return { init, resize, frame, screenToWorld, worldToCss, get scale() { return scale; }, get dpr() { return dpr; }, get size() { return [W, H]; } };
})();
