// ΕΚΑΜ timleri: algılama, siper seçimi, gözetleme/ateş, kuşatma, el bombası/şok bombası,
// telsiz çağrıları; bot (RIB) ve minibüs çıkarmaları, gizlenmiş nişancılar.
import * as THREE from 'three';
import { SoldierView } from './soldier.js';
import { raySphere, rayCapsule } from './player.js';
import { clamp, lerp, DEG } from './util.js';
import { groundAt, shoreZ, ROAD_Z0, ROAD_Z1, SITE_WALL_Z, diagPoint } from './terrain.js';
import { PLAY_BOUNDS, BUILDINGS, roofSpots } from './layout.js';

const EW = {
  smg: { name: 'HK MP5', sound: 'smg', rpm: 800, dmg: 16, v: 400, spread: 3.0, burst: [3, 5], pause: [0.7, 1.5], mag: 30, range: 45, pen: 0.55 },
  ar: { name: 'HK416', sound: 'ar', rpm: 720, dmg: 24, v: 880, spread: 2.2, burst: [2, 4], pause: [0.8, 1.8], mag: 30, range: 110, pen: 0.9 },
  dmr: { name: 'HK G3A3 ZF', sound: 'g3', rpm: 150, dmg: 42, v: 790, spread: 0.9, burst: [1, 2], pause: [1.8, 3.4], mag: 20, range: 260, pen: 1.0 },
};

export const CALLS = {
  contact: [['Επαφή! Στόχος!', 'Temas! Hedef görüldü!'], ['Εχθρός μπροστά!', 'Düşman önde!'], ['Τον βλέπω!', 'Onu görüyorum!']],
  move: [['Κινούμαι!', 'İlerliyorum!'], ['Αλλάζω θέση!', 'Yer değiştiriyorum!']],
  cover: [['Καλύψτε με!', 'Beni koruyun!'], ['Πυρ κάλυψης!', 'Örtme ateşi!']],
  reload: [['Αλλάζω γεμιστήρα!', 'Şarjör değiştiriyorum!']],
  frag: [['Χειροβομβίδα!', 'El bombası atıyorum!']],
  flash: [['Φλας! Φλας!', 'Şok bombası!']],
  down: [['Έχουμε τραυματία!', 'Yaralımız var!'], ['Έπεσε ένας!', 'Bir kişi düştü!']],
  lost: [['Τον χάσαμε!', 'Onu kaybettik!'], ['Πού πήγε;', 'Nereye gitti?']],
  flank: [['Πλευροκόπηση δεξιά!', 'Sağdan kuşatıyoruz!'], ['Πάω αριστερά!', 'Soldan dolaşıyorum!']],
  nade: [['Χειροβομβίδα! Καλυφθείτε!', 'El bombası! Siper alın!']],
  land: [['Αποβίβαση! Κινηθείτε!', 'Çıkarma! Harekete geçin!'], ['Ακτή καθαρή, προχωράμε!', 'Sahil temiz, ilerliyoruz!']],
  sniper: [['Ελεύθερος σκοπευτής!', 'Keskin nişancı!']],
};

let EID = 1;

class Enemy {
  constructor(mgr, kind, pos, opts = {}) {
    this.m = mgr; this.id = EID++;
    this.kind = kind; this.w = EW[kind];
    this.view = new SoldierView(mgr.g.S, mgr.g.scene, kind);
    this.pos = pos.clone();
    this.yaw = opts.yaw ?? 0;
    this.vel = new THREE.Vector3();
    this.hp = 100; this.alive = true;
    this.state = opts.state || 'advance';
    this.stateT = 0; this.thinkT = Math.random() * 0.5; this.seeT = Math.random() * 0.2;
    this.aware = opts.aware ?? 0;
    this.lastKnown = null; this.lastSeen = -100; this.canSee = false; this.seePart = 'body';
    this.path = null; this.pi = 0; this.repath = 0;
    this.cover = null; this.peeking = false; this.peekT = 0; this.coverT = 0; this.peeks = 0;
    this.crouchT = opts.crouch ?? 0; this.view.crouch = this.crouchT;
    this.aimT = 0; this.burst = 0; this.fireCool = 0.5; this.ammo = this.w.mag; this.reloadT = 0;
    this.suppression = 0;
    this.speed = 0; this.moveSpeed = 1.6;
    this.onRoof = opts.roof || null;
    this.boat = opts.boat || null; this.boatOff = opts.boatOff || null;
    this.goal = opts.goal || null;
    this.grenades = kind === 'dmr' ? 0 : 1; this.flashbangs = kind === 'smg' ? 2 : 1;
    this.nvg = Math.random() < 0.65;
    this.lightOn = false;
    this.dist = 999;
    this.lod = 0;
    this.stuckT = 0; this.lastPos = this.pos.clone();
    this.view.floorY = this.pos.y;
    this.aimPoint = new THREE.Vector3();
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + lerp(1.62, 1.08, this.view.crouch), this.pos.z); }
}

