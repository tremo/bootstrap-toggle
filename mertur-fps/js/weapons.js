// Oyuncu silahları: yerli üretim tabanca, piyade tüfeği, pompalı, keskin nişancı + el bombası.
// Prosedürel görünüm modeli (eller, kollar), geri tepme, sallanma, şarjör değiştirme, balistik.
import * as THREE from 'three';
import { clamp, lerp, DEG } from './util.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const WEAPONS = [
  { id: 'tp9', key: 'Digit1', name: 'Canik TP9 SF', cal: '9×19 mm Parabellum', type: 'pistol', mag: 18, reserve: 72, reserveMax: 108, rpm: 450, auto: false, modes: ['YARI OTOMATİK'], dmg: 34, pen: 0.55, v: 370, spreadHip: 1.5, spreadAds: 0.22, spreadMove: 1.1, bloom: 0.9, recoilP: 2.3, recoilY: 0.9, reload: 1.45, reloadEmpty: 1.85, adsZoom: 1.18, adsTime: 0.13, sway: 0.9, sound: 'pistol', falloff: [25, 70, 0.55], speed: 1.0, tracer: 0 },
  { id: 'mpt76', key: 'Digit2', name: 'MKE MPT-76', cal: '7,62×51 mm NATO', type: 'rifle', mag: 20, reserve: 100, reserveMax: 160, rpm: 640, auto: true, modes: ['OTOMATİK', 'TEK ATIŞ'], dmg: 58, pen: 1.0, v: 800, spreadHip: 3.0, spreadAds: 0.07, spreadMove: 2.4, bloom: 0.7, recoilP: 1.55, recoilY: 0.6, reload: 2.3, reloadEmpty: 2.95, adsZoom: 1.55, adsTime: 0.22, sway: 1.25, sound: 'rifle', falloff: [150, 500, 0.7], speed: 0.95, tracer: 4 },
  { id: 'mka', key: 'Digit3', name: 'Akdal MKA 1919', cal: '12 kalibre · 9 saçma', type: 'shotgun', mag: 8, reserve: 32, reserveMax: 48, rpm: 290, auto: false, modes: ['YARI OTOMATİK'], pellets: 9, pelletSpread: 2.4, dmg: 17, pen: 0.7, v: 420, spreadHip: 1.2, spreadAds: 0.5, spreadMove: 1.2, bloom: 1.0, recoilP: 5.2, recoilY: 1.6, reload: 2.5, reloadEmpty: 3.0, adsZoom: 1.2, adsTime: 0.2, sway: 1.1, sound: 'shotgun', falloff: [9, 35, 0.2], speed: 0.97, tracer: 0 },
  { id: 'bora', key: 'Digit4', name: 'MKE Bora-12 (JNG-90)', cal: '7,62×51 mm · 8× dürbün', type: 'sniper', mag: 10, reserve: 30, reserveMax: 50, rpm: 55, auto: false, bolt: true, modes: ['SÜRGÜLÜ'], dmg: 150, pen: 1.0, v: 860, spreadHip: 5.0, spreadAds: 0.0, spreadMove: 4.0, bloom: 2.0, recoilP: 4.5, recoilY: 1.0, reload: 2.9, reloadEmpty: 3.4, adsZoom: 8, adsTime: 0.32, sway: 1.8, sound: 'sniper', falloff: [400, 1200, 0.8], speed: 0.9, tracer: 1 },
];

function M(color, rough = 0.5, metal = 0.2, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); }

const rbCache = new Map();
function rbox(w, h, d) {
  const k = `${w}_${h}_${d}`;
  let g = rbCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(0.01, Math.min(w, h, d) * 0.28)); rbCache.set(k, g); }
  return g;
}
function box(g, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(rbox(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m); return m;
}
function cyl(g, mat, r1, r2, L, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, L, seg), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m); return m;
}
function limb(g, mat, a, b, r1, r2) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, L, 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.add(m); return m;
}

