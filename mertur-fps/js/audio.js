// Web Audio ile sentezlenen sesler: silahlar (ses hızı gecikmesi + mesafe süzgeci), yankı,
// ayak sesleri, ağustos böcekleri, cırcır böcekleri, dalga, motorlar, kulak çınlaması.
const SOUND_SPEED = 343;

export class GameAudio {
  constructor() { this.ctx = null; this.vol = 0.8; this.listener = { x: 0, y: 0, z: 0 }; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.muffle.connect(this.master); this.master.connect(comp); comp.connect(ctx.destination);
    this.bus = ctx.createGain(); this.bus.connect(this.muffle);
    // yankı (tepelerden geri dönen)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeIR(2.6);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 1;
    this.verbIn.connect(this.verb); this.verb.connect(this.bus);
    this.noise = this.makeNoise(2, false);
    this.pink = this.makeNoise(4, true);
    this.startAmbient();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  makeNoise(sec, pink) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }
  makeIR(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        let v = (Math.random() * 2 - 1) * Math.pow(1 - t / sec, 3.2) * 0.35;
        // tepelerden ayrık yankılar
        for (const [et, eg] of [[0.21 + c * 0.02, 0.5], [0.48 + c * 0.03, 0.32], [0.93, 0.2], [1.5, 0.1]]) {
          const dt = t - et;
          if (dt > 0 && dt < 0.09) v += (Math.random() * 2 - 1) * eg * Math.exp(-dt * 45);
        }
        d[i] = v;
      }
    }
    return b;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    this.listener = pos;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // konumlu çıkış düğümü: mesafe gecikmesi + süzgeç + panner
  spatial(pos, { baseGain = 1, near = 6, far = 500, verb = 0.35 } = {}) {
    const ctx = this.ctx;
    const d = pos ? Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z) : 0;
    const g = ctx.createGain();
    g.gain.value = baseGain * Math.min(1, near / Math.max(near, d)) * (d > far ? Math.max(0, 1 - (d - far) / far) : 1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 16000 * Math.exp(-d / 220) + 700;
    let out = g;
    g.connect(lp);
    let node = lp;
    if (pos && d > 1.5) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      node.connect(p); node = p;
    }
    const delay = pos && d > 15 ? d / SOUND_SPEED : 0;
    if (delay > 0) { const dl = ctx.createDelay(3); dl.delayTime.value = Math.min(2.9, delay); node.connect(dl); node = dl; }
    node.connect(this.bus);
    if (verb > 0) { const vs = ctx.createGain(); vs.gain.value = verb * (0.6 + Math.min(1, d / 120)); node.connect(vs); vs.connect(this.verbIn); }
    return { input: out, d };
  }

  burst(dest, t0, { dur = 0.1, hp = 300, lp = 8000, gain = 1, attack = 0.001, curve = 30, buf = null, q = 0.7, bp = 0 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = buf || this.noise;
    s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f1 = ctx.createBiquadFilter(); f1.type = bp ? 'bandpass' : 'highpass'; f1.frequency.value = bp || hp; f1.Q.value = q;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + attack, dur / 4 * (30 / curve));
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5, dur * 3 + 0.2);
  }
  thump(dest, t0, { f0 = 150, f1 = 45, dur = 0.18, gain = 0.8, type = 'sine' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // silah sesleri
  shot(kind, pos = null, player = false) {
    if (!this.ctx) return;
    const P = {
      pistol: { dur: 0.07, hp: 500, lp: 7000, gain: 0.9, body: [320, 90, 0.08, 0.5], verb: 0.35 },
      rifle: { dur: 0.1, hp: 250, lp: 7500, gain: 1.1, body: [180, 50, 0.14, 0.9], verb: 0.5 },
      shotgun: { dur: 0.16, hp: 150, lp: 5000, gain: 1.2, body: [120, 40, 0.22, 1.1], verb: 0.55 },
      sniper: { dur: 0.16, hp: 150, lp: 8000, gain: 1.35, body: [110, 35, 0.3, 1.2], verb: 0.8 },
      smg: { dur: 0.055, hp: 600, lp: 6500, gain: 0.8, body: [260, 90, 0.07, 0.45], verb: 0.3 },
      ar: { dur: 0.08, hp: 350, lp: 8000, gain: 1.0, body: [220, 60, 0.11, 0.7], verb: 0.45 },
      g3: { dur: 0.12, hp: 250, lp: 7000, gain: 1.1, body: [170, 45, 0.16, 0.9], verb: 0.55 },
    }[kind] || {};
    const sp = this.spatial(player ? null : pos, { baseGain: player ? 0.9 : 1.6, near: 8, far: 900, verb: P.verb });
    const t = this.ctx.currentTime + 0.005;
    this.burst(sp.input, t, { dur: P.dur, hp: P.hp, lp: P.lp, gain: P.gain });
    this.burst(sp.input, t, { dur: 0.012, hp: 3000, lp: 16000, gain: P.gain * 0.6 });
    const [a, b, c, d] = P.body;
    this.thump(sp.input, t, { f0: a, f1: b, dur: c, gain: d });
    if (player && kind !== 'pistol') this.burst(sp.input, t + 0.05, { dur: 0.02, bp: 3500, q: 3, gain: 0.12 });
  }
  crack(pos) { // ses üstü mermi vızıltısı / çatlaması
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: 1.4, near: 3, verb: 0.1 });
    const t = this.ctx.currentTime;
    this.burst(sp.input, t, { dur: 0.018, hp: 2500, lp: 14000, gain: 0.9, curve: 60 });
    this.burst(sp.input, t + 0.004, { dur: 0.05, bp: 1800, q: 2, gain: 0.25 });
  }
  impact(surface, pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: 0.7, near: 4, far: 250, verb: 0.15 });
    const t = this.ctx.currentTime;
    const m = { plaster: [1800, 0.05], stone: [2600, 0.04], metal: [3200, 0.12], wood: [900, 0.05], ground: [700, 0.06], water: [1200, 0.18], glass: [5000, 0.1], plastic: [1400, 0.04], flesh: [300, 0.07] }[surface] || [1500, 0.05];
    this.burst(sp.input, t, { dur: m[1], bp: m[0], q: surface === 'metal' ? 8 : 1.5, gain: 0.7 });
    if (surface === 'metal' && Math.random() < 0.5) { // sekme
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(3200 + Math.random() * 1500, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); g.connect(sp.input); o.start(t); o.stop(t + 0.4);
    }
  }
  step(surface, pos = null, gain = 0.35) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: gain, near: 3, far: 60, verb: 0 });
    const t = this.ctx.currentTime;
    const m = { grass: [900, 0.06, 0.5], stone: [2200, 0.035, 0.8], asphalt: [1800, 0.035, 0.7], sand: [3200, 0.07, 0.6], dirt: [1200, 0.05, 0.6], water: [1500, 0.2, 0.9], wood: [700, 0.04, 0.8] }[surface] || [1500, 0.05, 0.6];
    this.burst(sp.input, t, { dur: m[1], bp: m[0], q: 0.9, gain: m[2] });
    if (surface === 'sand' || surface === 'dirt') this.burst(sp.input, t + 0.03, { dur: 0.04, bp: 4200, q: 1, gain: m[2] * 0.5 });
  }
  click(freq = 2000, gain = 0.3, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    this.burst(this.bus, t, { dur: 0.02, bp: freq, q: 4, gain });
  }
  reload(kind, phase) {
    if (!this.ctx) return;
    if (phase === 'out') { this.click(1400, 0.35); this.burst(this.bus, this.ctx.currentTime + 0.05, { dur: 0.08, bp: 900, q: 1, gain: 0.15 }); }
    if (phase === 'in') { this.click(900, 0.5); this.click(2600, 0.25, 0.03); }
    if (phase === 'bolt') { this.click(2200, 0.4); this.click(1600, 0.4, 0.12); }
    if (phase === 'shell') { this.click(1200, 0.35); this.click(2400, 0.2, 0.05); }
    if (phase === 'dry') this.click(3500, 0.3);
    if (phase === 'switch') { this.click(1800, 0.2); this.burst(this.bus, this.ctx.currentTime, { dur: 0.12, bp: 600, q: 0.8, gain: 0.08 }); }
  }
  hit(kill = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = kill ? 1300 : 2400;
    g.gain.setValueAtTime(kill ? 0.14 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kill ? 0.12 : 0.05));
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.15);
    this.burst(this.bus, t, { dur: 0.03, bp: 600, q: 1, gain: 0.25 });
  }
  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(this.bus, t, { f0: 120, f1: 40, dur: 0.25, gain: 0.9 });
    this.burst(this.bus, t, { dur: 0.08, bp: 400, q: 0.8, gain: 0.5 });
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(900, t);
    this.muffle.frequency.setTargetAtTime(20000, t + 0.1, 0.35);
  }
  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(this.bus, t, { f0: 70, f1: 35, dur: 0.14, gain: 0.6 });
    this.thump(this.bus, t + 0.22, { f0: 60, f1: 30, dur: 0.14, gain: 0.45 });
  }
  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: 2.2 * big, near: 12, far: 1500, verb: 0.9 });
    const t = this.ctx.currentTime;
    this.burst(sp.input, t, { dur: 0.6, hp: 40, lp: 3000, gain: 1.4, buf: this.pink });
    this.thump(sp.input, t, { f0: 90, f1: 25, dur: 0.8, gain: 1.4 });
    this.burst(sp.input, t + 0.02, { dur: 1.4, hp: 100, lp: 900, gain: 0.5, buf: this.pink });
  }
  flashbang(pos, intensity) {
    if (!this.ctx) return;
    this.explosion(pos, 0.8);
    if (intensity <= 0.05) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = 3300; g.gain.setValueAtTime(0.12 * intensity, t); g.gain.setTargetAtTime(0, t + 0.5, 1.8 * intensity);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 9);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(250, t);
    this.muffle.frequency.setTargetAtTime(20000, t + 1.5 * intensity, 1.6 * intensity);
  }
  splash(pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: 0.6, near: 3, far: 80, verb: 0.05 });
    this.burst(sp.input, this.ctx.currentTime, { dur: 0.25, bp: 1300, q: 0.7, gain: 0.7 });
  }
  radio(pos) { // telsiz cızırtısı
    if (!this.ctx) return;
    const sp = this.spatial(pos, { baseGain: 0.5, near: 4, far: 60, verb: 0 });
    const t = this.ctx.currentTime;
    this.burst(sp.input, t, { dur: 0.09, bp: 2300, q: 2, gain: 0.5 });
    this.burst(sp.input, t + 0.5, { dur: 0.05, bp: 2600, q: 2, gain: 0.35 });
  }
  underwater(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(on ? 550 : 20000, t, 0.08);
  }
  engine() {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 110;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.15; o2.connect(g2); g2.connect(lp);
    const gn = ctx.createGain(); gn.gain.value = 0.25; n.connect(gn); gn.connect(lp);
    o.connect(lp); lp.connect(g);
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0;
    g.connect(p); p.connect(this.bus);
    o.start(); o2.start(); n.start();
    const self = this;
    return {
      update(pos, throttle) {
        const d = Math.hypot(pos.x - self.listener.x, pos.y - self.listener.y, pos.z - self.listener.z);
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(Math.min(0.35, 9 / Math.max(9, d)) * (0.25 + throttle * 0.75) * 0.55, t, 0.1);
        o.frequency.setTargetAtTime(48 + throttle * 55, t, 0.2); o2.frequency.setTargetAtTime(96 + throttle * 110, t, 0.2);
        lp.frequency.setTargetAtTime(300 + throttle * 900 + 6000 * Math.exp(-d / 80), t, 0.1);
        if (p.positionX) { p.positionX.setValueAtTime(pos.x, t); p.positionY.setValueAtTime(pos.y, t); p.positionZ.setValueAtTime(pos.z, t); }
        else p.setPosition(pos.x, pos.y, pos.z);
      },
      stop() { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.3); setTimeout(() => { try { o.stop(); o2.stop(); n.stop(); } catch (e) { /* */ } }, 1500); },
    };
  }

  // ortam: deniz, ağustos böceği (gündüz), cırcır (gece), rüzgâr
  startAmbient() {
    const ctx = this.ctx;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const lfo = (f, depth, target, offset) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start();
      if (offset !== undefined) target.value = offset;
      return o;
    };
    // dalgalar
    {
      const s = loop(this.pink);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = ctx.createGain(); g.gain.value = 0.2;
      lfo(0.11, 0.12, g.gain, 0.2); lfo(0.047, 250, lp.frequency, 700);
      this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.3;
      s.connect(lp); lp.connect(g); g.connect(this.seaGain); this.seaGain.connect(this.bus);
    }
    // ağustos böcekleri
    {
      const s = loop(this.noise);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5600; bp.Q.value = 6;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 42;
      const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(am.gain); o.start();
      const swell = ctx.createGain(); swell.gain.value = 0.5; lfo(0.09, 0.4, swell.gain, 0.55);
      this.cicadaGain = ctx.createGain(); this.cicadaGain.gain.value = 0;
      s.connect(bp); bp.connect(am); am.connect(swell); swell.connect(this.cicadaGain); this.cicadaGain.connect(this.bus);
    }
    // cırcır böcekleri
    {
      this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
      this.cricketGain.connect(this.bus);
      for (const [f, rate, pan] of [[4400, 2.1, -0.6], [4700, 2.6, 0.5], [4150, 1.7, 0.1]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0;
        const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = 28;
        const pg = ctx.createGain(); pg.gain.value = 0.5; pulse.connect(pg);
        const gate = ctx.createOscillator(); gate.type = 'square'; gate.frequency.value = rate;
        const gg = ctx.createGain(); gg.gain.value = 0.5; gate.connect(gg);
        const mul = ctx.createGain(); mul.gain.value = 0; pg.connect(mul.gain); gg.connect(mul.gain);
        o.connect(mul); mul.connect(g); g.gain.value = 0.035;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (p) { p.pan.value = pan; g.connect(p); p.connect(this.cricketGain); } else g.connect(this.cricketGain);
        o.start(); pulse.start(); gate.start();
      }
    }
    // rüzgâr
    {
      const s = loop(this.pink);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const g = ctx.createGain(); g.gain.value = 0.06; lfo(0.06, 0.04, g.gain, 0.06);
      s.connect(lp); lp.connect(g); g.connect(this.bus);
    }
  }
  ambient(dayK, nightK, shoreDist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.seaGain.gain.setTargetAtTime(0.08 + 0.45 * Math.exp(-Math.max(0, shoreDist) / 45), t, 0.5);
    this.cicadaGain.gain.setTargetAtTime(0.11 * Math.max(0, dayK - 0.2), t, 1.0);
    this.cricketGain.gain.setTargetAtTime(0.9 * nightK, t, 1.0);
  }
}