export class Enemies {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.vehicles = [];
    this.moveTokens = 0;
    this.lastCall = -10;
    this.coverGrid = new Map();
    for (const c of game.world.cover) {
      const k = `${Math.floor(c.x / 10)},${Math.floor(c.z / 10)}`;
      if (!this.coverGrid.has(k)) this.coverGrid.set(k, []);
      this.coverGrid.get(k).push(c);
    }
    this.nadeList = [];
    this.lightPool = [0, 1, 2].map(() => {
      const s = new THREE.SpotLight(0xfff0d6, 0, 45, 0.32, 0.5, 1.6);
      s.castShadow = false;
      game.scene.add(s); game.scene.add(s.target);
      return s;
    });
  }

  get alive() { return this.list.filter((e) => e.alive); }
  aliveCount() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  spawn(kind, pos, opts) {
    const e = new Enemy(this, kind, pos, opts);
    this.list.push(e);
    return e;
  }

  clear() {
    for (const e of this.list) e.view.dispose(this.g.scene);
    this.list = [];
    for (const v of this.vehicles) v.dispose();
    this.vehicles = [];
    for (const n of this.nadeList) this.g.scene.remove(n.mesh);
    this.nadeList = [];
  }

  call(e, type, force = false) {
    const t = this.g.time;
    if (!force && t - this.lastCall < 2.6) return;
    this.lastCall = t;
    const opts = CALLS[type];
    const [gr, tr] = opts[Math.floor(Math.random() * opts.length)];
    this.g.audio.radio(e ? e.pos : null);
    this.g.hud.subtitle(gr, tr, e && e.dist < 45);
  }

  // ---------------- algılama ----------------
  alertShot(pos, type) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(pos);
      const range = type === 'pistol' ? 140 : 260;
      if (d > range) continue;
      const err = d * 0.08;
      const lk = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * err, 0, (Math.random() - 0.5) * err));
      if (!e.lastKnown || !e.canSee) e.lastKnown = lk;
      e.aware = Math.max(e.aware, d < 70 ? 1 : 0.7);
      if (e.state === 'ambush' && d > 60 && e.onRoof == null) continue;
      if (e.state === 'advance' || e.state === 'patrol' || e.state === 'ambush' || e.state === 'hunt') {
        if (e.state !== 'boarded') { e.state = 'combat'; e.thinkT = 0.2 + Math.random() * 0.6; }
      }
    }
  }
  noise(pos, radius) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(pos);
      if (d > radius) continue;
      e.aware = Math.min(1, e.aware + 0.25);
      if (!e.canSee) e.lastKnown = pos.clone();
    }
  }
  nearMiss(p, dir, len) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const to = e.eye.sub(p);
      const t = clamp(to.dot(dir), 0, len);
      const d = to.addScaledVector(dir, -t).length();
      if (d < 2.2) {
        e.suppression = Math.min(1, e.suppression + (1 - d / 2.2) * 0.5);
        e.aware = Math.max(e.aware, 0.8);
        if (!e.lastKnown) e.lastKnown = this.g.player.pos.clone();
      }
    }
  }

  visibility(e) {
    const P = this.g.player;
    const g = this.g;
    if (P.dead) return false;
    const eye = e.eye;
    const d = eye.distanceTo(P.eye);
    const night = g.env.nightK;
    let range = lerp(220, e.nvg ? 110 : 45, night);
    if (g.flashlightOn && night > 0.3) range = Math.max(range, 240);
    if (g.weapons.lastShotTime > g.time - 0.3) range = Math.max(range, 300);
    if (d > range) return false;
    // görüş konisi (uyarılmamışsa)
    if (e.aware < 0.9) {
      const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      const to = P.eye.clone().sub(eye).setY(0).normalize();
      if (f.dot(to) < Math.cos(75 * DEG)) return false;
    }
    const col = g.world.col;
    const head = P.eye.clone();
    const chest = new THREE.Vector3(P.pos.x, P.pos.y + lerp(1.2, 0.75, P.crouch), P.pos.z);
    if (col.los(eye.x, eye.y, eye.z, chest.x, chest.y, chest.z)) { e.seePart = 'body'; return true; }
    if (col.los(eye.x, eye.y, eye.z, head.x, head.y + 0.05, head.z)) { e.seePart = 'head'; return true; }
    return false;
  }

  // ---------------- siper ----------------
  findCover(e, threat, mode) {
    const P = this.g.player;
    const col = this.g.world.col;
    const R = mode === 'close' ? 14 : 30;
    const cx = Math.floor(e.pos.x / 10), cz = Math.floor(e.pos.z / 10);
    let best = null, bestS = -1e9;
    const desired = e.kind === 'smg' ? 14 : e.kind === 'dmr' ? 55 : 28;
    const dT = e.pos.distanceTo(threat);
    const allies = this.list.filter((o) => o.alive && o !== e);
    const r = Math.ceil(R / 10);
    let tests = 0;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const L = this.coverGrid.get(`${i},${j}`);
      if (!L) continue;
      for (const c of L) {
        if (c.owner && c.owner !== e && c.owner.alive) continue;
        const de = Math.hypot(c.x - e.pos.x, c.z - e.pos.z);
        if (de > R) continue;
        const tx = threat.x - c.x, tz = threat.z - c.z;
        const dt = Math.hypot(tx, tz);
        if (dt < 7) continue;
        if ((tx * c.nx + tz * c.nz) / dt > -0.35) continue; // tehdit siperin arkasında olmalı
        if (!c.low && !c.peek) continue;
        let s = -Math.abs(dt - desired) * 0.35 - de * 0.5 + Math.random() * 3;
        if (mode === 'advance') s += (dT - dt) * 0.9;
        if (mode === 'flank') {
          const a1 = Math.atan2(e.pos.x - threat.x, e.pos.z - threat.z), a2 = Math.atan2(c.x - threat.x, c.z - threat.z);
          s += Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) * 12;
        }
        for (const o of allies) { const dd = Math.hypot(o.pos.x - c.x, o.pos.z - c.z); if (dd < 3) s -= (3 - dd) * 4; }
        if (s <= bestS) continue;
        if (!this.g.nav.walkable(c.x, c.z)) continue;
        if (tests++ > 40) continue;
        // gerçekten gizliyor mu?
        const hy = c.y + (c.low ? 1.0 : 1.55);
        if (col.los(c.x, hy, c.z, P.eye.x, P.eye.y, P.eye.z)) continue;
        bestS = s; best = c;
      }
    }
    return best;
  }

  goTo(e, x, z, speed) {
    const path = this.g.nav.find(e.pos.x, e.pos.z, x, z);
    e.path = path; e.pi = 1; e.moveSpeed = speed;
    e.repath = 2 + Math.random();
    return !!path;
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const g = this.g, P = g.player;
    const cam = g.camera.position;
    let moving = 0;
    for (const e of this.list) if (e.alive && e.path && e.state === 'move') moving++;
    this.moveTokens = Math.max(1, Math.floor(this.aliveCount() * 0.45)) - moving;
    for (const v of this.vehicles) v.update(dt);
    for (const e of this.list) {
      e.dist = e.pos.distanceTo(cam);
      e.lod = e.dist < 60 ? 0 : e.dist < 140 ? 1 : 2;
      if (!e.alive) { e.view.update(dt, e.pos, e.yaw, 0, e.aimPoint, false, g.time); continue; }
      this.think(e, dt);
      this.move(e, dt);
      this.combat(e, dt);
      // görsel
      e.view.crouch = lerp(e.view.crouch, e.crouchT, 1 - Math.exp(-dt * 6));
      const aiming = e.state === 'combat' || e.state === 'cover' || e.state === 'ambush' || e.aware > 0.95;
      const tgt = e.canSee || (e.lastKnown && e.aware > 0.6) ? (e.canSee ? P.eye : e.lastKnown.clone().setY(e.lastKnown.y + 1.3)) : e.pos.clone().add(new THREE.Vector3(Math.sin(e.yaw) * 10, 1.2, Math.cos(e.yaw) * 10));
      e.aimPoint.lerp(tgt, 1 - Math.exp(-dt * 5));
      e.view.update(dt, e.pos, e.yaw, e.speed, e.aimPoint, aiming && !(e.state === 'move' && e.moveSpeed > 3) && e.reloadT <= 0, g.time, e.lod);
      e.suppression = Math.max(0, e.suppression - dt * 0.3);
    }
    this.updateLights();
    this.updateNades(dt);
  }

  think(e, dt) {
    const g = this.g, P = g.player;
    e.stateT += dt;
    // görüş testi (seyrek)
    e.seeT -= dt;
    if (e.seeT <= 0) {
      e.seeT = e.lod === 0 ? 0.15 : 0.35;
      const was = e.canSee;
      e.canSee = e.state !== 'boarded' && this.visibility(e);
      if (e.canSee) {
        const d = e.pos.distanceTo(P.pos);
        const night = g.env.nightK;
        let rate = (0.9 + 25 / (d + 4)) * (P.crouch > 0.5 ? 0.6 : 1) * (P.hSpeed > 3 ? 1.5 : P.hSpeed > 0.5 ? 1.1 : 0.8);
        rate *= lerp(1, e.nvg ? 0.7 : 0.35, night * (g.flashlightOn ? 0 : 1));
        rate *= { easy: 0.6, normal: 1, real: 1.35 }[g.diff];
        if (e.aware > 0.5) rate *= 2.5;
        e.aware = Math.min(1, e.aware + rate * e.seeT);
        if (e.aware >= 1) { e.lastKnown = P.pos.clone(); e.lastSeen = g.time; }
        if (e.aware >= 1 && (e.state === 'advance' || e.state === 'patrol' || e.state === 'hunt')) {
          e.state = 'combat'; e.thinkT = 0.15; e.aimT = 0; e.path = null;
          this.call(e, 'contact'); this.alertNearby(e, 45);
        } else if (!was && e.aware >= 1) e.aimT = 0;
      } else if (was) {
        e.aimT = 0;
      }
    }
    if (!e.canSee && e.aware < 1) e.aware = Math.max(0, e.aware - dt * 0.03);

    // araçtayken
    if (e.state === 'boarded') return;
    // durum mantığı
    e.thinkT -= dt;
    if (e.thinkT > 0) return;
    e.thinkT = 0.4 + Math.random() * 0.5;
    const threat = e.lastKnown || P.pos;
    switch (e.state) {
      case 'advance': {
        if (!e.path || e.pi >= (e.path?.length || 0)) {
          const goal = e.goal || this.randomObjective();
          this.goTo(e, goal[0], goal[1], 1.7);
          e.goal = null;
        }
        e.crouchT = 0;
        break;
      }
      case 'patrol': {
        if (!e.path || e.pi >= e.path.length) { const p = this.randomObjective(); this.goTo(e, p[0], p[1], 1.25); }
        break;
      }
      case 'ambush': {
        e.crouchT = e.onRoof ? 1 : 1;
        if (e.aware >= 1) { e.state = e.onRoof ? 'roof' : 'combat'; e.stateT = 0; }
        break;
      }
      case 'roof': {
        // damda: çömel-kalk döngüsü
        if (e.canSee || e.aware >= 1) {
          if (e.peeking && e.stateT > 2.2 + Math.random() * 1.5) { e.peeking = false; e.crouchT = 1; e.stateT = 0; }
          else if (!e.peeking && e.stateT > 1.6 + Math.random() * 1.5 && e.suppression < 0.5) { e.peeking = true; e.crouchT = 0; e.stateT = 0; e.aimT = 0; }
        }
        break;
      }
      case 'combat': {
        const d = e.pos.distanceTo(P.pos);
        const sinceSeen = g.time - e.lastSeen;
        if (sinceSeen > 14 && e.aware < 1) { e.state = 'hunt'; this.call(e, 'lost'); break; }
        if (d < 7 && e.canSee) { // yakın temas: dur ve ateş et
          e.path = null; e.crouchT = 0; break;
        }
        // el bombası / şok bombası
        if (!e.canSee && sinceSeen > 3 && sinceSeen < 20 && e.lastKnown && g.time - (this.lastNade || -99) > 9) {
          const dn = e.pos.distanceTo(e.lastKnown);
          if (dn > 9 && dn < 32 && (e.flashbangs > 0 || e.grenades > 0) && Math.random() < 0.35) {
            const flash = e.flashbangs > 0 && (e.grenades <= 0 || Math.random() < 0.6);
            if (flash) e.flashbangs--; else e.grenades--;
            this.throwNade(e, e.lastKnown, flash);
            this.lastNade = g.time;
            break;
          }
        }
        if (this.moveTokens > 0 || !e.cover) {
          const mode = e.cover && e.peeks > 2 ? (Math.random() < 0.4 ? 'flank' : 'advance') : e.cover ? 'advance' : 'any';
          const c = this.findCover(e, threat, e.kind === 'smg' ? 'close' : mode);
          if (c && c !== e.cover) {
            if (e.cover) e.cover.owner = null;
            c.owner = e; e.cover = c; e.peeks = 0;
            const fast = e.canSee || e.suppression > 0.3;
            if (this.goTo(e, c.x, c.z, fast ? 4.2 : 2.2)) {
              e.state = 'move'; e.stateT = 0; this.moveTokens--;
              if (Math.random() < 0.3) this.call(e, mode === 'flank' ? 'flank' : Math.random() < 0.5 ? 'move' : 'cover');
            }
            break;
          }
        }
        if (e.cover) { e.state = 'cover'; e.stateT = 0; e.coverT = 0.8 + Math.random() * 1.5; }
        else if (!e.canSee && e.lastKnown) { this.goTo(e, e.lastKnown.x, e.lastKnown.z, 2.0); e.state = 'move'; e.stateT = 0; }
        break;
      }
      case 'move': {
        if (!e.path || e.pi >= e.path.length) {
          if (e.cover && Math.hypot(e.cover.x - e.pos.x, e.cover.z - e.pos.z) < 1.5) { e.state = 'cover'; e.stateT = 0; e.coverT = 0.6 + Math.random() * 1.2; }
          else { e.state = 'combat'; if (e.cover) { e.cover.owner = null; e.cover = null; } }
        }
        break;
      }
      case 'cover': {
        const c = e.cover;
        if (!c) { e.state = 'combat'; break; }
        // siperim hâlâ geçerli mi (oyuncu yan tarafa geçti mi)
        const tx = P.pos.x - c.x, tz = P.pos.z - c.z, dt2 = Math.hypot(tx, tz);
        if ((tx * c.nx + tz * c.nz) / dt2 > -0.1 || dt2 < 5) { c.owner = null; e.cover = null; e.state = 'combat'; e.thinkT = 0; e.peeking = false; break; }
        if (!e.peeking) {
          e.crouchT = c.low ? 1 : 0;
          if (e.reloadT <= 0 && e.stateT > e.coverT && e.suppression < 0.6) {
            e.peeking = true; e.stateT = 0; e.aimT = 0.1;
            e.crouchT = 0;
            if (c.peek) { e.path = [[e.pos.x, e.pos.z], c.peek]; e.pi = 1; e.moveSpeed = 1.6; }
          }
        } else {
          if (e.stateT > 1.8 + Math.random() * 1.8 || e.suppression > 0.75 || e.ammo <= 0) {
            e.peeking = false; e.stateT = 0; e.coverT = 1 + Math.random() * 2; e.peeks++;
            if (c.peek) { e.path = [[e.pos.x, e.pos.z], [c.x, c.z]]; e.pi = 1; e.moveSpeed = 2.2; }
            if (e.ammo < e.w.mag * 0.35) { e.reloadT = 2.4; if (Math.random() < 0.5) this.call(e, 'reload'); }
            if (e.peeks >= 2 + Math.floor(Math.random() * 3)) { e.state = 'combat'; e.thinkT = 0.2; }
          }
        }
        break;
      }
      case 'hunt': {
        e.crouchT = 0;
        if (e.aware >= 1 && e.canSee) { e.state = 'combat'; break; }
        if (!e.path || e.pi >= e.path.length) {
          const lk = e.lastKnown || P.pos;
          const off = new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14);
          this.goTo(e, lk.x + off.x, lk.z + off.z, 1.5);
          if (Math.random() < 0.3) e.lastKnown = null;
        }
        break;
      }
    }
  }

  alertNearby(src, r) {
    for (const o of this.list) {
      if (!o.alive || o === src) continue;
      if (o.pos.distanceTo(src.pos) < r) {
        o.aware = Math.max(o.aware, 0.9);
        o.lastKnown = src.lastKnown ? src.lastKnown.clone() : null;
        if (o.state === 'advance' || o.state === 'patrol' || o.state === 'hunt') { o.state = 'combat'; o.thinkT = 0.3 + Math.random(); }
      }
    }
  }

  randomObjective() {
    // tesis içinde rastgele hedef (oyuncuya yakın bölgelere ağırlık)
    const P = this.g.player.pos;
    for (let i = 0; i < 30; i++) {
      const x = P.x + (Math.random() - 0.5) * 60, z = P.z + (Math.random() - 0.5) * 60;
      if (x < PLAY_BOUNDS.x0 + 5 || x > PLAY_BOUNDS.x1 - 5 || z < PLAY_BOUNDS.z0 + 5 || z > PLAY_BOUNDS.z1 - 5) continue;
      if (this.g.nav.walkable(x, z)) return [x, z];
    }
    return [P.x, P.z];
  }

  move(e, dt) {
    const g = this.g, W = g.world;
    if (e.state === 'boarded') {
      const b = e.boat;
      const p = b.local(e.boatOff);
      e.pos.copy(p); e.yaw = b.yaw + (e.boatOff.yaw || 0); e.speed = 0; e.crouchT = 1;
      e.view.floorY = e.pos.y;
      return;
    }
    if (e.onRoof) { e.speed = 0; this.faceTarget(e, dt); return; }
    let want = 0;
    const tgt = new THREE.Vector3();
    if (e.path && e.pi < e.path.length) {
      const [px, pz] = e.path[e.pi];
      tgt.set(px - e.pos.x, 0, pz - e.pos.z);
      const d = tgt.length();
      if (d < 0.5) { e.pi++; }
      else {
        tgt.divideScalar(d);
        want = e.moveSpeed * (e.crouchT > 0.5 ? 0.6 : 1) * (1 - e.suppression * 0.3);
        if (e.pi === e.path.length - 1 && d < 2) want *= Math.max(0.4, d / 2);
      }
      e.repath -= dt;
    }
    // ayrışma
    for (const o of this.list) {
      if (o === e || !o.alive || o.state === 'boarded') continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 1e-3) { e.pos.x += (dx / d) * (0.9 - d) * 0.5; e.pos.z += (dz / d) * (0.9 - d) * 0.5; }
    }
    const k = 1 - Math.exp(-dt * 6);
    e.vel.x = lerp(e.vel.x, tgt.x * want, k); e.vel.z = lerp(e.vel.z, tgt.z * want, k);
    const nx = e.pos.x + e.vel.x * dt, nz = e.pos.z + e.vel.z * dt;
    const fl = W.floorAt(nx, nz);
    if (fl < e.pos.y + 0.6) { e.pos.x = nx; e.pos.z = nz; }
    W.col.pushCircle(e.pos, 0.3, e.pos.y, e.pos.y + 1.7, 0.42);
    const floor = Math.max(W.floorAt(e.pos.x, e.pos.z), -1.0);
    e.pos.y = lerp(e.pos.y, floor, 1 - Math.exp(-dt * 12));
    e.view.floorY = floor;
    e.speed = Math.hypot(e.vel.x, e.vel.z);
    // takılma
    e.stuckT += dt;
    if (e.stuckT > 1.5) {
      if (want > 0.5 && e.pos.distanceTo(e.lastPos) < 0.4) { e.path = null; if (e.state === 'move') { e.state = 'combat'; if (e.cover) { e.cover.owner = null; e.cover = null; } } }
      e.stuckT = 0; e.lastPos.copy(e.pos);
    }
    // yönelim
    if (e.speed > 0.4 && !(e.canSee && e.speed < 2.5 && e.state !== 'advance')) {
      const ty = Math.atan2(e.vel.x, e.vel.z);
      e.yaw = turn(e.yaw, ty, dt * 6);
    } else this.faceTarget(e, dt);
    // ayak sesleri (oyuncuya yakınsa)
    if (e.speed > 0.8 && e.dist < 35) {
      e.stepAcc = (e.stepAcc || 0) + e.speed * dt;
      if (e.stepAcc > (e.speed > 3 ? 1.3 : 0.9)) { e.stepAcc = 0; g.audio.step(g.surfaceAt(e.pos), e.pos, 0.55); }
    }
  }

  faceTarget(e, dt) {
    const P = this.g.player;
    const t = e.canSee ? P.pos : e.lastKnown;
    if (!t) return;
    const ty = Math.atan2(t.x - e.pos.x, t.z - e.pos.z);
    e.yaw = turn(e.yaw, ty, dt * 3.5);
  }

  combat(e, dt) {
    const g = this.g, P = g.player;
    e.fireCool -= dt;
    if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) e.ammo = e.w.mag; return; }
    if (!e.canSee || e.aware < 1 || P.dead) { e.burst = 0; return; }
    if (e.state === 'boarded') return;
    if (e.state === 'cover' && !e.peeking) return;
    if (e.state === 'roof' && !e.peeking) return;
    if (e.state === 'move' && e.moveSpeed > 3) return;
    const d = e.pos.distanceTo(P.pos);
    if (d > e.w.range * (e.kind === 'dmr' ? 1.2 : 1.6)) return;
    // gövde hedefe dönük mü
    const ty = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    const dy = Math.abs(Math.atan2(Math.sin(ty - e.yaw), Math.cos(ty - e.yaw)));
    if (dy > 1.3) return;
    e.aimT += dt;
    if (e.aimT < { easy: 1.4, normal: 1.0, real: 0.6 }[g.diff] * (e.kind === 'dmr' ? 1.6 : 1)) return;
    if (e.fireCool > 0) return;
    if (e.ammo <= 0) { e.reloadT = 2.4; if (Math.random() < 0.5) this.call(e, 'reload'); return; }
    if (e.burst <= 0) e.burst = e.w.burst[0] + Math.floor(Math.random() * (e.w.burst[1] - e.w.burst[0] + 1));
    this.fire(e, d);
    e.burst--;
    e.fireCool = e.burst > 0 ? 60 / e.w.rpm : e.w.pause[0] + Math.random() * (e.w.pause[1] - e.w.pause[0]);
  }

  fire(e, d) {
    const g = this.g, P = g.player;
    e.ammo--;
    const mz = e.view.muzzleWorld(new THREE.Vector3());
    const aimAt = e.seePart === 'head' || Math.random() < 0.12 ? P.eye.clone().add(new THREE.Vector3(0, 0.02, 0)) : new THREE.Vector3(P.pos.x, P.pos.y + lerp(1.15, 0.75, P.crouch), P.pos.z);
    // isabetsizlik (derece)
    const settle = clamp(1 - (e.aimT - 0.8) / 3.0, 0, 1);
    let sig = e.w.spread + d * 0.02 + settle * 3.0 + Math.min(1, P.hSpeed / 4) * 1.6 + e.suppression * 3.5 + (e.speed > 0.5 ? 2.0 : 0) + (P.crouch > 0.5 ? 0.6 : 0);
    if (g.env.nightK > 0.5 && !e.nvg && !g.flashlightOn) sig += 1.2;
    sig *= { easy: 1.7, normal: 1.1, real: 0.8 }[g.diff];
    const dir = aimAt.sub(mz).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir);
    const gx = gauss() * sig * DEG * 0.7, gy = gauss() * sig * DEG * 0.7;
    dir.addScaledVector(right, gx).addScaledVector(up, gy).normalize();
    const dmg = e.w.dmg;
    g.ballistics.spawn({ pos: mz.clone(), dir, v: e.w.v, dmg, pen: e.w.pen, owner: 'enemy', tracer: Math.random() < (e.kind === 'dmr' ? 0.3 : 0.2), src: mz.clone(), falloff: [40, 200, 0.7] });
    g.audio.shot(e.w.sound, mz, false);
    g.fx.muzzle(mz, dir, e.kind === 'dmr' ? 1.1 : 0.8, e.dist < 90);
    e.view.hitJolt = Math.min(0.3, e.view.hitJolt + 0.05);
    if (e.kind === 'dmr' && Math.random() < 0.3) this.call(e, 'sniper');
  }

  // ---------------- isabet ----------------
  raycast(o, d, maxT, owner) {
    if (owner !== 'player') return null;
    let best = null;
    for (const e of this.list) {
      const h = e.view.hb;
      // kaba küre
      const c = h.chest;
      const R = e.alive ? 1.4 : 2.2;
      if (raySphere(o, d, c, R) === null) {
        const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
        if (ox * ox + oy * oy + oz * oz > R * R) continue;
      }
      const test = (t, part) => { if (t !== null && t <= maxT && (!best || t < best.t)) best = { t, e, part }; };
      test(raySphere(o, d, h.head, 0.14), 'head');
      test(rayCapsule(o, d, h.hips, h.neck, 0.19), 'torso');
      for (const L of [h.la, h.ra]) { test(rayCapsule(o, d, L[0], L[1], 0.07), 'arm'); test(rayCapsule(o, d, L[1], L[2], 0.06), 'arm'); }
      for (const L of [h.ll, h.rl]) { test(rayCapsule(o, d, L[0], L[1], 0.1), 'leg'); test(rayCapsule(o, d, L[1], L[2], 0.075), 'leg'); }
    }
    return best;
  }

  damage(hit, dmg, pen, dir, p, owner, weapon) {
    const e = hit.e, g = this.g;
    if (!e.alive) { e.view.hitJolt = 0.3; return; }
    let mul = 1;
    if (hit.part === 'head') mul = 3.2;
    else if (hit.part === 'torso') mul = lerp(0.45, 1, pen);
    else mul = 0.7;
    const amount = dmg * mul;
    e.hp -= amount;
    e.view.hitJolt = Math.min(1, e.view.hitJolt + 0.6);
    e.suppression = Math.min(1, e.suppression + 0.5);
    e.aware = 1;
    if (!e.canSee) e.lastKnown = g.player.pos.clone();
    if (e.state === 'advance' || e.state === 'patrol' || e.state === 'ambush' || e.state === 'hunt') { e.state = 'combat'; e.thinkT = 0.2; }
    if (owner === 'player') { g.weapons.shotsHit++; }
    if (e.hp <= 0) {
      e.alive = false; e.state = 'dead';
      if (e.cover) { e.cover.owner = null; e.cover = null; }
      e.view.floorY = g.world.floorAt(e.pos.x, e.pos.z);
      e.view.die(dir);
      g.onKill(e, hit.part === 'head', weapon);
      if (Math.random() < 0.6) {
        const w = this.list.find((o) => o.alive && o.pos.distanceTo(e.pos) < 40);
        if (w) this.call(w, 'down');
      }
      // arkadaki yüzeye kan
      const h = g.world.col.raycast(p.x, p.y, p.z, dir.x, dir.y - 0.3, dir.z, 2.5, { water: false });
      if (h.hit) g.fx.bloods.add(h.x, h.y, h.z, h.nx, h.ny, h.nz, 0.6 + Math.random() * 0.4);
    } else if (owner === 'player') g.hud.hitmarker(false);
  }

  // ---------------- el bombaları ----------------
  throwNade(e, target, flash) {
    const g = this.g;
    const from = e.eye.clone();
    const to = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const T = clamp(d / 14, 0.6, 1.8);
    const v = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * 9.81 * T, (to.z - from.z) / T);
    this.spawnNade(from, v, flash ? 1.8 : 3.2, flash, 'enemy');
    this.call(e, flash ? 'flash' : 'frag', true);
    void g;
  }
  spawnNade(pos, vel, fuse, flash, owner) {
    const g = this.g;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), new THREE.MeshStandardMaterial({ color: flash ? 0x3a3f38 : 0x39432d, roughness: 0.6, metalness: 0.3 }));
    mesh.castShadow = true;
    mesh.position.copy(pos);
    g.scene.add(mesh);
    this.nadeList.push({ mesh, pos: pos.clone(), vel: vel.clone(), fuse, flash, owner, warned: false });
  }
  updateNades(dt) {
    const g = this.g, col = g.world.col;
    const out = [];
    for (const n of this.nadeList) {
      n.fuse -= dt;
      n.vel.y -= 9.81 * dt;
      const step = n.vel.clone().multiplyScalar(dt);
      const L = step.length();
      if (L > 1e-5) {
        const d = step.clone().divideScalar(L);
        const h = col.raycast(n.pos.x, n.pos.y, n.pos.z, d.x, d.y, d.z, L + 0.04, { water: false });
        if (h.hit) {
          n.pos.set(h.x - d.x * 0.05, h.y - d.y * 0.05, h.z - d.z * 0.05);
          const vn = n.vel.x * h.nx + n.vel.y * h.ny + n.vel.z * h.nz;
          n.vel.x -= 1.6 * vn * h.nx; n.vel.y -= 1.6 * vn * h.ny; n.vel.z -= 1.6 * vn * h.nz;
          n.vel.multiplyScalar(0.45);
          if (Math.abs(vn) > 1.5) g.audio.impact('metal', n.pos);
        } else n.pos.add(step);
      }
      const floor = g.world.floorAt(n.pos.x, n.pos.z);
      if (n.pos.y < floor + 0.04) { n.pos.y = floor + 0.04; n.vel.y = Math.abs(n.vel.y) * 0.3; n.vel.x *= 0.7; n.vel.z *= 0.7; }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.vel.length() * dt * 3;
      if (!n.warned && n.owner === 'enemy' && n.pos.distanceTo(g.player.pos) < 9) { n.warned = true; g.hud.nadeWarn(); }
      if (n.fuse <= 0) { this.explode(n); g.scene.remove(n.mesh); }
      else out.push(n);
    }
    this.nadeList = out;
  }
  explode(n) {
    const g = this.g, P = g.player, col = g.world.col;
    const p = n.pos;
    const floor = g.world.floorAt(p.x, p.z);
    if (n.flash) {
      g.fx.explosion(p, floor, true);
      // oyuncuya etkisi: görüş + mesafe + bakış açısı
      const d = P.eye.distanceTo(p);
      let k = 0;
      if (d < 22 && col.los(p.x, p.y + 0.2, p.z, P.eye.x, P.eye.y, P.eye.z)) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
        const to = p.clone().sub(P.eye).normalize();
        const facing = clamp((fwd.dot(to) + 0.3) / 1.3, 0.15, 1);
        k = clamp((1 - d / 22) * 1.6, 0, 1) * facing;
      } else if (d < 8) k = 0.25;
      g.audio.flashbang(p, k);
      if (k > 0) g.flashbang(k);
      // düşmanları da sersemletir
      for (const e of this.list) if (e.alive && e.pos.distanceTo(p) < 8) { e.suppression = 1; e.aimT = -2; }
      return;
    }
    g.fx.explosion(p, floor, false);
    g.audio.explosion(p);
    const dp = P.pos.distanceTo(p);
    if (dp < 25) P.shake = Math.min(1.5, P.shake + (1 - dp / 25) * 1.2);
    const dmgAt = (d) => (d < 2.5 ? 140 : d < 8 ? 140 * Math.pow(1 - (d - 2.5) / 5.5, 1.6) : 0);
    if (dp < 8 && col.los(p.x, p.y + 0.3, p.z, P.pos.x, P.pos.y + 1.0, P.pos.z)) P.damage(dmgAt(dp), p, 'blast');
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p);
      if (d < 8 && col.los(p.x, p.y + 0.3, p.z, e.pos.x, e.pos.y + 1.0, e.pos.z)) {
        const dir = e.pos.clone().sub(p).normalize();
        this.damage({ e, part: 'torso' }, dmgAt(d), 1, dir, e.pos.clone().setY(e.pos.y + 1), n.owner, 'nade');
      } else if (d < 14) { e.suppression = 1; e.aware = 1; }
    }
  }

  // gece: en yakın düşmanlara gerçek fener ışığı
  updateLights() {
    const g = this.g;
    const night = g.env.nightK > 0.5;
    const nvgOn = g.nvgOn;
    const cand = [];
    for (const e of this.list) {
      const on = night && e.alive && !e.nvg && e.state !== 'boarded' && e.state !== 'ambush' && !e.onRoof;
      const laser = night && e.alive && e.nvg && nvgOn && e.state !== 'boarded' && e.aware > 0.5;
      e.view.setLight(on, laser);
      if (on) cand.push(e);
    }
    cand.sort((a, b) => a.dist - b.dist);
    this.lightPool.forEach((s, i) => {
      const e = cand[i];
      if (!e || e.dist > 90) { s.intensity = 0; return; }
      const lp = e.view.rifle.localToWorld(e.view.rifle.userData.light.clone());
      s.position.copy(lp);
      s.target.position.copy(lp).addScaledVector(e.view.aimDir, 10);
      s.target.updateMatrixWorld();
      s.intensity = 120;
    });
  }
}

