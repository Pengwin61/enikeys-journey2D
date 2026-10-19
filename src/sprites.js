/* Enikey Journey — pixel-art sprites built from text templates.
   Every sprite gets: base image, emissive-only image (for bloom), white hit-flash, and a silhouette. */
'use strict';
(() => {
  const EMISSIVE = new Set(['t', 'T', 'R', 'X', 'Y', 'E', 'c', 'C', 'v', 'Q', 'L']);

  function build(rows, pal, opts = {}) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const mk = () => EJ.canvas(w, h);
    const img = mk(), glow = mk(), flash = mk(), sil = mk();
    const gi = img.getContext('2d'), gg = glow.getContext('2d'), gf = flash.getContext('2d'), gs = sil.getContext('2d');
    gf.fillStyle = '#ffffff'; gs.fillStyle = 'rgba(120,230,255,0.55)';
    let hasGlow = false;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = pal[ch];
        if (!col) continue;
        gi.fillStyle = col; gi.fillRect(x, y, 1, 1);
        gf.fillRect(x, y, 1, 1);
        gs.fillRect(x, y, 1, 1);
        if (EMISSIVE.has(ch) && !(opts.noGlow || '').includes(ch)) { gg.fillStyle = col; gg.fillRect(x, y, 1, 1); hasGlow = true; }
      }
    });
    return { img, glow: hasGlow ? glow : null, flash, sil, w, h };
  }

  // ------------------------------------------------------------ hero: the enikey in the black MBGA cap
  const HERO_PAL = {
    k: '#0b0a12', h: '#4a2c1a', c: '#17161f', Q: '#3fd8ff', s: '#e9b48f', S: '#b98060', g: '#14121b', G: '#bff6ff',
    o: '#55693a', O: '#394827', l: '#768c50', b: '#7a4a26', B: '#56331b', i: '#d9d2c0',
    t: '#4fe9ff', T: '#d2feff', p: '#262a38', P: '#181a25', w: '#e3e3ea', r: '#d23a4c',
  };
  const CAP_FRONT = [
    '....kkkkkk....',
    '...kccQQcck...',
    '..kcccQQccck..',
    '..kkkkkkkkkkk.',
  ];
  const CAP_BACK = [
    '....kkkkkk....',
    '...kcccccck...',
    '..kcccccccck..',
    '..kkkkkkkkkk..',
  ];
  const FRONT = [
    ...CAP_FRONT,
    '..khhshhhshk..',
    '..khssssssSk..',
    '..khgGsggGsk..',
    '..khssssssSk..',
    '..kssssSssSk..',
    '...kSsssSSk...',
    '..bkoooooOkb..',
    '.bBolooooOOBb.',
    '.kOloooottTtk.',
    '.kOlooootttsk.',
    '.ksloooooottk.',
    '..kOOoooOOk...',
    '..kpppppppk...',
  ];
  const BACK = [
    ...CAP_BACK,
    '..khhhhhhhhk..',
    '..khhhHhhhhk..',
    '..khhhhhhhhk..',
    '..kShhhhhhSk..',
    '..ksShhhhSsk..',
    '...kSssssSk...',
    '..kobbbbbbok..',
    '.kobBBBBBBbok.',
    '.kobBiiBBBbok.',
    '.kobBiiBBBbok.',
    '.ksbBBBBBBbsk.',
    '..kbbbbbbbbk..',
    '..kpppppppk...',
  ];
  const LEGS = [
    ['..kppPkppPk...', '..kppPkppPk...', '..kwwrkwwrk...', '..kkkk.kkkk...'],
    ['..kppPkppPk...', '.kppPk.kpPk...', '.kwwrk..kwrk..', '.kkkk...kkk...'],
    ['..kppPkppPk...', '...kpPk.kppPk.', '...kwrk..kwwrk', '....kkk..kkkk.'],
  ];
  const heroSet = pal => {
    const set = { front: [], back: [] };
    for (const legs of LEGS) { set.front.push(build([...FRONT, ...legs], pal)); set.back.push(build([...BACK, ...legs], pal)); }
    return set;
  };
  const hero = heroSet(HERO_PAL);
  // the previous hero, now CEO: logo burns red, eyes glow
  const heroCeo = heroSet({ ...HERO_PAL, Q: '#ff2b47', G: '#ff2b47', t: '#ff2b47', T: '#ffb0bb', o: '#2a2230', O: '#1c1622', l: '#3a3044' });

  // ------------------------------------------------------------ office people (elites & NPCs) share one body template
  const HUMAN = [
    '....kkkkkk....',
    '...kHHHHHHk...',
    '..kHHHHHHHHk..',
    '..kHHHHHHHHk..',
    '..kHHsHHHsHk..',
    '..kHssssssSk..',
    '..kHseesseSk..',
    '..kHssssssSk..',
    '..kssssSssSk..',
    '...kSsmmSSk...',
    '..kkTTTTTTkk..',
    '.kTTTTTTTTTTk.',
    '.kTTTTaaTTTTk.',
    '.kTTTTTTTTTTk.',
    '.ksTTTTTTTTsk.',
    '..kTTTTTTTTk..',
    '..kpppppppk...',
  ];
  const HLEGS = [
    ['..kppPkppPk...', '..kppPkppPk...', '..kwwwkwwwk...', '..kkkk.kkkk...'],
    ['..kppPkppPk...', '.kppPk.kpPk...', '.kwwwk..kwwk..', '.kkkk...kkk...'],
    ['..kppPkppPk...', '...kpPk.kppPk.', '...kwwk..kwwwk', '....kkk..kkkk.'],
  ];
  const patch = (rows, edits) => rows.map((r, i) => (edits[i] !== undefined ? edits[i] : r));
  const person = (rows, pal) => HLEGS.map(l => build([...rows, ...l], pal));
  const BASE = { k: '#0a090f', s: '#e2b08c', S: '#b07c5c', e: '#1a1620', m: '#8a4a48', p: '#232634', P: '#161822', w: '#2e3140' };

  // Senior Backend: dark hoodie, headphones, orange data glow (energy drain)
  const backend = person(patch(HUMAN, {
    1: '...kHHHHHHk...', 4: '.gkHHsHHHsHkg.', 5: '.gkHssssssSkg.', 6: '..kHseesseSk..',
    12: '.kTTTTYYTTTTk.', 13: '.kTTTYTTYTTTk.',
  }), { ...BASE, H: '#2a1d16', T: '#2f3342', a: '#ffb03a', Y: '#ffb03a', g: '#c0c4d4' });
  // Senior Frontend: magenta hair, black turtleneck, pink accent (burnout)
  const frontend = person(patch(HUMAN, {
    1: '...kHHHHHHkH..', 2: '..kHHHHHHHHkH.', 3: '..kHHHHHHHHHk.', 12: '.kTTTTXXTTTTk.',
  }), { ...BASE, H: '#ff5ad1', T: '#16141c', a: '#ff5ad1', X: '#ff5ad1' });
  // SRE engineer: hi-vis vest, pager glow
  const sreEng = person(patch(HUMAN, {
    11: '.kTwTTTTTTwTk.', 12: '.kTwTTTTTQwTk.', 13: '.kTwTTTTTTwTk.',
  }), { ...BASE, H: '#3a2a20', T: '#ff7a1a', a: '#ff7a1a', w: '#e8e8ea', Q: '#3dffb0' });
  // QA Lead: white shirt, red laser monocle
  const qa = person(patch(HUMAN, {
    6: '..kHsgXsegSk..', 12: '.kTTTTRRTTTTk.',
  }), { ...BASE, H: '#121014', T: '#d8dae4', a: '#ff2d55', g: '#202028', X: '#ff2d55', R: '#ff2d55' });

  // NPCs
  const gregor = person(patch(HUMAN, {
    6: '..kHsddsddSk..', 13: '.kTTTTTTTwWwk.', 14: '.ksTTTTTTTwWk.',
  }), { ...BASE, H: '#3a3d4a', s: '#b9c3cc', S: '#8d99a4', d: '#3a3f50', T: '#4b566a', a: '#6b788f', w: '#e0e0e6', W: '#5a3a24' });
  // Эрика, отдел адаптации: long dark hair, glasses, red lips, jacket with badge, pencil skirt, heels
  const ERIKA_TOP = [
    '....kkkkkk....',
    '...kHHHHHHk...',
    '..kHHHHHHHHk..',
    '..kHHHHHHHHk..',
    '..kHHsHHsHHk..',
    '.kHssssssSHk..',
    '.kHsgegsgeSHk.',
    '.kHssssssSHk..',
    '.kHsssllsSHk..',
    '.kHHkSssSkHHk.',
    '.kHHkwwwwkHHk.',
    '.kHTTwwwwTTHk.',
    '.kHTTwiiwTTHk.',
    '..kTTwwwwTTk..',
    '..ksTTTTTTsk..',
    '...kTTTTTTk...',
    '...kqqqqqqk...',
    '...kqqqqqqk...',
  ];
  const ERIKA_LEGS = [
    ['....ksk..ksk..', '....ksk..ksk..', '....kkk..kkk..'],
    ['...ksk...ksk..', '..ksk.....ksk.', '..kkk.....kkk.'],
    ['.....ksk.ksk..', '.....ksk..ksk.', '.....kkk..kkk.'],
  ];
  const ERIKA_PAL = { k: '#0a090f', H: '#2a1a14', s: '#e8b896', S: '#b88468', g: '#2a2030', e: '#3a2a40', l: '#c2304a', w: '#e8e4f0', T: '#1d1d26', i: '#bfe9ff', q: '#26222e' };
  const erika = ERIKA_LEGS.map(l => build([...ERIKA_TOP, ...l], ERIKA_PAL));
  const paul = person(patch(HUMAN, {
    1: '...kssssssk...', 2: '..kssssssssk..', 3: '..kssssssssk..', 4: '..kssssssssk..', 5: '..kSsssssSSk..', 6: '..kSXXsXXSSk..', 7: '..kSssssssSk..', 8: '..kSskkkkSSk..', 9: '...kSssssSk...',
    10: '..kkTTTTTTkkF.', 11: '.kTTTTTTTTTkFF', 12: '.kTTLLLLLLTTkF', 13: '.kTTLTTTTLTTk.',
  }), { ...BASE, s: '#c9d3dc', S: '#98a3b0', X: '#ff8a2a', T: '#6a3f22', a: '#6a3f22', L: '#ff8a2a', F: '#e2453a' });

  // ------------------------------------------------------------ floor monsters
  const bug = [
    build(['..k.....k..', '...kRkRk...', '.kkgQgQgkk.', 'k.kgggggk.k', '.kkgQgQgkk.', 'k..kkkkk..k'], { k: '#05060a', g: '#1e5a3a', Q: '#58ff8a', R: '#ff2a4f' }),
    build(['...k...k...', '...kRkRk...', 'k.kgQgQgk.k', '.kkgggggkk.', 'k.kgQgQgk.k', '...kkkkk...'], { k: '#05060a', g: '#1e5a3a', Q: '#58ff8a', R: '#ff2a4f' }),
  ];
  const IMP_PAL = { k: '#0a0406', r: '#b2182b', d: '#6e0f1c', Y: '#ffd27a', h: '#e6d2b0' };
  const imp = [
    build(['.h........h.', '.hk......kh.', '..hkkkkkkh..', '..krrrrrrk..', '.krYrrrrYrk.', '.krrrkkrrrk.', '..krrrrrrk..', '.kkdrrrrdkk.', 'k.kdrrrrdk.k', '..kdrrrrdk..', '..kdkkkkdk..', '..kk....kk..'], IMP_PAL),
    build(['.h........h.', '.hk......kh.', '..hkkkkkkh..', '..krrrrrrk..', '.krYrrrrYrk.', '.krrrkkrrrk.', '..krrrrrrk..', 'k.kdrrrrdk.k', '.kkdrrrrdkk.', '..kdrrrrdk..', '...kdkkdk...', '...kk..kk...'], IMP_PAL),
  ];
  const spirit = [build([
    '....kkkk....',
    '..kkvvvvkk..',
    '.kvvvvvvvvk.',
    '.kvEEvvEEvk.',
    '.kvvvvvvvvk.',
    '.kvvvkkvvvk.',
    'kvvvvvvvvvvk',
    'kvvbvvvvbvvk',
    'kvvvvvvvvvvk',
    '.kvvbvvbvvk.',
    '.kvk.kvk.kv.',
    '..k...k...k.',
  ], { k: '#0c1a3a', v: '#7fc4ff', b: '#3a7bff', E: '#ffffff' })];

  // ------------------------------------------------------------ security & cult (penthouse / R&D)
  const GUARD_PAL = { k: '#06060a', A: '#454b61', a: '#262a36', R: '#ff2445', V: '#6d0f1f', d: '#14151b', m: '#9aa3b8' };
  const GUARD_TOP = [
    '.....kkkkkk.....', '....kAAAAAAk....', '...kAaaaaaaAk...', '...kaaaaaaaak...', '...kRRRRRRRRk...', '...kVVVVVVVVk...', '....kaaaaaak....', '..kkAAaaaaAAkk..',
    '.kAAaaaaaaaaAAk.', '.kaaAaaRRaaAaak.', '.kaakaaaaaakaak.', '.kaakAaaaaAkaak.', '.kddkaaaaaakddk.', '..kk.kaaaak.kmk.', '....kaaaaaak.km.', '....kaakkaak.k..',
  ];
  const GUARD_LEGS = [
    ['....kaak.kaak...', '....kaak.kaak...', '...kddak.kddak..', '...kkkk...kkkk..'],
    ['....kaak.kaak...', '...kaak...kaak..', '..kddak...kddk..', '..kkkk.....kkk..'],
    ['....kaak.kaak...', '.....kaak.kaak..', '....kdak.kddak..', '....kkk..kkkkk..'],
  ];
  const guard = GUARD_LEGS.map(l => build([...GUARD_TOP, ...l], GUARD_PAL));
  const cultist = [build([
    '......kkkk......', '....kkMMMMkk....', '...kMmmmmmmMk...', '...kmmkkkkmmk...', '..kmmknnnnkmmk..', '..kmmknXnXkmmk..', '..kmmknnnnkmmk..', '..kmmmknnkmmmk..', '.kmmmmmkkmmmmmk.',
    '.kmMmmmXXmmmMmk.', '.kmMmmXmmXmmMmk.', '.kmMmmmXXmmmMmk.', '.kmmMmmmmmmmMmk.', 'kmmmMmmmmmmmMmmk', 'kmmmmMmmmmmMmmmk', 'kmmmmmmmmmmmmmmk', 'kmmmmmmmmmmmmmmk', '.kmmmmmmmmmmmmk.', '..kkkkkkkkkkkk..',
  ], { k: '#07040a', M: '#8a1730', m: '#521022', n: '#030205', X: '#ff2a4f' })];

  // ------------------------------------------------------------ pickups
  const COIN = build(['.kkkk.', 'kYyyyk', 'kyYyyk', 'kyyyyk', 'kyyYyk', '.kkkk.'], { k: '#3a2508', y: '#f2b632', Y: '#fff1a6' });
  const SHARD = build(['..k..', '.kQk.', 'kQvQk', '.kQk.', '..k..'], { k: '#0b2210', Q: '#58ff8a', v: '#e6ffe9' });
  const PASS = build(['...k...', '..kvk..', '.kvLvk.', 'kvLLLvk', '.kvLvk.', '..kvk..', '...k...'], { k: '#1a0a33', v: '#9b5cff', L: '#e2c8ff' });
  const ITEMBOX = build(['.kkkkkkk.', 'kwwwwwwwk', 'kwbbbbbwk', 'kkkkkkkkk', 'kbbbbbbbk', 'kbbwwwbbk', 'kbbbbbbbk', '.kkkkkkk.'], { k: '#0b0a12', w: '#d8d4cc', b: '#4a4f66' });

  // Portrait for the HUD (head with cap).
  const portrait = build(FRONT.slice(0, 12), HERO_PAL);

  EJ.sprites = { build, hero, heroCeo, backend, frontend, sreEng, qa, gregor, erika, paul, bug, imp, spirit, guard, cultist, COIN, SHARD, PASS, ITEMBOX, portrait };
})();
