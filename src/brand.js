/* Monolith Corp — one vector master for SVG exports and both Canvas art styles. */
'use strict';
(() => {
  // Three separate towers, including the stepped foot of the central monolith.
  // Coordinates are normalized to a 104 × 128 transparent artboard.
  const towers = [
    [8, 53, 31, 34, 31, 105, 8, 124],
    [39, 13, 52, 0, 65, 13, 65, 94, 54, 94, 54, 114, 39, 128],
    [73, 34, 96, 53, 96, 124, 73, 107],
  ];
  const palette = Object.freeze({ amber: '#ffad60', ivory: '#efd1ad', red: '#ff263d', gray: '#777b82', ink: '#171b23' });
  const tagline = 'PEOPLE · DATA · PROGRESS';
  const lockups = new Map();
  let loading;
  function load() {
    if (!loading) loading = Promise.all(['amber', 'red'].map(variant => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { lockups.set(palette[variant], img); resolve(); };
      img.onerror = () => resolve();
      img.src = `assets/brand/monolith-lockup-${variant}.svg`;
    })));
    return loading;
  }
  function drawMark(ctx, x, y, w, h = w * 128 / 104, color = palette.amber, pixel = false) {
    ctx.save();
    if (pixel) {
      for (const tower of towers) {
        const points = tower.map((n, i) => i % 2 ? y + n * h / 128 : x + n * w / 104);
        EJ.poly(ctx, points, color);
      }
    } else {
      ctx.translate(x, y); ctx.scale(w / 104, h / 128); ctx.fillStyle = color;
      for (const tower of towers) {
        ctx.beginPath(); ctx.moveTo(tower[0], tower[1]);
        for (let i = 2; i < tower.length; i += 2) ctx.lineTo(tower[i], tower[i + 1]);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawSign(ctx, x, y, w, h, { color = palette.amber, emissive = false, background = true, logo = true } = {}) {
    ctx.save();
    if (!emissive && background) {
      ctx.fillStyle = '#12151d'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#514038'; ctx.lineWidth = .6; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      // Mounting rivets stay subdued so the mark remains legible at game scale.
      ctx.fillStyle = '#79685a';
      for (const dx of [2, w - 3]) for (const dy of [2, h - 3]) ctx.fillRect(x + dx, y + dy, 1, 1);
    }
    if (emissive) ctx.globalAlpha *= .65;
    if (!logo) { ctx.restore(); return; }
    // Use the actual exported logo, including its outlined lettering. The old
    // stacked mark + separately typeset name must not replace the game asset.
    const image = lockups.get(color);
    const lw = Math.min(w - 10, (h - 6) * 520 / 128), lh = lw * 128 / 520;
    const lx = x + (w - lw) / 2, ly = y + (h - lh) / 2;
    if (image) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, lx, ly, lw, lh);
    } else {
      // Offline/missing-file fallback uses the same horizontal composition.
      drawMark(ctx, lx, ly, lh * 104 / 128, lh, color, true);
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(3, lh * .29)}px monospace`;
      ctx.fillText('MONOLITH CORP', lx + lw * .23, ly + lh * .43, lw * .76);
      ctx.font = `${Math.max(2, lh * .1)}px monospace`;
      ctx.fillText(tagline, lx + lw * .23, ly + lh * .72, lw * .76);
    }
    ctx.restore();
  }
  function markSvg(color = palette.amber) {
    return towers.map(t => `<polygon points="${t.reduce((a,n,i) => a + (i ? (i % 2 ? ',' : ' ') : '') + n, '')}" fill="${color}"/>`).join('');
  }
  const brand = { towers, palette, tagline, load, drawMark, drawSign, markSvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = brand;
  if (typeof EJ !== 'undefined') EJ.brand = brand;
})();