function turn(a, b, k) {
  let d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  d = clamp(d, -k, k);
  return a + d;
}
function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// ---------------- araçlar: RIB bot, minibüs ----------------
export class Boat {
  constructor(mgr, x, landX) {
    this.m = mgr; const g = mgr.g;
    this.group = new THREE.Group();
    const tube = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.75 });
    const hull = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 });
    const blk = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.5, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 5.6, 6, 12).rotateX(Math.PI / 2), tube);
      t.position.set(s * 0.95, 0.35, -0.2); this.group.add(t);
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.28, 8, 16, Math.PI), tube);
    bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.35, 2.6); this.group.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.25, 6.2), hull); deck.position.set(0, 0.1, -0.1); this.group.add(deck);
    const cons = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.6), hull); cons.position.set(0, 0.7, -0.6); this.group.add(cons);
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), blk); eng.position.set(0, 0.55, -3.3); this.group.add(eng);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scene.add(this.group);
    this.pos = new THREE.Vector3(x, 0, shoreZ(landX) + 360);
    this.target = new THREE.Vector3(landX, 0, 0);
    // karaya oturma noktası: derinlik ~0.6 m
    let z = shoreZ(landX) + 30;
    while (z > shoreZ(landX) && groundAt(landX, z) < -0.7) z -= 0.5;
    this.target.z = z;
    this.yaw = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    this.speed = 15; this.state = 'approach'; this.t = 0;
    this.engine = g.audio.engine();
    this.col = null;
    this.crew = [];
  }
  local(off) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return new THREE.Vector3(this.pos.x + off.x * c + off.z * s, this.pos.y + 0.2, this.pos.z - off.x * s + off.z * c);
  }
  update(dt) {
    const g = this.m.g;
    this.t += dt;
    if (this.state === 'approach') {
      const to = this.target.clone().sub(this.pos); to.y = 0;
      const d = to.length();
      this.speed = Math.min(15, 2 + d * 0.22);
      this.yaw = turn(this.yaw, Math.atan2(to.x, to.z), dt * 0.8);
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      if (d < 1.2) { this.state = 'landed'; this.t = 0; this.m.call(this.crew[0], 'land', true); }
      // iz köpüğü
      if (Math.random() < 0.8) {
        const back = this.local({ x: (Math.random() - 0.5) * 1.6, z: -3.4 });
        g.fx.dust.emit({ x: back.x, y: 0.05, z: back.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.3, vz: (Math.random() - 0.5) * 0.6, life: 2.2, size: 0.6, grow: 1.2, alpha: 0.5, r: 0.95, g: 0.97, b: 1, drag: 1 });
      }
    } else if (this.state === 'landed') {
      if (!this.col) this.col = g.world.col.addBox({ x: this.pos.x, z: this.pos.z, hw: 1.25, hd: 3.2, rot: this.yaw, y0: -1, y1: 0.8, kind: 'boat', cover: 'low', mat: 'plastic' });
      // mürettebat iner
      this.crew.forEach((e, i) => {
        if (e.state !== 'boarded' || this.t < 0.6 + i * 0.7) return;
        const side = i % 2 ? 1 : -1;
        const p = this.local({ x: side * 1.6, z: e.boatOff.z });
        e.pos.set(p.x, g.world.floorAt(p.x, p.z), p.z);
        e.state = e.aware >= 1 ? 'combat' : 'advance';
        e.crouchT = 0;
        e.goal = [p.x + (Math.random() - 0.5) * 20, SITE_WALL_Z + 3];
        g.fx.impact({ x: p.x, y: 0, z: p.z, nx: 0, ny: 1, nz: 0 }, new THREE.Vector3(0, -1, 0), 'water');
      });
      this.speed = 0;
    }
    const bob = Math.sin(this.t * 1.7) * 0.06 * (this.state === 'landed' ? 0.3 : 1);
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.group.rotation.set(this.state === 'approach' ? -0.08 : 0, this.yaw, Math.sin(this.t * 1.3) * 0.02);
    this.engine?.update(this.pos, this.state === 'approach' ? Math.min(1, this.speed / 15) : 0.1);
    if (this.state === 'landed' && this.t > 12 && this.engine) { this.engine.stop(); this.engine = null; }
  }
  dispose() { this.m.g.scene.remove(this.group); this.engine?.stop(); if (this.col) this.m.g.world.col.remove(this.col); }
}