export class WeaponSystem {
  constructor(game) {
    this.g = game;
    const T = game.T;
    const micro = T.plaster.normal.clone(); micro.repeat.set(6, 6); micro.needsUpdate = true;
    const n = (v) => new THREE.Vector2(v, v);
    this.mats = {
      polymer: M(0x1d1e20, 0.66, 0.05, { normalMap: micro, normalScale: n(0.35) }),
      metal: M(0x303236, 0.32, 0.85, { normalMap: micro, normalScale: n(0.15) }),
      dark: M(0x151618, 0.42, 0.65, { normalMap: micro, normalScale: n(0.2) }),
      olive: M(0x3f4533, 0.62, 0.1, { normalMap: micro, normalScale: n(0.35) }),
      tan: M(0x8a7a5c, 0.7, 0.05),
      glass: M(0x0b1a2a, 0.05, 0.4, { envMapIntensity: 2 }),
      dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: 0xff3a22, toneMapped: false, transparent: true, opacity: 0.85 }),
      sleeve: new THREE.MeshStandardMaterial({ map: T.camo.map, roughness: 0.9 }),
      glove: M(0x2b2723, 0.9, 0.0),
      brass: M(0xc79a45, 0.3, 1.0),
      grenade: M(0x3b4430, 0.6, 0.2),
    };
    T.camo.map.repeat.set(2, 2);
    this.root = new THREE.Group();
    game.vScene.add(this.root);
    this.models = {};
    this.state = WEAPONS.map((w) => ({ def: w, ammo: w.mag, reserve: w.reserve, mode: 0 }));
    for (const w of WEAPONS) {
      const m = this.buildModel(w);
      m.visible = false;
      this.root.add(m);
      this.models[w.id] = m;
    }
    this.cur = 1;
    this.models[WEAPONS[1].id].visible = true;
    // görünüm ışıkları
    this.vSun = new THREE.DirectionalLight(0xffffff, 2);
    this.vHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    this.vFlash = new THREE.PointLight(0xffa050, 0, 3, 2);
    game.vScene.add(this.vSun, this.vHemi, this.vFlash, this.vSun.target);
    // namlu alevi (görünüm)
    const fm = new THREE.SpriteMaterial({ map: T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.flash = new THREE.Sprite(fm);
    this.flash.visible = false;
    this.root.add(this.flash);
    // kovanlar
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 6);
    for (let i = 0; i < 24; i++) { const s = new THREE.Mesh(sg, this.mats.brass); s.visible = false; game.vScene.add(s); this.shells.push({ m: s, t: 0, v: new THREE.Vector3(), w: new THREE.Vector3() }); }
    this.si = 0;
    // el bombası modeli (atış animasyonu için)
    this.nadeModel = new THREE.Group();
    cyl(this.nadeModel, this.mats.grenade, 0.032, 0.032, 0.085, 0, 0, 0, 0);
    cyl(this.nadeModel, this.mats.metal, 0.012, 0.014, 0.035, 0, 0.055, 0, 0);
    box(this.nadeModel, this.mats.metal, 0.012, 0.07, 0.01, 0.022, 0.03, 0);
    this.nadeModel.visible = false;
    game.vScene.add(this.nadeModel);

    // durum
    this.ads = 0; this.cool = 0; this.reloading = 0; this.reloadTotal = 0; this.reloadPhase = null;
    this.switching = 0; this.pendingSwitch = -1; this.boltT = 0; this.bloomV = 0;
    this.kick = { z: 0, vz: 0, rx: 0, vrx: 0, ry: 0, vry: 0 };
    this.sway = new THREE.Vector2(); this.bobT = 0;
    this.grenades = 3; this.throwT = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.burstCount = 0;
    this.lastShotTime = -10;
  }

  get w() { return this.state[this.cur]; }

  buildModel(w) {
    const g = new THREE.Group();
    const m = this.mats;
    const gun = new THREE.Group();
    g.add(gun);
    g.userData.gun = gun;
    let muzzle, mag, bolt = null, sightY = 0.06, sightZ = -0.05, hipPos, adsPos, handsR, handsL;
    if (w.type === 'pistol') {
      box(gun, m.dark, 0.03, 0.034, 0.19, 0, 0.034, -0.06);
      for (let i = 0; i < 7; i++) box(gun, m.metal, 0.031, 0.02, 0.003, 0, 0.036, 0.015 + i * 0.006);
      box(gun, m.polymer, 0.028, 0.026, 0.165, 0, 0.006, -0.05);
      box(gun, m.polymer, 0.029, 0.11, 0.046, 0, -0.05, 0.035, -0.3);
      box(gun, m.polymer, 0.006, 0.03, 0.05, 0, -0.018, -0.02);
      box(gun, m.dark, 0.012, 0.01, 0.01, 0, 0.056, 0.022);
      box(gun, m.dark, 0.004, 0.01, 0.006, 0, 0.056, -0.145);
      cyl(gun, m.metal, 0.006, 0.006, 0.02, 0, 0.03, -0.157);
      mag = new THREE.Group(); box(mag, m.dark, 0.024, 0.11, 0.035, 0, -0.06, 0.035, -0.3); gun.add(mag);
      muzzle = new THREE.Vector3(0, 0.03, -0.17);
      sightY = 0.061; sightZ = 0.02;
      hipPos = new THREE.Vector3(0.13, -0.11, -0.36); adsPos = new THREE.Vector3(0, -sightY, -0.34);
      handsR = [[0.26, -0.3, 0.2], [0.02, -0.05, 0.05]]; handsL = [[-0.2, -0.32, 0.15], [-0.015, -0.055, 0.03]];
    } else if (w.type === 'rifle' || w.type === 'shotgun') {
      const sh = w.type === 'shotgun';
      box(gun, m.metal, 0.05, 0.065, 0.3, 0, 0.02, -0.05);
      box(gun, m.dark, 0.046, 0.012, 0.3, 0, 0.058, -0.05);
      for (let i = 0; i < 14; i++) box(gun, m.dark, 0.05, 0.008, 0.008, 0, 0.066, -0.19 + i * 0.021);
      box(gun, sh ? m.polymer : m.dark, 0.056, 0.06, 0.34, 0, 0.022, -0.36);
      for (let i = 0; i < 6; i++) box(gun, m.polymer, 0.058, 0.012, 0.03, 0, 0.022, -0.23 - i * 0.05);
      cyl(gun, m.metal, sh ? 0.013 : 0.011, sh ? 0.013 : 0.011, 0.26, 0, 0.022, -0.66);
      cyl(gun, m.dark, 0.016, 0.016, 0.07, 0, 0.022, -0.8, Math.PI / 2, 0, 0, 8);
      box(gun, m.polymer, 0.03, 0.1, 0.045, 0, -0.05, 0.075, -0.35);
      box(gun, m.dark, 0.006, 0.04, 0.06, 0, -0.022, 0.03);
      box(gun, m.polymer, 0.042, 0.075, 0.26, 0, 0.0, 0.28);
      box(gun, m.polymer, 0.044, 0.035, 0.2, 0, 0.05, 0.27);
      box(gun, m.polymer, 0.045, 0.13, 0.03, 0, -0.01, 0.41);
      cyl(gun, m.metal, 0.012, 0.012, 0.2, 0, 0.025, 0.14);
      box(gun, m.polymer, 0.035, 0.1, 0.035, 0, -0.045, -0.36);
      box(gun, m.metal, 0.012, 0.012, 0.03, 0.03, 0.035, 0.07);
      mag = new THREE.Group();
      if (sh) box(mag, m.polymer, 0.045, 0.14, 0.085, 0, -0.07, -0.12, 0.08);
      else box(mag, m.dark, 0.032, 0.15, 0.075, 0, -0.075, -0.1, 0.12);
      gun.add(mag);
      if (!sh) {
        // holografik nişangâh
        const hs = new THREE.Group();
        box(hs, m.dark, 0.045, 0.012, 0.09, 0, 0.078, 0);
        box(hs, m.dark, 0.006, 0.05, 0.09, 0.024, 0.1, 0); box(hs, m.dark, 0.006, 0.05, 0.09, -0.024, 0.1, 0);
        box(hs, m.dark, 0.054, 0.006, 0.09, 0, 0.127, 0);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.042), new THREE.MeshStandardMaterial({ color: 0x5f7f7a, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 }));
        gl.position.set(0, 0.103, -0.03); hs.add(gl);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 10), m.dot); dot.position.set(0, 0.103, -0.031); hs.add(dot);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.0085, 0.0095, 36), m.ring); ring.position.set(0, 0.103, -0.031); hs.add(ring);
        hs.position.z = -0.08;
        gun.add(hs);
        g.userData.reticle = [dot, ring];
        sightY = 0.103; sightZ = -0.11;
      } else {
        box(gun, m.dark, 0.012, 0.03, 0.012, 0, 0.08, -0.02);
        box(gun, m.dark, 0.006, 0.022, 0.006, 0, 0.068, -0.52);
        sightY = 0.08; sightZ = -0.02;
      }
      muzzle = new THREE.Vector3(0, 0.022, -0.84);
      hipPos = new THREE.Vector3(0.17, -0.2, -0.44); adsPos = new THREE.Vector3(0, -sightY, sightZ - 0.27);
      handsR = [[0.24, -0.32, 0.3], [0.0, -0.045, 0.085]]; handsL = [[-0.24, -0.34, 0.0], [-0.0, -0.03, -0.37]];
    } else {
      // Bora-12 keskin nişancı
      box(gun, m.olive, 0.052, 0.07, 0.36, 0, 0.015, -0.05);
      box(gun, m.olive, 0.058, 0.065, 0.3, 0, 0.012, -0.36);
      cyl(gun, m.metal, 0.012, 0.014, 0.58, 0, 0.03, -0.72);
      cyl(gun, m.dark, 0.018, 0.018, 0.08, 0, 0.03, -1.03, Math.PI / 2, 0, 0, 8);
      box(gun, m.olive, 0.04, 0.12, 0.05, 0, -0.06, 0.1, -0.25);
      box(gun, m.olive, 0.044, 0.09, 0.3, 0, -0.005, 0.33);
      box(gun, m.olive, 0.046, 0.04, 0.14, 0, 0.055, 0.31);
      box(gun, m.dark, 0.05, 0.14, 0.025, 0, -0.01, 0.49);
      box(gun, m.dark, 0.01, 0.02, 0.2, 0.02, -0.05, -0.42, 0.2);
      box(gun, m.dark, 0.01, 0.02, 0.2, -0.02, -0.05, -0.42, 0.2);
      bolt = new THREE.Group();
      cyl(bolt, m.metal, 0.006, 0.006, 0.06, 0.035, 0, 0, 0, 0, Math.PI / 2);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), m.dark); knob.position.set(0.065, 0, 0); bolt.add(knob);
      bolt.position.set(0, 0.045, 0.04);
      gun.add(bolt);
      mag = new THREE.Group(); box(mag, m.dark, 0.034, 0.1, 0.08, 0, -0.05, -0.12); gun.add(mag);
      // dürbün
      const sc = new THREE.Group();
      cyl(sc, m.dark, 0.017, 0.017, 0.3, 0, 0, 0);
      cyl(sc, m.dark, 0.026, 0.02, 0.08, 0, 0, -0.18);
      cyl(sc, m.dark, 0.021, 0.018, 0.06, 0, 0, 0.16);
      cyl(sc, m.dark, 0.021, 0.021, 0.03, 0, 0.025, 0, 0);
      cyl(sc, m.dark, 0.012, 0.012, 0.03, 0.026, 0, 0, 0, 0, Math.PI / 2);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 20), m.glass); lens.position.set(0, 0, -0.221); lens.rotation.y = Math.PI; sc.add(lens);
      box(sc, m.dark, 0.02, 0.04, 0.02, 0, -0.035, -0.07); box(sc, m.dark, 0.02, 0.04, 0.02, 0, -0.035, 0.07);
      sc.position.set(0, 0.105, -0.06);
      gun.add(sc);
      sightY = 0.105; sightZ = 0.12;
      muzzle = new THREE.Vector3(0, 0.03, -1.07);
      hipPos = new THREE.Vector3(0.17, -0.21, -0.42); adsPos = new THREE.Vector3(0, -sightY, -0.12);
      handsR = [[0.24, -0.34, 0.34], [0.0, -0.06, 0.12]]; handsL = [[-0.22, -0.36, 0.0], [0.0, -0.035, -0.34]];
    }
    // kollar ve eldivenler
    const arm = (sh, hand, right) => {
      const s = limb(g, m.sleeve, sh, [hand[0] + (right ? 0.05 : -0.03), hand[1] - 0.05, hand[2] + (right ? 0.1 : 0.12)], 0.05, 0.042);
      const f = limb(g, m.glove, [hand[0] + (right ? 0.05 : -0.03), hand[1] - 0.05, hand[2] + (right ? 0.1 : 0.12)], hand, 0.036, 0.032);
      const h = box(g, m.glove, 0.045, 0.055, 0.075, hand[0], hand[1], hand[2]);
      return [s, f, h];
    };
    const hr = arm(handsR[0], handsR[1], true);
    const hl = arm(handsL[0], handsL[1], false);
    g.userData.leftArm = hl;
    g.userData.leftHandBase = hl.map((o) => o.position.clone());
    g.userData = { ...g.userData, muzzle, mag, bolt, sightY, sightZ, hipPos, adsPos, magBase: mag ? mag.position.clone() : null };
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    void hr;
    return g;
  }

  select(i) {
    if (i === this.cur && this.pendingSwitch < 0) return;
    if (i < 0 || i >= WEAPONS.length) return;
    this.pendingSwitch = i;
    this.switching = 0.5;
    this.reloading = 0; this.reloadPhase = null;
    this.g.audio.reload(null, 'switch');
  }

  startReload() {
    const s = this.w;
    if (this.reloading > 0 || this.switching > 0 || s.ammo >= s.def.mag || s.reserve <= 0) return;
    const empty = s.ammo === 0;
    this.reloadTotal = empty ? s.def.reloadEmpty : s.def.reload;
    this.reloading = this.reloadTotal;
    this.reloadEmpty = empty;
    this.reloadSteps = [0.18, 0.62, empty ? 0.85 : 2];
    this.g.onReload?.();
  }

  // bir çerçevede silah mantığı
  update(dt, P, input, cam) {
    const s = this.w, d = s.def;
    const model = this.models[d.id];
    const ud = model.userData;
    const blocked = P.dead || P.bandaging > 0 || this.throwT > 0;
    // silah değiştirme
    if (this.switching > 0) {
      const before = this.switching;
      this.switching -= dt;
      if (before > 0.25 && this.switching <= 0.25 && this.pendingSwitch >= 0) {
        this.models[d.id].visible = false;
        this.cur = this.pendingSwitch; this.pendingSwitch = -1;
        this.models[this.w.def.id].visible = true;
      }
    }
    // şarjör
    if (this.reloading > 0) {
      const prog = 1 - this.reloading / this.reloadTotal;
      this.reloading -= dt;
      const prog2 = 1 - this.reloading / this.reloadTotal;
      for (const [k, ph] of [[0, 'out'], [1, 'in'], [2, 'bolt']]) if (prog < this.reloadSteps[k] && prog2 >= this.reloadSteps[k]) this.g.audio.reload(d.type, ph);
      if (this.reloading <= 0) {
        const need = d.mag - s.ammo;
        const take = Math.min(need, s.reserve);
        s.ammo += take; s.reserve -= take;
        this.reloading = 0;
      }
    }
    this.cool -= dt;
    if (this.boltT > 0) {
      const before = this.boltT;
      this.boltT -= dt;
      if (before > 0.75 && this.boltT <= 0.75) this.g.audio.reload('sniper', 'bolt');
    }
    // nişan alma
    const wantAds = input.mouse.right && !P.sprinting && this.switching <= 0 && !blocked && (this.reloading <= 0 || d.type !== 'sniper');
    this.ads = clamp(this.ads + (wantAds ? dt : -dt) / d.adsTime, 0, 1);
    // atış
    const trigger = input.mouse.left && !blocked && !P.sprinting && this.switching <= 0 && this.reloading <= 0 && this.boltT <= 0;
    const auto = d.auto && s.mode === 0;
    if (trigger && this.cool <= 0 && (auto || input.mouse.leftPressed)) {
      if (s.ammo > 0) this.fire(P, cam);
      else if (input.mouse.leftPressed) { this.g.audio.reload(d.type, 'dry'); if (s.reserve > 0) this.startReload(); }
    }
    if (!input.mouse.left) this.burstCount = 0;
    this.bloomV = Math.max(0, this.bloomV - dt * (auto ? 4 : 6));
    this.animate(dt, P, input, model, ud);
    // kovanlar
    for (const sh of this.shells) {
      if (!sh.m.visible) continue;
      sh.t -= dt;
      sh.v.y -= 9.8 * dt;
      sh.m.position.addScaledVector(sh.v, dt);
      sh.m.rotation.x += sh.w.x * dt; sh.m.rotation.z += sh.w.z * dt;
      if (sh.t <= 0) sh.m.visible = false;
    }
    // el bombası atışı
    if (this.throwT > 0) {
      this.throwT -= dt;
      const k = 1 - this.throwT / 0.7;
      this.nadeModel.visible = k < 0.55;
      this.nadeModel.position.set(0.1 - k * 0.1, -0.12 + Math.sin(k * Math.PI) * 0.18, -0.3 - k * 0.2);
      this.nadeModel.rotation.x = -k * 4;
      if (k >= 0.5 && !this.thrown) { this.thrown = true; this.g.throwGrenade(); }
    } else this.nadeModel.visible = false;
  }

  tryThrow() {
    if (this.grenades <= 0 || this.throwT > 0 || this.g.player.dead) return;
    this.grenades--;
    this.throwT = 0.7; this.thrown = false;
    this.reloading = 0;
  }

  fire(P, cam) {
    const s = this.w, d = s.def;
    s.ammo--;
    this.cool = 60 / d.rpm;
    this.shotsFired++;
    this.burstCount++;
    this.lastShotTime = this.g.time;
    if (d.bolt) this.boltT = 60 / d.rpm - 0.05;
    // yayılım (derece)
    const moving = Math.min(1, P.hSpeed / 4);
    let spread = lerp(d.spreadHip, d.spreadAds, this.ads) + d.spreadMove * moving * (1 - this.ads * 0.6) + this.bloomV * (d.type === 'rifle' ? 0.35 : 0.5);
    if (P.crouch > 0.5) spread *= 0.75;
    if (!P.onGround) spread += 3;
    this.bloomV = Math.min(6, this.bloomV + d.bloom);
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const n = d.pellets || 1;
    const ang = spread * DEG;
    for (let i = 0; i < n; i++) {
      const cone = d.pellets ? d.pelletSpread * DEG : 0;
      const r1 = Math.sqrt(Math.random()) * ang * 0.5, a1 = Math.random() * Math.PI * 2;
      const r2 = Math.sqrt(Math.random()) * cone * 0.5, a2 = Math.random() * Math.PI * 2;
      const dir = fwd.clone()
        .addScaledVector(right, Math.cos(a1) * r1 + Math.cos(a2) * r2)
        .addScaledVector(up, Math.sin(a1) * r1 + Math.sin(a2) * r2).normalize();
      const tracer = d.tracer && (this.shotsFired % d.tracer === 0);
      this.g.ballistics.spawn({ pos: origin.clone(), dir, v: d.v * (0.97 + Math.random() * 0.06), dmg: d.dmg, pen: d.pen, falloff: d.falloff, owner: 'player', tracer, weapon: d.id });
    }
    // geri tepme
    const recoilMul = (P.crouch > 0.5 ? 0.8 : 1) * lerp(1, 0.75, this.ads);
    P.addRecoil(d.recoilP * recoilMul * (0.85 + Math.random() * 0.3), d.recoilY * recoilMul * (Math.random() - 0.4));
    const k = this.kick;
    k.vz += d.type === 'sniper' ? 2.4 : d.type === 'shotgun' ? 2.6 : d.type === 'rifle' ? 1.4 : 1.1;
    k.vrx += (d.type === 'pistol' ? 9 : d.type === 'shotgun' ? 10 : 5) * (1 - this.ads * 0.5);
    k.vry += (Math.random() - 0.5) * 3;
    // ses, alev, ışık
    this.g.audio.shot(d.sound, null, true);
    const model = this.models[d.id];
    const mw = model.userData.muzzle.clone();
    model.userData.gun.localToWorld(mw);
    this.flash.position.copy(mw);
    this.flash.scale.setScalar(d.type === 'pistol' ? 0.14 : d.type === 'shotgun' ? 0.3 : 0.24);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.visible = !(d.type === 'sniper' && this.ads > 0.9);
    this.flashT = 0.035;
    this.vFlash.position.copy(mw); this.vFlash.intensity = 4;
    // dünyadaki namlu ışığı + duman
    const wpos = origin.clone().addScaledVector(fwd, 0.9).addScaledVector(right, 0.12 * (1 - this.ads)).addScaledVector(up, -0.08);
    this.g.fx.muzzle(wpos, fwd, d.type === 'pistol' ? 0.6 : 1, true);
    this.g.alertShot(origin, d.type);
    // kovan
    if (d.type !== 'shotgun' || true) {
      const sh = this.shells[this.si++ % this.shells.length];
      sh.m.visible = true; sh.t = 0.7;
      const ep = new THREE.Vector3(0.03, 0.05, -0.05);
      model.userData.gun.localToWorld(ep);
      sh.m.position.copy(ep);
      sh.v.set(1.2 + Math.random() * 0.6, 1.0 + Math.random() * 0.5, 0.3);
      sh.w.set(Math.random() * 20, 0, Math.random() * 20);
      if (d.bolt) { sh.t = 0; sh.m.visible = false; }
    }
  }

  animate(dt, P, input, model, ud) {
    const k = this.kick;
    // yay sönümlemeleri
    const spring = (x, v, st, dm) => { v += (-x * st - v * dm) * dt; x += v * dt; return [x, v]; };
    [k.z, k.vz] = spring(k.z, k.vz, 180, 18);
    [k.rx, k.vrx] = spring(k.rx, k.vrx, 160, 16);
    [k.ry, k.vry] = spring(k.ry, k.vry, 120, 14);
    // sallanma (fare gecikmesi)
    this.sway.x = lerp(this.sway.x, clamp(-input.mouse.dx * 0.0009, -0.06, 0.06), 1 - Math.exp(-dt * 10));
    this.sway.y = lerp(this.sway.y, clamp(input.mouse.dy * 0.0009, -0.06, 0.06), 1 - Math.exp(-dt * 10));
    const a = this.ads;
    const pos = ud.hipPos.clone().lerp(ud.adsPos, a);
    const rot = new THREE.Euler(0.02 * (1 - a), 0.05 * (1 - a), 0);
    // yürüme salınımı
    const sp = P.hSpeed;
    this.bobT += dt * (P.sprinting ? 11 : 7.5) * Math.min(1, sp / 2);
    const bobA = Math.min(1, sp / 4) * (1 - a * 0.85) * (P.onGround ? 1 : 0.2);
    pos.x += Math.sin(this.bobT) * 0.012 * bobA;
    pos.y += -Math.abs(Math.cos(this.bobT)) * 0.014 * bobA;
    rot.z += Math.sin(this.bobT) * 0.02 * bobA;
    // nefes
    const br = Math.sin(this.g.time * 1.6) * 0.002 * (1 - a * 0.7);
    pos.y += br;
    // koşu pozu
    const spr = P.sprintBlend || 0;
    pos.x += spr * 0.02; pos.y -= spr * 0.06; pos.z += spr * 0.03;
    rot.y += spr * 0.55; rot.x += -spr * 0.28; rot.z += spr * 0.2;
    // çömelme/eğilme
    rot.z += P.lean * 0.08 * (1 - a);
    // şarjör animasyonu
    let magOff = 0;
    if (this.reloading > 0) {
      const t = 1 - this.reloading / this.reloadTotal;
      const env = Math.sin(Math.min(1, t * 1.1) * Math.PI);
      rot.z += env * 0.55; rot.x += env * 0.25; pos.y -= env * 0.05; pos.x -= env * 0.02;
      if (t > 0.12 && t < 0.62) magOff = Math.min(1, (t - 0.12) / 0.15) * (t < 0.45 ? 1 : 1 - (t - 0.45) / 0.17);
    }
    if (ud.mag) ud.mag.position.copy(ud.magBase).add(new THREE.Vector3(0, -0.3 * magOff, 0.05 * magOff));
    // sol el şarjörü takip eder
    if (ud.leftArm && this.reloading > 0) {
      ud.leftArm.forEach((o, i) => o.position.copy(ud.leftHandBase[i]).add(new THREE.Vector3(0, -0.18 * magOff, 0.2 * magOff)));
    } else if (ud.leftArm) ud.leftArm.forEach((o, i) => o.position.copy(ud.leftHandBase[i]));
    // sürgü
    if (ud.bolt) {
      const b = this.boltT > 0 ? 1 - this.boltT / (60 / this.w.def.rpm - 0.05) : 1;
      const up = b > 0.15 && b < 0.85 ? 1 : 0;
      const back = b > 0.3 && b < 0.7 ? Math.sin(((b - 0.3) / 0.4) * Math.PI) : 0;
      ud.bolt.rotation.z = up * 1.1; ud.bolt.position.z = 0.04 + back * 0.08;
      if (this.boltT > 0) { rot.z += 0.12 * up; pos.y -= 0.02 * up; }
    }
    // değiştirme / sargı / bomba
    let low = 0;
    if (this.switching > 0) low = Math.sin((this.switching / 0.5) * Math.PI);
    if (P.bandaging > 0) low = Math.max(low, 0.9);
    if (this.throwT > 0) low = Math.max(low, Math.sin(Math.min(1, (0.7 - this.throwT) / 0.7) * Math.PI));
    if (P.dead) low = 1;
    pos.y -= low * 0.35; rot.x -= low * 0.6;
    // geri tepme
    pos.z += k.z * 0.05;
    rot.x += k.rx * 0.05; rot.y += k.ry * 0.03;
    pos.y += k.rx * 0.004 * (1 - a * 0.7);
    // sallanma
    rot.y += this.sway.x * (1 - a * 0.7); rot.x += this.sway.y * (1 - a * 0.7);
    pos.x += this.sway.x * 0.1 * (1 - a); pos.y += this.sway.y * 0.1 * (1 - a);
    model.position.copy(pos);
    model.rotation.copy(rot);
    // dürbünde model gizlenir
    const scoped = this.w.def.type === 'sniper' && a > 0.92;
    model.visible = !scoped && this.pendingSwitch !== -2;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.vFlash.intensity = 0; } }
    else this.flash.visible = false;
  }

  // görünüm sahnesi ışıklarını dünya ile eşitle
  syncLights(env, cam, extra = 0) {
    const inv = cam.quaternion.clone().invert();
    const d = (env.lightDir || env.sunDir).clone().applyQuaternion(inv);
    this.vSun.position.copy(d).multiplyScalar(5);
    this.vSun.target.position.set(0, 0, 0);
    this.vSun.color.copy(env.sun.color);
    this.vSun.intensity = env.sun.intensity * 0.9;
    this.vHemi.color.copy(env.hemi.color); this.vHemi.groundColor.copy(env.hemi.groundColor);
    this.vHemi.intensity = Math.max(0.12, env.hemi.intensity) + extra;
  }

  hudInfo() {
    const s = this.w, d = s.def;
    return { name: d.name, cal: d.cal, ammo: s.ammo, reserve: s.reserve, mode: d.modes[s.mode] || d.modes[0], mag: d.mag };
  }
  toggleMode() {
    const s = this.w;
    if (s.def.modes.length > 1) { s.mode = (s.mode + 1) % s.def.modes.length; this.g.audio.click(2600, 0.25); }
  }
  resupply(frac = 1) {
    for (const s of this.state) s.reserve = Math.min(s.def.reserveMax, s.reserve + Math.ceil(s.def.mag * 2 * frac));
    this.grenades = Math.min(4, this.grenades + 1);
  }
  reset() {
    for (const s of this.state) { s.ammo = s.def.mag; s.reserve = s.def.reserve; s.mode = 0; }
    this.grenades = 3; this.reloading = 0; this.switching = 0; this.pendingSwitch = -1; this.boltT = 0; this.ads = 0; this.throwT = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    for (const w of WEAPONS) this.models[w.id].visible = false;
    this.cur = 1; this.models[WEAPONS[1].id].visible = true;
  }
}

