// Oyun akışı: görev modları, dalgalar, puan, fener/GGD, el bombası, bitiş
import * as THREE from 'three';
import { Player } from './player.js';
import { WeaponSystem, Ballistics, WEAPONS } from './weapons.js';
import { Enemies, spawnBoatTeam, spawnVanTeam, spawnHillTeam, spawnHidden } from './enemies.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { NavGrid } from './nav.js';
import { surfaceAt, groundAt, shoreZ } from './terrain.js';

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, scene, camera, vScene, vCamera, world, env, night, post, T, S, audio, input, sea, poolWater
    this.time = 0;
    this.diff = 'normal';
    this.nav = new NavGrid(this.world);
    this.fx = new FX(this.scene, this.T, this.audio);
    this.ballistics = new Ballistics(this);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.enemies = new Enemies(this);
    this.hud = new HUD(this);
    this.flashlight = new THREE.SpotLight(0xfff6e8, 0, 70, 0.36, 0.55, 1.4);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.flashlightOn = false; this.nvgOn = false;
    this.flashK = 0;
    this.running = false; this.paused = false;
    this.score = 0;
    this.mode = 'waves';
    this.wave = 0; this.waveState = 'idle'; this.waveT = 0; this.pending = [];
    this.timeFlow = false;
    this.heartT = 0;
    this.baseHFov = 95;
    this.mapOpen = false;
  }

  start(opts) {
    this.mode = opts.mode; this.diff = opts.diff; this.timeFlow = opts.timeFlow;
    this.env.setTime(opts.hours, true);
    this.enemies.clear();
    this.ballistics.clear();
    this.fx.clear();
    this.weapons.reset();
    this.player.reset(new THREE.Vector3(-8, 0, 7), Math.PI * 0.95);
    this.player.kills = 0; this.player.headshots = 0;
    this.score = 0; this.time = 0; this.startTime = 0;
    this.wave = 0; this.waveState = 'intro'; this.waveT = 4; this.pending = [];
    this.nvgOn = false; this.flashlightOn = false;
    this.running = true; this.paused = false; this.over = false;
    this.hud.show(true);
    if (this.mode === 'clear') {
      spawnHidden(this.enemies, 12, 3, this.player.pos);
      spawnHillTeam(this.enemies, 2, 2);
      for (const e of this.enemies.list) if (e.state === 'advance') e.state = 'patrol';
      this.hud.message('TEMİZLİK', 'Köye 12 operatör gizlendi: damlar, çalılar, duvar dipleri. Hepsini bul.', 5);
    } else {
      this.hud.message('MERTUR TATİL KÖYÜ', this.env.nightK > 0.5 ? 'Gece. Denizden motor sesi geliyor… (N: gece görüş, F: fener)' : 'Denizden motor sesi geliyor. Havuz başında mevzilen.', 5);
    }
  }

  modeInfo() {
    const n = this.enemies.aliveCount();
    if (this.mode === 'clear') return { title: 'TEMİZLİK', sub: `${n} operatör kaldı` };
    if (this.waveState === 'break') return { title: `DALGA ${this.wave} TAMAM`, sub: `Sonraki dalga ${Math.ceil(this.waveT)} sn` };
    if (this.waveState === 'intro') return { title: 'HAZIRLAN', sub: `İlk temas ${Math.ceil(this.waveT)} sn` };
    return { title: `DALGA ${this.wave}`, sub: `${n + this.pending.reduce((s, p) => s + p.n, 0)} operatör` };
  }

  // dalga kurgusu
  planWave(w) {
    const groups = [];
    const size = (a) => Math.min(6, a);
    if (w === 1) groups.push({ type: 'boat', n: 4, at: 0 });
    else if (w === 2) { groups.push({ type: 'boat', n: 4, at: 0 }); groups.push({ type: 'van', n: 4, at: 25 }); }
    else if (w === 3) { groups.push({ type: 'van', n: 5, at: 0 }); groups.push({ type: 'hill', n: 3, at: 20 }); groups.push({ type: 'hidden', n: 2, at: 0 }); }
    else if (w === 4) { groups.push({ type: 'boat', n: 5, at: 0 }); groups.push({ type: 'boat', n: 4, at: 18 }); groups.push({ type: 'hidden', n: 2, at: 0 }); }
    else {
      let total = 6 + 2 * w;
      const types = ['boat', 'van', 'hill'];
      let at = 0;
      groups.push({ type: 'hidden', n: Math.min(4, 1 + Math.floor(w / 2)), at: 0 });
      total -= groups[0].n;
      while (total > 0) {
        const n = size(3 + Math.floor(Math.random() * 3));
        groups.push({ type: types[Math.floor(Math.random() * 3)], n: Math.min(n, total), at });
        total -= n; at += 15 + Math.random() * 15;
      }
    }
    return groups;
  }
  spawnGroup(gp) {
    const E = this.enemies;
    if (gp.type === 'boat') spawnBoatTeam(E, gp.n, this.wave);
    else if (gp.type === 'van') spawnVanTeam(E, gp.n, this.wave);
    else if (gp.type === 'hill') spawnHillTeam(E, gp.n, this.wave);
    else spawnHidden(E, gp.n, this.wave, this.player.pos);
  }

  updateWaves(dt) {
    if (this.mode === 'clear') {
      if (!this.over && this.enemies.aliveCount() === 0) this.finish(true);
      return;
    }
    this.waveT -= dt;
    if (this.waveState === 'intro' || this.waveState === 'break') {
      if (this.waveT <= 0) {
        this.wave++;
        this.pending = this.planWave(this.wave).map((g) => ({ ...g, t: g.at }));
        this.waveState = 'active'; this.waveT = 0;
        const hint = this.pending.map((p) => ({ boat: 'denizden bot', van: 'sahil yolundan minibüs', hill: 'yamaçtan sızma', hidden: 'gizlenmiş nişancı' }[p.type]));
        this.hud.message(`DALGA ${this.wave}`, [...new Set(hint)].join(' · '), 4);
      }
      return;
    }
    // aktif
    for (const p of this.pending) p.t -= dt;
    const alive = this.enemies.aliveCount();
    const ready = this.pending.filter((p) => p.t <= 0 && alive < 16);
    for (const p of ready) this.spawnGroup(p);
    this.pending = this.pending.filter((p) => !ready.includes(p));
    if (!ready.length && !this.pending.length && this.enemies.aliveCount() === 0 && this.enemies.list.length) {
      this.waveState = 'break'; this.waveT = 18;
      this.weapons.resupply(1);
      this.player.bandages = Math.min(4, this.player.bandages + 1);
      this.hud.message(`DALGA ${this.wave} TAMAMLANDI`, 'Mühimmat ve sargı takviyesi alındı. Yeni mevzi seç.', 5);
      // cesetleri azalt
      for (const e of this.enemies.list.filter((e) => !e.alive).slice(0, -8)) e.view.dispose(this.scene);
      this.enemies.list = this.enemies.list.filter((e) => e.alive || this.enemies.list.filter((x) => !x.alive).slice(-8).includes(e));
      for (const v of this.enemies.vehicles.slice(0, -2)) v.dispose();
      this.enemies.vehicles = this.enemies.vehicles.slice(-2);
    }
  }

  update(dt) {
    if (!this.running) return;
    const I = this.input, P = this.player, W = this.weapons;
    this.time += dt;
    if (this.timeFlow) this.env.setTime(this.env.hours + (dt * 30) / 3600);
    // tuşlar
    if (!P.dead) {
      for (let i = 0; i < WEAPONS.length; i++) if (I.hit(WEAPONS[i].key)) W.select(i);
      if (I.mouse.wheel) W.select((W.cur + (I.mouse.wheel > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length);
      if (I.hit('KeyR')) W.startReload();
      if (I.hit('KeyB')) W.toggleMode();
      if (I.hit('KeyG')) W.tryThrow();
      if (I.hit('KeyF')) { this.flashlightOn = !this.flashlightOn; this.audio.click(this.flashlightOn ? 2400 : 1800, 0.25); }
      if (I.hit('KeyN')) { this.nvgOn = !this.nvgOn; this.audio.click(900, 0.3); }
    }
    if (I.hit('KeyT')) this.env.setTime(this.env.hours + 1.5, true);
    if (I.hit('KeyM')) this.toggleMap();
    if (this.mapOpen) { I.mouse.dx = 0; I.mouse.dy = 0; }
    P.update(dt, I, this.camera);
    W.update(dt, P, I, this.camera);
    this.ballistics.update(dt);
    this.enemies.update(dt);
    this.updateWaves(dt);
    // kamera FOV
    const aspect = this.camera.aspect;
    const vBase = 2 * Math.atan(Math.tan((this.baseHFov * Math.PI) / 360) / aspect);
    const zoom = 1 + (W.w.def.adsZoom - 1) * W.ads;
    const vf = (2 * Math.atan(Math.tan(vBase / 2) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - vf) > 0.01) { this.camera.fov = vf; this.camera.updateProjectionMatrix(); }
    // fener
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    this.flashlight.position.copy(cam.position).addScaledVector(right, 0.18).add(new THREE.Vector3(0, -0.12, 0));
    this.flashlight.target.position.copy(cam.position).addScaledVector(fwd, 10);
    this.flashlight.target.updateMatrixWorld();
    this.flashlight.intensity = this.flashlightOn && !P.dead ? 90 : 0;
    // ses dinleyicisi, ortam
    this.audio.setListener(cam.position, fwd);
    const sd = shoreZ(P.pos.x) - P.pos.z;
    this.audio.ambient(this.env.dayK, this.env.nightK, sd);
    // düşük sağlık kalp atışı
    if (P.health < 35 && !P.dead) { this.heartT -= dt; if (this.heartT <= 0) { this.audio.heartbeat(); this.heartT = 0.6 + P.health / 50; } }
    // şok bombası
    this.flashK = Math.max(0, this.flashK - dt * 0.28);
    this.hud.update(dt);
    // bitiş kontrolü
    if (P.dead && !this.over && P.deathT > 2.2) this.finish(false);
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.onMap?.(this.mapOpen);
  }

  // efekt parametreleri (main çağırır)
  postParams() {
    const P = this.player;
    return {
      nvg: this.nvgOn ? 1 : 0,
      damage: Math.max(0, (100 - P.health) / 100) * 0.9 + P.flinch * 0.4,
      flash: Math.min(1, this.flashK * 1.4),
      blur: Math.min(1, this.flashK * 0.8) + P.suppression * 0.35,
      under: P.underwater ? 1 : 0,
      low: P.health < 35 ? (35 - P.health) / 35 : 0,
    };
  }

  surfaceAt(p) {
    const W = this.world;
    if (W.inPool(p.x, p.z)) return 'water';
    const gy = groundAt(p.x, p.z);
    if (p.y !== undefined && p.y > gy + 0.25) {
      const c = W.col.insideSolid(p.x, p.z, p.y - 0.1, 0.2);
      if (c) return c.mat === 'stone' ? 'stone' : c.mat === 'wood' ? 'wood' : 'stone';
    }
    const s = surfaceAt(p.x, p.z, gy);
    if (s === 'grass') {
      // yollar ve döşemeler: splat verisi yok, patika yakınını taş say
      return this.nearPath(p.x, p.z) ? 'stone' : 'grass';
    }
    return s;
  }
  nearPath(x, z) {
    for (const p of this.world.poolsInfo) { const [lx, lz] = this.world.poolLocal(p, x, z); if (Math.abs(lx) < p.w / 2 + p.deck && Math.abs(lz) < p.d / 2 + p.deck) return true; }
    return false;
  }

  alertShot(pos, type) { this.enemies.alertShot(pos, type); }
  noise(pos, r) { this.enemies.noise(pos, r); }

  throwGrenade() {
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = cam.position.clone().addScaledVector(fwd, 0.5);
    const v = fwd.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(this.player.vel);
    this.enemies.spawnNade(p, v, 3.5, false, 'player');
    this.audio.click(1500, 0.3);
    this.alertShot(p, 'pistol');
  }
  flashbang(k) { this.flashK = Math.max(this.flashK, k * 3.2); }

  onKill(e, headshot, weapon) {
    const P = this.player;
    P.kills++;
    if (headshot) P.headshots++;
    const d = Math.round(e.pos.distanceTo(P.pos));
    const pts = 100 + (headshot ? 50 : 0) + Math.max(0, d - 50);
    this.score += pts;
    this.hud.hitmarker(true);
    const wn = weapon === 'nade' ? 'El bombası' : (WEAPONS.find((w) => w.id === weapon)?.name || '');
    this.hud.feed(`${headshot ? 'Kafadan · ' : ''}${e.w.name} taşıyan operatör etkisiz · ${d} m · ${wn}  +${pts}`, headshot);
  }

  onPlayerDeath() {
    this.audio.hurt();
    this.hud.message('VURULDUN', '', 2);
  }

  finish(win) {
    this.over = true;
    this.running = true;
    const P = this.player, W = this.weapons;
    const acc = W.shotsFired ? Math.round((W.shotsHit / W.shotsFired) * 100) : 0;
    const secs = Math.round(this.time);
    this.onOver?.({
      win,
      title: win ? 'BÖLGE TEMİZLENDİ' : 'ETKİSİZ HALE GETİRİLDİN',
      text: win ? 'Mertur Tatil Köyü güvende. Tüm ΕΚΑΜ operatörleri etkisiz.' : (this.mode === 'waves' ? `${this.wave}. dalgada düştün.` : 'Temizlik yarıda kaldı.'),
      stats: [['Dalga', this.mode === 'waves' ? this.wave : '—'], ['Etkisiz', P.kills], ['Kafadan', P.headshots], ['İsabet', `${acc}%`], ['Puan', this.score], ['Süre', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`]],
    });
  }
}