export class Van {
  constructor(mgr, fromX, stopX) {
    this.m = mgr; const g = mgr.g;
    this.group = new THREE.Group();
    const body = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.35, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.05, metalness: 0.4 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0 });
    const b = (m, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; this.group.add(o); return o; };
    b(body, 2.0, 2.0, 4.6, 0, 1.45, -0.55);
    b(body, 1.96, 1.1, 1.2, 0, 0.95, 2.3);
    const ws = b(glass, 1.8, 0.9, 0.08, 0, 1.75, 1.72); ws.rotation.x = -0.45;
    b(glass, 2.02, 0.55, 1.0, 0, 1.95, 1.1);
    b(glass, 2.02, 0.5, 3.4, 0, 2.0, -0.9);
    this.door = b(body, 0.06, 1.6, 1.3, 1.02, 1.3, 0.35);
    b(this.headMat, 0.3, 0.12, 0.05, 0.65, 1.05, 2.92); b(this.headMat, 0.3, 0.12, 0.05, -0.65, 1.05, 2.92);
    for (const sx of [-0.9, 0.9]) for (const sz of [-2.1, 1.9]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14).rotateZ(Math.PI / 2), tire); w.position.set(sx, 0.38, sz); this.group.add(w); }
    g.scene.add(this.group);
    this.dir = fromX < stopX ? 1 : -1;
    this.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const laneZ = this.dir > 0 ? 38.2 : 34.8;
    this.pos = new THREE.Vector3(fromX, groundAt(fromX, laneZ), laneZ);
    this.stopX = stopX; this.state = 'drive'; this.t = 0; this.speed = 14;
    this.engine = g.audio.engine();
    this.col = g.world.col.addBox({ x: this.pos.x, z: this.pos.z, hw: 1.0, hd: 2.95, rot: this.yaw, y0: this.pos.y, y1: this.pos.y + 2.5, kind: 'car', cover: 'high', mat: 'metal' });
    this.crew = [];
  }
  local(off) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return new THREE.Vector3(this.pos.x + off.x * c + off.z * s, this.pos.y + 0.5, this.pos.z - off.x * s + off.z * c);
  }
  update(dt) {
    const g = this.m.g;
    this.t += dt;
    if (this.state === 'drive') {
      const d = (this.stopX - this.pos.x) * this.dir;
      this.speed = Math.min(14, 1 + d * 0.5);
      this.pos.x += this.dir * this.speed * dt;
      this.pos.y = groundAt(this.pos.x, this.pos.z);
      g.world.col.move(this.col, this.pos.x, this.pos.z, this.yaw);
      this.col.y0 = this.pos.y; this.col.y1 = this.pos.y + 2.5;
      if (d < 0.3) { this.state = 'stopped'; this.t = 0; }
    } else if (this.state === 'stopped') {
      this.door.position.z = lerp(0.35, -0.95, clamp(this.t / 0.8, 0, 1));
      this.door.position.x = 1.02 + clamp(this.t / 0.3, 0, 1) * 0.1;
      this.crew.forEach((e, i) => {
        if (e.state !== 'boarded' || this.t < 0.9 + i * 0.55) return;
        const p = this.local({ x: 1.8, z: 0.3 });
        e.pos.set(p.x, g.world.floorAt(p.x, p.z), p.z);
        e.state = e.aware >= 1 ? 'combat' : 'advance'; e.crouchT = 0;
        e.goal = [p.x + (Math.random() - 0.5) * 30, SITE_WALL_Z - 6 - Math.random() * 20];
        if (i === 0) this.m.call(e, 'land', true);
      });
    }
    this.headMat.emissiveIntensity = g.env.nightK > 0.4 ? 8 : 0;
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, 0);
    this.engine?.update(this.pos, this.state === 'drive' ? Math.min(1, this.speed / 14) : 0.15);
    if (this.state === 'stopped' && this.t > 15 && this.engine) { this.engine.stop(); this.engine = null; }
  }
  dispose() { this.m.g.scene.remove(this.group); this.engine?.stop(); this.m.g.world.col.remove(this.col); }
}

