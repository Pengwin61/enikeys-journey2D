/* Enikey Journey — DOM HUD, tracker, minimap and menu screens. */
'use strict';
EJ.hud = (() => {
  const $ = id => document.getElementById(id);
  const cache = {};
  const set = (id, prop, value) => {
    const k = id + prop;
    if (cache[k] === value) return false;
    cache[k] = value;
    const el = $(id);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'html') el.innerHTML = value;
    return true;
  };
  const timers = { banner: 0, toast: 0, loot: 0, speech: 0 };
  const ICON = { screwdriver: '🪛', crimper: '🔌', mug: '☕', laptop: '💻', multimeter: '📟', license: '🪟', badge: '🪪', usb: '💾', cert: '📜', can: '🥫', coffee: '🫘', pills: '💊', paste: '🧴', bandage: '🩹', cap: '🧢' };
  EJ.ICON = ICON;
  let speechTarget = null;

  function init() {
    const p = $('portrait'), spr = EJ.sprites.portrait;
    p.width = spr.w; p.height = spr.h;
    p.getContext('2d').drawImage(spr.img, 0, 0);
    $('itemSlots').innerHTML = EJ.ACTIVE_SLOTS.map((id, i) => {
      const it = EJ.ITEMS[id];
      return `<div class="islot empty" data-item="${id}" data-slot="${i + 1}" title="${it.name}: +${it.value} ${it.text}"><kbd>${i + 1}</kbd><div class="icon">${ICON[it.icon]}<b></b></div><small>${it.name}</small></div>`;
    }).join('');
  }
  function show(on) { $('hud').hidden = !on; }

  const burnLabel = v => (v < 20 ? 'норма' : v < 40 ? 'устал' : v < 60 ? 'перегрузка' : v < 80 ? 'на пределе' : 'выгорает');

  function update(G, dt) {
    const P = G.player;
    set('hpText', 'text', `${Math.ceil(P.hp.cur)} / ${P.hp.max}`);
    set('hpFill', 'width', `${(100 * P.hp.cur) / P.hp.max}%`);
    set('enText', 'text', `⚡ ${P.energy.cur} / ${P.energy.max}`);
    set('enFill', 'width', `${(100 * P.energy.cur) / P.energy.max}%`);
    set('boText', 'text', `🔥 ${Math.round(P.burnout.cur)}% · ${burnLabel(P.burnout.cur)}`);
    set('boFill', 'width', `${P.burnout.cur}%`);
    $('boFill').parentElement.classList.toggle('hot', P.burnout.cur >= 60);
    set('xpFill', 'width', `${(100 * P.exp.cur) / P.exp.max}%`);
    set('lvl', 'text', String(P.level));
    set('rank', 'text', `${EJ.ent.rank(P)} · место 503${G.cycle ? ' · цикл ' + (G.cycle + 1) : ''}`);
    if (set('gold', 'text', String(P.gold))) bump('gold');
    const need = G.floor.passes;
    if (set('passes', 'text', need ? `${P.passes}/${need}` : String(P.passes))) bump('passes');
    set('vulnChance', 'text', `${EJ.ent.vulnChance(P)}%`);
    set('qCost', 'text', `⚡${EJ.ent.scanCost(P)}`);
    const slot = s => document.querySelector(`.slot[data-slot="${s}"]`);
    slot('q').querySelector('.cd').style.transform = `scaleY(${Math.max(0, P.scanCd / 1.2)})`;
    slot('dash').querySelector('.cd').style.transform = `scaleY(${Math.max(0, P.dashCd / 0.75)})`;
    slot('q').classList.toggle('locked', P.energy.cur < EJ.ent.scanCost(P));
    slot('def').classList.toggle('parry', P.parryT > 0);
    slot('def').classList.toggle('ready', P.defending);
    for (const el of document.querySelectorAll('.islot')) {
      const id = el.dataset.item, has = id in P.inv;
      el.classList.toggle('empty', !has);
      const g = has ? EJ.GRADES[P.inv[id]] : null;
      const key = has ? g.name : '';
      if (el.dataset.g !== key) { el.dataset.g = key; el.querySelector('.icon').style.borderColor = has ? g.color : ''; el.querySelector('b').textContent = has && P.inv[id] ? g.name[0] : ''; el.querySelector('b').style.color = has ? g.color : ''; }
    }

    $('hurt').style.opacity = String(Math.max(0, G.hurtFlash));
    $('burnfx').style.opacity = String(Math.max(0, G.burnFlash || 0) * 0.8 + (P.burnout.cur > 80 ? 0.25 : 0));
    $('lowhp').style.opacity = P.alive && P.hp.cur / P.hp.max < 0.3 ? '1' : '0';
    $('hud').classList.toggle('cine', !!G.cinematic);

    // tracker
    const hh = Math.floor(G.clock / 60) % 24, mm = Math.floor(G.clock % 60);
    set('dayLabel', 'text', G.floor.key === 'penthouse' ? 'Пентхаус' : `День ${G.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    $('dayLabel').classList.toggle('ot', !!G.overtime);
    const sig = (G.tickets || []).map(t => t.id + t.state + (G.selTicket === t)).join('|');
    if (set('tickets', 'sig', sig) || cache.ticketsHtml !== sig) {
      cache.ticketsHtml = sig;
      $('tickets').innerHTML = (G.tickets || []).map((t, i) => {
        const q = t.quest;
        const cost = t.kind === 'normal' ? `<span class="tcost"><span class="e">⏱ ${Math.round((1.6 + q.exp * 0.45) * 10) / 10}с</span> · <span class="b">🔥${q.burnout}</span>${q.gold ? ` · <span class="g">${q.gold}◆</span>` : ''} · ${q.exp} XP</span>` : `<span class="tcost">${t.sub}</span>`;
        return `<li class="${t.kind} ${t.state}${G.selTicket === t ? ' sel' : ''}" data-i="${i}"><span class="tid">${t.id}${t.kind === 'elite' ? ' · ЭЛИТА' : t.kind === 'boss' ? ' · БОСС' : ''}</span><span class="tname">${t.title}</span>${cost}<i class="tprog" style="width:0"></i></li>`;
      }).join('') || '<li class="done"><span class="tname">Тасок нет. Закрой день на месте 503.</span></li>';
    }
    (G.tickets || []).forEach((t, i) => { const el = $('tickets').children[i]; if (el) { const bar = el.querySelector('.tprog'); if (bar) bar.style.width = `${(t.progress || 0) * 100}%`; } });

    // boss bar
    const boss = G.enemies.find(e => ['golem', 'hydra', 'ceo'].includes(e.type));
    $('bossbar').hidden = !boss || !!G.cinematic;
    if (boss) {
      set('bossName', 'text', boss.bossName);
      set('bossFill', 'width', `${Math.max(0, (100 * boss.hp) / boss.maxHp)}%`);
      set('bossHp', 'text', `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`);
      let sub = '';
      if (boss.type === 'golem') sub = `Фаза ${boss.phase} · ${EJ.boss.GOLEM_PHASES[boss.phase].name}`;
      if (boss.type === 'ceo') sub = `Фаза ${boss.phase} · ${EJ.boss.CEO_PHASES[boss.phase].name}`;
      if (boss.type === 'hydra') { const up = boss.heads ? boss.heads.filter(h => h.down <= 0).length : 3; sub = boss.stun > 0 ? 'Беззащитен!' : `Голов в работе: ${up} / ${boss.heads ? boss.heads.length : 3}`; }
      set('bossPhase', 'text', sub);
    }

    // prompt
    const pr = $('prompt');
    if (G.prompt) {
      const [x, y] = EJ.render.worldToCss(G.prompt.x, G.prompt.y, G.prompt.z || 40);
      pr.style.left = x + 'px'; pr.style.top = y + 'px';
      set('promptText', 'text', G.prompt.text);
      pr.classList.add('show'); pr.classList.toggle('bad', !!G.prompt.bad);
    } else pr.classList.remove('show');
    // speech bubble follows its NPC
    const sp = $('speech');
    if (speechTarget && timers.speech > 0) {
      const [x, y] = EJ.render.worldToCss(speechTarget.x, speechTarget.y, 40);
      sp.style.left = x + 'px'; sp.style.top = y + 'px'; sp.classList.add('show');
    } else sp.classList.remove('show');

    for (const k of Object.keys(timers)) if (timers[k] > 0 && (timers[k] -= dt) <= 0) ({ banner: () => $('banner').classList.remove('show'), toast: () => $('toast').classList.remove('show'), loot: () => $('lootCard').classList.remove('show'), speech: () => { speechTarget = null; } })[k]();
    drawMinimap(G);
  }

  function bump(id) { const el = $(id).parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function objective(text) { set('objMain', 'text', text); }
  function floor(G) { set('floorName', 'text', `${G.floor.label} · ${G.floor.name}`); set('dept', 'text', G.floor.dept); }
  function banner(title, sub = '', color = '#ff2d55', time = 2.2) {
    $('bannerTitle').textContent = title; $('bannerSub').textContent = sub;
    $('banner').style.setProperty('--bc', color); $('banner').classList.add('show'); timers.banner = time;
  }
  function toast(text, time = 3) { $('toast').textContent = text; $('toast').classList.add('show'); timers.toast = time; }
  function alert(text) { const el = $('alert'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); el.onanimationend = () => el.classList.remove('show'); }
  function loot(id, grade, got) {
    const it = EJ.ITEMS[id], g = EJ.GRADES[grade];
    const v = Math.max(1, Math.round(it.value * g.mul));
    $('lootCard').style.setProperty('--lc', g.color);
    $('lootIco').textContent = ICON[it.icon];
    $('lootGrade').textContent = `${g.name} · ${it.type === 'A' ? 'активный [A]' : 'пассивный [P]'}`;
    $('lootName').textContent = it.name;
    $('lootText').textContent = got ? `${it.type === 'A' ? `Клавиша ${it.slot}: ` : ''}+${v} ${it.text}.${it.mod ? ' ⚙ ' + it.mod + '.' : ' ' + it.desc + '.'}` : 'Уже есть такой. Сдан на склад за золото.';
    $('lootCard').classList.add('show'); timers.loot = 3.5;
  }
  function speech(npc, name, text, time = 4) { speechTarget = npc; $('speechName').textContent = name; $('speechText').textContent = text; timers.speech = time; }
  function flashSlot(s) {
    const el = document.querySelector(`.slot[data-slot="${s}"]`) || document.querySelector(`.islot[data-slot="${s}"]`);
    if (!el) return; el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
  }

  // ------------------------------------------------ minimap (iso-projected like the game)
  let mm, mctx, mmW = 0, mmH = 0;
  function drawMinimap(G) {
    if (!mm) { mm = $('minimap'); mctx = mm.getContext('2d'); }
    const r = mm.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (Math.round(r.width * dpr) !== mmW || Math.round(r.height * dpr) !== mmH) { mmW = mm.width = Math.round(r.width * dpr); mmH = mm.height = Math.round(r.height * dpr); }
    const L = G.L, ctx = mctx;
    ctx.clearRect(0, 0, mmW, mmH);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const R of L.rooms) for (const [x, y] of [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]]) {
      minX = Math.min(minX, x - y); maxX = Math.max(maxX, x - y); minY = Math.min(minY, (x + y) / 2); maxY = Math.max(maxY, (x + y) / 2);
    }
    const s = Math.min((mmW - 20) / (maxX - minX), (mmH - 20) / (maxY - minY));
    const offX = (mmW - (maxX - minX) * s) / 2 - minX * s, offY = (mmH - (maxY - minY) * s) / 2 - minY * s;
    const T = (x, y) => [offX + (x - y) * s, offY + ((x + y) / 2) * s];
    const diamond = (x, y, w, h) => { ctx.beginPath(); ctx.moveTo(...T(x, y)); ctx.lineTo(...T(x + w, y)); ctx.lineTo(...T(x + w, y + h)); ctx.lineTo(...T(x, y + h)); ctx.closePath(); };
    const known = new Set();
    for (const R of L.rooms) if (R.visited) { known.add(R.id); R.links.forEach(l => known.add(l)); }
    // the badge shows the whole floor plan once you have it (canon: схема этажа на бейджике)
    if (G.badgeMap) L.rooms.forEach(R => known.add(R.id));
    ctx.lineWidth = Math.max(2, s * 1.6); ctx.strokeStyle = 'rgba(120,130,170,0.35)';
    for (const R of L.rooms) if (known.has(R.id)) for (const l of R.links) if (known.has(l)) { const Q = L.rooms[l]; ctx.beginPath(); ctx.moveTo(...T(R.ccx + 0.5, R.ccy + 0.5)); ctx.lineTo(...T(Q.ccx + 0.5, Q.ccy + 0.5)); ctx.stroke(); }
    const icon = (R, text, col) => { const [cx, cy] = T(R.cx, R.cy); ctx.fillStyle = col; ctx.font = `700 ${11 * dpr}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy); };
    for (const R of L.rooms) {
      if (!known.has(R.id)) continue;
      diamond(R.x, R.y, R.w, R.h);
      ctx.fillStyle = R.active ? 'rgba(255,45,85,0.35)' : R.sealed ? 'rgba(80,40,130,0.5)' : R.visited ? 'rgba(60,66,96,0.75)' : 'rgba(40,44,64,0.45)';
      ctx.fill();
      ctx.strokeStyle = R.active ? G.floor.accent : 'rgba(170,180,220,0.45)'; ctx.lineWidth = dpr; ctx.stroke();
      if (R.type === 'start') icon(R, '503', '#9fd8ff');
      if (R.type === 'lift' || R.type === 'lobby') icon(R, '⇧', L.elevator && !L.elevator.locked ? '#4dff9a' : '#ff2d55');
      if (R.type === 'boss') icon(R, '☠', '#ff3df0');
      if (R.type === 'throne') icon(R, '♛', '#ffc04a');
      if (R.incident && !R.cleared && R.visited) icon(R, '!', '#ff2d55');
    }
    for (const t of G.tickets || []) {
      if (!t.target || t.state === 'done') continue;
      const [x, y] = T(t.target.x + t.target.w / 2, t.target.y + t.target.d / 2);
      ctx.fillStyle = t.kind === 'elite' ? '#b26bff' : t.kind === 'boss' ? '#ff2d55' : '#3fd8ff';
      const z = (G.selTicket === t ? 5 : 3.5) * dpr;
      ctx.beginPath(); ctx.moveTo(x, y - z); ctx.lineTo(x + z, y); ctx.lineTo(x, y + z); ctx.lineTo(x - z, y); ctx.closePath(); ctx.fill();
    }
    const P = G.player, [px, py] = T(P.x, P.y);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(79,233,255,${0.5 + Math.sin(performance.now() / 200) * 0.4})`; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(px, py, 6 * dpr, 0, Math.PI * 2); ctx.stroke();
  }

  // ------------------------------------------------ screens
  function screen(id, on) { $(id).hidden = !on; }

  function stats(id, G) {
    const t = Math.floor(G.stats.time), P = G.player;
    const items = [
      ['Дней', G.day], ['Тасок закрыто', G.stats.tickets], ['Боссов', P.bossesDefeated], ['Уровень', P.level],
      ['Убито', G.stats.kills], ['Время', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`],
    ];
    $(id).innerHTML = items.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  }

  function inventory(G) {
    const P = G.player;
    $('invStats').innerHTML = [
      ['Навык', P.skill], ['Удача', P.luck], ['Крит', `${15 + P.skill * 2}%`], ['Уязвимость', `${EJ.ent.vulnChance(P)}%`],
      ['Урон', `${(7 + P.skill) * 0.35 | 0}–${(10 + P.skill) * 0.35 | 0}`], ['Штраф выгорания', `${Math.round((1 - EJ.ent.burnoutFactor(P)) * 100)}%`], ['Пропуска', P.passes], ['Золото', P.gold],
    ].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
    const ids = Object.keys(P.inv);
    $('invList').innerHTML = ids.map(id => {
      const it = EJ.ITEMS[id], g = EJ.GRADES[P.inv[id]];
      const v = Math.max(1, Math.round(it.value * g.mul));
      return `<div style="--lc:${g.color}"><i>${ICON[it.icon]}</i><p style="margin:0"><b style="color:${g.color}">${it.name}</b><span>${it.stat ? `+${v} ${it.text}` : it.desc}${it.mod ? `<br>⚙ ${it.mod}` : ''}</span></p><em class="tag">${it.type === 'A' ? `A · ${it.slot}` : 'P'}</em></div>`;
    }).join('') || '<p class="muted">Пусто.</p>';
  }

  return { init, show, update, objective, floor, banner, toast, alert, loot, speech, flashSlot, screen, stats, inventory };
})();