// Balistik: yerçekimli mermiler, çarpma, sekme yok, sızma (cam/plastik)
export class Ballistics {
  constructor(game) { this.g = game; this.list = []; this._d = new THREE.Vector3(); }
  spawn(b) {
    b.vel = b.dir.clone().multiplyScalar(b.v);
    b.life = 3;
    b.dist = 0;
    b.passed = new Set();
    if (b.tracer) { b.tr = { head: b.pos.clone(), tail: b.pos.clone(), color: b.owner === 'player' ? [1, 0.75, 0.4] : [1, 0.55, 0.3], width: 0.018, intensity: 4 }; this.g.fx.tracers.add(b.tr); }
    this.list.push(b);
  }
  update(dt) {
    const g = this.g;
    const out = [];
    for (const b of this.list) {
      let remaining = dt;
      let alive = true;
      const start = b.pos.clone();
      while (alive && remaining > 0) {
        const step = Math.min(remaining, 0.02);
        remaining -= step;
        b.vel.y -= 9.81 * step;
        const seg = this._d.copy(b.vel).multiplyScalar(step);
        const len = seg.length();
        const dir = seg.clone().divideScalar(len);
        const hit = g.world.col.raycast(b.pos.x, b.pos.y, b.pos.z, dir.x, dir.y, dir.z, len);
        const eh = g.enemies.raycast(b.pos, dir, hit.hit ? hit.t : len, b.owner);
        const ph = b.owner !== 'player' ? g.player.raycast(b.pos, dir, hit.hit ? hit.t : len) : null;
        // mermi oyuncunun yakınından geçerse çatırtı
        if (b.owner !== 'player' && !b.cracked) {
          const cp = g.player.eye;
          const toP = cp.clone().sub(b.pos);
          const tt = clamp(toP.dot(dir), 0, len);
          const closest = b.pos.clone().addScaledVector(dir, tt);
          const dd = closest.distanceTo(cp);
          if (dd < 2.5) { b.cracked = true; g.audio.crack(closest); g.player.suppress(1 - dd / 2.5); }
        }
        if (b.owner === 'player' && !b.cracked) g.enemies.nearMiss(b.pos, dir, len);
        let best = null;
        if (hit.hit) best = { t: hit.t, type: 'world', hit };
        if (eh && (!best || eh.t < best.t)) best = { t: eh.t, type: 'enemy', eh };
        if (ph && (!best || ph.t < best.t)) best = { t: ph.t, type: 'player', ph };
        if (best) {
          const p = b.pos.clone().addScaledVector(dir, best.t);
          const falloff = b.falloff ? lerp(1, b.falloff[2], clamp((b.dist + best.t - b.falloff[0]) / (b.falloff[1] - b.falloff[0]), 0, 1)) : 1;
          if (best.type === 'world') {
            const it = best.hit.item;
            const surf = best.hit.kind === 'water' ? 'water' : best.hit.kind === 'ground' ? g.surfaceAt(p) : (it?.mat || 'plaster');
            g.fx.impact({ x: p.x, y: p.y, z: p.z, nx: best.hit.nx, ny: best.hit.ny, nz: best.hit.nz }, dir, surf);
            if (Math.random() < 0.5 || b.owner === 'player') g.audio.impact(surf, p);
            if (it && (it.mat === 'glass' || it.mat === 'plastic') && !b.passed.has(it)) {
              b.passed.add(it);
              b.pos.copy(p).addScaledVector(dir, 0.05);
              b.dmg *= 0.8;
              b.dist += best.t;
              continue;
            }
            alive = false;
            b.pos.copy(p);
          } else if (best.type === 'enemy') {
            g.enemies.damage(best.eh, b.dmg * falloff, b.pen, dir, p, b.owner, b.weapon);
            g.fx.bloodHit(p, dir);
            alive = false; b.pos.copy(p);
          } else {
            g.player.damage(b.dmg * falloff, b.src || start, best.ph.part);
            alive = false; b.pos.copy(p);
          }
          if (b.tr) { b.tr.head.copy(b.pos); }
          break;
        }
        b.pos.add(seg);
        b.dist += len;
        if (b.pos.y < -30 || b.dist > 1600) { alive = false; break; }
      }
      b.life -= dt;
      if (b.tr) {
        b.tr.head.copy(b.pos);
        b.tr.tail.copy(b.pos).addScaledVector(b.vel.clone().normalize(), -Math.min(b.dist, 14));
        if (!alive) b.tr.dead = true;
      }
      if (alive && b.life > 0) out.push(b);
    }
    this.list = out;
  }
  clear() { for (const b of this.list) if (b.tr) b.tr.dead = true; this.list = []; }
}
