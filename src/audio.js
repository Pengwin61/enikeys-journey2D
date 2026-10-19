/* Enikey Journey — synthesized sound effects and a small dark-synth sequencer. */
'use strict';
EJ.audio = (() => {
  let ac = null, master, sfxBus, musicBus, noise, muted = false;
  const last = {};

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc(type, f0, f1, dur, vol, { t = 0, a = 0.004, dest = sfxBus, detune = 0 } = {}) {
    const now = ac.currentTime + t;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    env(g, now, a, vol, dur);
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + dur + 0.05);
  }
  function hiss(dur, vol, { type = 'lowpass', f0 = 2000, f1 = f0, q = 0.8, t = 0, a = 0.003, dest = sfxBus } = {}) {
    const now = ac.currentTime + t;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), now + dur);
    env(g, now, a, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.05);
  }

  const sfx = {
    shoot() { osc('square', 1300 + Math.random() * 200, 260, 0.07, 0.05); osc('sine', 300, 120, 0.06, 0.05); },
    hit() { hiss(0.06, 0.12, { type: 'bandpass', f0: 2600, f1: 900, q: 2 }); osc('square', 220, 90, 0.05, 0.03); },
    crit() { hiss(0.08, 0.16, { type: 'bandpass', f0: 4200, f1: 1200, q: 3 }); osc('square', 900, 300, 0.08, 0.05); },
    kill() { hiss(0.28, 0.22, { f0: 3000, f1: 200 }); osc('sine', 160, 40, 0.25, 0.18); osc('square', 620, 80, 0.12, 0.04, { t: 0.02 }); },
    hurt() { osc('sawtooth', 240, 50, 0.25, 0.12); hiss(0.18, 0.2, { f0: 1500, f1: 300 }); },
    dash() { hiss(0.17, 0.12, { type: 'bandpass', f0: 600, f1: 3500, q: 1.2 }); },
    shock() { osc('sine', 120, 28, 0.55, 0.32); hiss(0.45, 0.22, { f0: 5000, f1: 120 }); osc('square', 60, 30, 0.3, 0.06); },
    bot() { [520, 780, 1040].forEach((f, i) => osc('square', f, f, 0.06, 0.04, { t: i * 0.06 })); },
    coin() { osc('square', 1320, 1320, 0.04, 0.025); osc('square', 1980, 1980, 0.06, 0.025, { t: 0.04 }); },
    pickup() { [660, 880, 1320, 1760].forEach((f, i) => osc('triangle', f, f, 0.12, 0.07, { t: i * 0.05 })); },
    heal() { [440, 554, 659, 880].forEach((f, i) => osc('sine', f, f * 1.01, 0.2, 0.07, { t: i * 0.04 })); },
    lock() { osc('square', 98, 98, 0.35, 0.07); osc('square', 104, 104, 0.35, 0.05); hiss(0.25, 0.08, { f0: 400 }); },
    unlock() { [392, 523, 784].forEach((f, i) => osc('triangle', f, f, 0.18, 0.08, { t: i * 0.07 })); },
    enemyShot() { osc('sawtooth', 520, 180, 0.12, 0.035); },
    telegraph() { osc('square', 880, 880, 0.05, 0.03); osc('square', 880, 880, 0.05, 0.03, { t: 0.09 }); },
    spawn() { osc('sawtooth', 70, 300, 0.4, 0.05); hiss(0.4, 0.05, { type: 'bandpass', f0: 300, f1: 2400, q: 4 }); },
    boom() { hiss(0.7, 0.35, { f0: 2400, f1: 60 }); osc('sine', 90, 25, 0.6, 0.3); },
    charge() { osc('sawtooth', 110, 440, 0.4, 0.05); },
    alarm() { for (let i = 0; i < 4; i++) osc('sawtooth', i % 2 ? 620 : 820, i % 2 ? 620 : 820, 0.18, 0.06, { t: i * 0.2 }); },
    phase() { [110, 164.8, 220, 329.6].forEach(f => osc('sawtooth', f, f * 0.5, 1.4, 0.06, { a: 0.02 })); hiss(1.2, 0.2, { f0: 6000, f1: 80 }); },
    hack() { osc('square', 1800 + Math.random() * 900, 1800, 0.03, 0.02); },
    ui() { osc('square', 660, 990, 0.05, 0.035); },
    deny() { osc('square', 180, 120, 0.15, 0.06); },
    elevator() { osc('sine', 220, 880, 1.2, 0.08, { a: 0.1 }); hiss(1.2, 0.05, { type: 'bandpass', f0: 200, f1: 900, q: 3 }); },
    step() { hiss(0.03, 0.025, { type: 'bandpass', f0: 1400, q: 1.5 }); },
  };

  function play(name, minGap = 0.03) {
    if (!ac || muted || !sfx[name]) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < minGap) return;
    last[name] = now;
    try { sfx[name](); } catch (e) { /* audio is non-critical */ }
  }

  // --- music: 16th-note sequencer, A minor, intensity drives filter and drums.
  const music = { on: false, step: 0, next: 0, timer: null, intensity: 0, target: 0, mode: 'explore' };
  const BASS = {
    explore: [45, 0, 45, 0, 45, 0, 48, 0, 45, 0, 45, 0, 43, 0, 44, 0],
    boss: [40, 40, 52, 40, 40, 52, 43, 40, 40, 40, 52, 40, 46, 45, 43, 41],
  };
  const PADS = { explore: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], boss: [[52, 55, 59], [53, 56, 60], [50, 53, 57], [52, 56, 59]] };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function schedule() {
    if (!ac || !music.on) return;
    const spb = 60 / (music.mode === 'boss' ? 138 : 104) / 4;
    while (music.next < ac.currentTime + 0.12) {
      const t = music.next, s = music.step % 16, bar = Math.floor(music.step / 16) % 4;
      music.intensity = EJ.approach(music.intensity, music.target, 0.02);
      const I = music.intensity;
      const note = BASS[music.mode][s];
      if (note) {
        const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(note);
        f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(260 + I * 1300, t); f.frequency.exponentialRampToValueAtTime(120, t + spb * 1.8);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.9);
        o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + spb * 2);
      }
      if (s % 4 === 0 && (I > 0.25 || music.mode === 'boss')) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
      }
      if (I > 0.55 && s % 2 === 1) {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
        g.gain.setValueAtTime(s % 4 === 3 ? 0.06 : 0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random()); src.stop(t + 0.05);
      }
      if (s === 0) {
        for (const m of PADS[music.mode][bar]) {
          for (const det of [-7, 7]) {
            const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
            f.type = 'lowpass'; f.frequency.value = 700 + I * 900;
            const len = spb * 16;
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
            o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + len + 0.05);
          }
        }
      }
      music.next += spb; music.step++;
    }
  }

  return {
    init, play,
    get ready() { return !!ac; },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.05);
      return muted;
    },
    startMusic(mode = 'explore') {
      if (!ac) return;
      music.mode = mode;
      if (music.on) return;
      music.on = true; music.next = ac.currentTime + 0.05; music.step = 0;
      music.timer = setInterval(schedule, 30);
    },
    setMode(mode) { if (music.mode !== mode) { music.mode = mode; music.step = 0; } },
    setIntensity(v) { music.target = v; },
  };
})();