// ---------------- dalga/görev kurucuları ----------------
export function pickKind(r, wave) {
  const u = r();
  if (u < 0.28) return 'smg';
  if (u < 0.88 - Math.min(0.2, wave * 0.02)) return 'ar';
  return 'dmr';
}

export function spawnBoatTeam(mgr, n, wave) {
  const landX = -70 + Math.random() * 150;
  const boat = new Boat(mgr, landX + (Math.random() - 0.5) * 200, landX);
  mgr.vehicles.push(boat);
  for (let i = 0; i < n; i++) {
    const off = { x: (i % 2 ? 0.5 : -0.5), z: 1.8 - Math.floor(i / 2) * 1.3, yaw: 0 };
    const e = mgr.spawn(pickKind(Math.random, wave), boat.local(off), { state: 'boarded', boat, boatOff: off, crouch: 1 });
    boat.crew.push(e);
  }
  return boat;
}
export function spawnVanTeam(mgr, n, wave) {
  const stopX = -60 + Math.random() * 130;
  const fromX = Math.random() < 0.5 ? -330 : 330;
  const van = new Van(mgr, fromX, stopX);
  mgr.vehicles.push(van);
  for (let i = 0; i < n; i++) {
    const e = mgr.spawn(pickKind(Math.random, wave), van.local({ x: 0, z: -1 }), { state: 'boarded', boat: van, boatOff: { x: (i % 2 ? 0.45 : -0.45), z: -0.5 - Math.floor(i / 2) * 0.9 }, crouch: 1 });
    van.crew.push(e);
  }
  return van;
}
export function spawnHillTeam(mgr, n, wave) {
  const spots = [diagPoint(250, -12), diagPoint(215, -25), [-148, -40], [140, -120], [148, 10]];
  const s = spots[Math.floor(Math.random() * spots.length)];
  for (let i = 0; i < n; i++) {
    const x = s[0] + (Math.random() - 0.5) * 6, z = s[1] + (Math.random() - 0.5) * 6;
    const p = mgr.g.nav.nearestFree(...mgr.g.nav.toCell(x, z));
    const [cx, cz] = p ? mgr.g.nav.center(...p) : [x, z];
    const e = mgr.spawn(pickKind(Math.random, wave), new THREE.Vector3(cx, groundAt(cx, cz), cz), { state: 'advance', yaw: Math.atan2(-cx, -cz) });
    e.goal = [cx * 0.4 + (Math.random() - 0.5) * 30, cz * 0.4 + (Math.random() - 0.5) * 30];
  }
}
// gizlenmiş düşmanlar: damlar (nişancı) + çalı/duvar arkası
export function spawnHidden(mgr, n, wave, avoid) {
  const g = mgr.g;
  const roofs = roofSpots().sort(() => Math.random() - 0.5);
  let placed = 0;
  const nRoof = Math.min(roofs.length, Math.max(1, Math.round(n * 0.35)));
  for (const r of roofs) {
    if (placed >= nRoof) break;
    if (avoid && Math.hypot(r.x - avoid.x, r.z - avoid.z) < 30) continue;
    const b = r.b;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lz = b.d / 2 - 0.6, lx = (Math.random() - 0.5) * (b.w - 2);
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
    const y = (b.gy ?? groundAt(b.x, b.z)) + b.h + 0.04;
    const e = mgr.spawn(Math.random() < 0.6 ? 'dmr' : 'ar', new THREE.Vector3(x, y, z), { state: 'ambush', roof: b, crouch: 1, yaw: b.rot });
    e.pos.y = y;
    placed++;
  }
  // yer seviyesinde saklananlar (siper noktalarından)
  const cover = g.world.cover.filter((c) => c.low && c.x > -95 && c.x < 100 && c.z > -118 && c.z < 29);
  let tries = 0;
  while (placed < n && tries++ < 200) {
    const c = cover[Math.floor(Math.random() * cover.length)];
    if (c.owner) continue;
    if (avoid && Math.hypot(c.x - avoid.x, c.z - avoid.z) < 25) continue;
    const e = mgr.spawn(pickKind(Math.random, wave), new THREE.Vector3(c.x, c.y, c.z), { state: 'ambush', crouch: 1, yaw: Math.atan2(-c.nx, -c.nz) + Math.PI });
    c.owner = e; e.cover = c;
    placed++;
  }
}
export { EW };
