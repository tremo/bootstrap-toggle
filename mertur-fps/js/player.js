// Oyuncu: hareket, çömelme, eğilme, koşu/dayanıklılık, su, sağlık, geri tepme, kamera
import * as THREE from 'three';
import { clamp, lerp, DEG } from './util.js';
import { PLAY_BOUNDS } from './layout.js';
import { groundAt } from './terrain.js';

const R = 0.32;

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.recoilP = 0; this.recoilY = 0; this.recoilPv = 0;
    this.reset(new THREE.Vector3(-20, 0, 18), Math.PI);
  }
  reset(p, yaw = 0) {
    this.pos.copy(p);
    this.pos.y = this.g.world.floorAt(p.x, p.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.crouch = 0; this.crouchTarget = 0; this.lean = 0;
    this.health = 100; this.stamina = 100; this.bandages = 3; this.bandaging = 0;
    this.dead = false; this.deathT = 0;
    this.onGround = true; this.hSpeed = 0; this.sprinting = false; this.sprintBlend = 0;
    this.lastHit = -100; this.stepAcc = 0; this.fallStart = this.pos.y;
    this.suppression = 0; this.flinch = 0; this.flash = 0;
    this.underwater = false; this.inWater = 0;
    this.recoilP = this.recoilY = 0;
    this.shake = 0;
    this.eye.copy(this.pos).y += 1.64;
    this.holdBreath = 0; this.breathCool = 0;
    this.kills = 0; this.headshots = 0;
  }

  addRecoil(p, y) { this.recoilPv += p * DEG * 14; this.recoilY += y * DEG; }
  suppress(k) { this.suppression = Math.min(1, this.suppression + k * 0.5); }

  update(dt, input, cam) {
    const g = this.g, W = g.world, col = W.col;
    const diff = g.diff;
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 1.2);
      const eyeH = lerp(1.64 - this.crouch * 0.6, 0.25, k * k);
      this.eye.set(this.pos.x, this.pos.y + eyeH, this.pos.z);
      cam.position.copy(this.eye);
      cam.rotation.set(this.pitch * (1 - k) - k * 0.2, this.yaw, k * 0.9, 'YXZ');
      return;
    }
    // bakış
    const sens = 0.0021 * input.sens * (g.weapons.ads > 0.5 ? 1 / Math.pow(g.weapons.w.def.adsZoom, 0.8) : 1);
    this.yaw -= input.mouse.dx * sens;
    this.pitch = clamp(this.pitch - input.mouse.dy * sens, -1.5, 1.5);
    // geri tepme yayı
    this.recoilPv -= this.recoilPv * Math.min(1, dt * 18);
    this.recoilP += this.recoilPv * dt;
    const rec = Math.min(1, dt * 6);
    const back = this.recoilP * rec, backY = this.recoilY * rec;
    this.recoilP -= back; this.recoilY -= backY;
    // geri tepmenin ~%60'ı kalıcı (oyuncu telafi etmeli)
    this.pitch = clamp(this.pitch + back * 0.6, -1.5, 1.5);
    this.yaw += backY * 0.6;

    // duruş
    if (input.hit('KeyC') || input.hit('ControlLeft')) this.crouchTarget = this.crouchTarget ? 0 : 1;
    if (input.down('ControlLeft') && !input.hit('ControlLeft')) { /* basılı tut */ }
    if (this.crouchTarget === 0 && this.crouch > 0.5) {
      // ayağa kalkarken kafa engeli
      if (col.insideSolid(this.pos.x, this.pos.z, this.pos.y + 1.75, R * 0.8)) this.crouchTarget = 1;
    }
    this.crouch = clamp(this.crouch + (this.crouchTarget ? dt : -dt) * 5, 0, 1);
    const leanT = input.down('KeyQ') ? -1 : input.down('KeyE') ? 1 : 0;
    this.lean = lerp(this.lean, leanT, 1 - Math.exp(-dt * 10));

    // hareket girdisi
    let mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    mx += input.touch.mx; mz += input.touch.my;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wantSprint = (input.down('ShiftLeft') || input.down('ShiftRight') || (input.touch.active && input.touch.my < -0.95)) && mz < -0.3 && this.stamina > 5 && this.crouch < 0.5 && g.weapons.ads < 0.3;
    this.sprinting = wantSprint && ml > 0.1 && this.inWater < 0.6;
    this.sprintBlend = lerp(this.sprintBlend, this.sprinting ? 1 : 0, 1 - Math.exp(-dt * 8));
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 16);
    else this.stamina = Math.min(100, this.stamina + dt * (this.hSpeed < 0.5 ? 16 : 10));

    const wdef = g.weapons.w.def;
    let speed = this.sprinting ? 6.1 : 3.5;
    speed = lerp(speed, 1.75, this.crouch);
    speed *= lerp(1, 0.55, g.weapons.ads) * wdef.speed;
    if (this.bandaging > 0) speed *= 0.5;
    speed *= lerp(1, 0.45, clamp(this.inWater, 0, 1));
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = (mx * cs + mz * sn) * speed, wz = (-mx * sn + mz * cs) * speed;
    const accel = this.onGround ? 14 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, wx, k);
    this.vel.z = lerp(this.vel.z, wz, k);
    // zıplama
    if (input.hit('Space') && this.onGround && this.crouch < 0.5 && this.stamina > 8) {
      this.vel.y = 4.3; this.onGround = false; this.stamina -= 8;
    }
    this.vel.y -= 9.81 * dt;

    // yatay hareket + çarpışma (eksen bazlı, basamak ve duvar denetimi)
    const feet = this.pos.y;
    const height = lerp(1.8, 1.2, this.crouch);
    const tryMove = (dx, dz) => {
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      if (nx < PLAY_BOUNDS.x0 || nx > PLAY_BOUNDS.x1 || nz < PLAY_BOUNDS.z0 || nz > PLAY_BOUNDS.z1) return false;
      const fl = W.floorAt(nx, nz);
      if (fl > feet + 0.5) return false; // yar/ havuz kenarı
      if (fl < -1.35) return false; // derin su
      const slope = Math.abs(groundAt(nx, nz) - groundAt(this.pos.x, this.pos.z)) / Math.max(1e-3, Math.hypot(dx, dz));
      if (slope > 1.2 && fl > feet) return false;
      this.pos.x = nx; this.pos.z = nz;
      return true;
    };
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (!tryMove(dx, dz)) { if (!tryMove(dx, 0)) this.vel.x = 0; if (!tryMove(0, dz)) this.vel.z = 0; }
    col.pushCircle(this.pos, R, feet, feet + height, 0.42);
    // dikey
    this.pos.y += this.vel.y * dt;
    const floor = W.floorAt(this.pos.x, this.pos.z);
    const top = this.supportTop(this.pos.x, this.pos.z, feet);
    const ground = Math.max(floor, top);
    if (this.pos.y <= ground) {
      if (!this.onGround) {
        const fall = this.fallStart - ground;
        if (fall > 3.2) this.damage((fall - 3.2) * 18, null, 'fall');
        if (this.vel.y < -3) this.g.audio.step(this.surface(), null, 0.6);
      }
      this.pos.y = this.pos.y < ground - 0.5 ? ground : lerp(this.pos.y, ground, Math.min(1, dt * 18)) + (ground - this.pos.y) * 0.0;
      if (this.pos.y < ground) this.pos.y = ground;
      this.vel.y = Math.max(0, this.vel.y);
      this.onGround = true;
      this.fallStart = this.pos.y;
    } else if (this.pos.y > ground + 0.08) {
      if (this.onGround) this.fallStart = this.pos.y;
      this.onGround = this.pos.y - ground < 0.12 && this.vel.y <= 0;
      if (this.onGround) this.pos.y = ground;
    }
    this.fallStart = Math.max(this.fallStart, this.pos.y);
    this.hSpeed = Math.hypot(this.vel.x, this.vel.z);

    // su
    const waterY = W.waterAt(this.pos.x, this.pos.z);
    const depth = waterY - this.pos.y;
    this.inWater = clamp(depth / 1.1, 0, 1);
    // ayak sesleri
    if (this.onGround && this.hSpeed > 0.6) {
      this.stepAcc += this.hSpeed * dt;
      const stride = this.sprinting ? 1.25 : this.crouch > 0.5 ? 0.6 : 0.85;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const s = depth > 0.05 ? 'water' : this.surface();
        this.g.audio.step(s, null, this.crouch > 0.5 ? 0.15 : this.sprinting ? 0.5 : 0.32);
        this.g.noise(this.pos, this.sprinting ? 22 : this.crouch > 0.5 ? 4 : 10);
      }
    }
    // kamera
    const eyeH = lerp(1.64, 1.02, this.crouch);
    const bob = this.onGround ? Math.sin(g.weapons.bobT * 2) * 0.03 * Math.min(1, this.hSpeed / 4) * (1 - g.weapons.ads * 0.8) : 0;
    let leanOff = this.lean * 0.38;
    if (Math.abs(this.lean) > 0.05) {
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const h = col.raycast(this.pos.x, this.pos.y + eyeH, this.pos.z, rx * Math.sign(leanOff), 0, rz * Math.sign(leanOff), Math.abs(leanOff) + 0.2, { terrain: false, water: false });
      if (h.hit) leanOff = Math.sign(leanOff) * Math.max(0, h.t - 0.2);
    }
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.eye.set(this.pos.x + rx * leanOff, this.pos.y + eyeH + bob - Math.abs(this.lean) * 0.06, this.pos.z + rz * leanOff);
    // sarsıntı
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    const sh = this.shake * this.shake;
    const t = g.time;
    // nefes/sway (keskin nişancıda nefes tutma)
    let swayAmp = 0;
    const ws = g.weapons;
    if (ws.ads > 0.5) {
      swayAmp = ws.w.def.sway * 0.0028 * (1 + this.suppression * 2) * (this.crouch > 0.5 ? 0.6 : 1) * (1 + Math.min(1, this.hSpeed / 3));
      if (ws.w.def.type === 'sniper') {
        swayAmp *= 2.2;
        const hold = (input.down('ShiftLeft') || input.down('ShiftRight')) && this.breathCool <= 0;
        if (hold) { this.holdBreath += dt; if (this.holdBreath > 5) { this.breathCool = 3; this.holdBreath = 0; } swayAmp *= this.holdBreath < 4 ? 0.12 : 1.8; }
        else { this.holdBreath = Math.max(0, this.holdBreath - dt * 2); }
      }
    }
    this.breathCool = Math.max(0, this.breathCool - dt);
    const swX = (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.25) * swayAmp;
    const swY = (Math.sin(t * 1.1 + 1) * 0.5 + Math.cos(t * 2.3) * 0.2) * swayAmp;
    cam.position.copy(this.eye);
    cam.position.x += (Math.random() - 0.5) * sh * 0.08; cam.position.y += (Math.random() - 0.5) * sh * 0.08;
    cam.rotation.set(this.pitch + this.recoilP + swY + (Math.random() - 0.5) * sh * 0.04 + this.flinch * 0.03, this.yaw + this.recoilY + swX, -this.lean * 0.14, 'YXZ');

    // sargı
    if (input.hit('KeyH') && this.bandages > 0 && this.bandaging <= 0 && this.health < 100) { this.bandaging = 3.0; this.bandages--; this.g.audio.click(700, 0.3); }
    if (this.bandaging > 0) {
      this.bandaging -= dt;
      this.health = Math.min(100, this.health + dt * 14);
    }
    // doğal iyileşme
    const regen = { easy: [4, 14, 100], normal: [7, 7, 100], real: [0, 0, 0] }[diff];
    if (regen[1] > 0 && t - this.lastHit > regen[0] && this.health < regen[2]) this.health = Math.min(regen[2], this.health + regen[1] * dt);
    // su altı
    const eyeWater = W.waterAt(this.eye.x, this.eye.z);
    const under = this.eye.y < eyeWater - 0.02 && (!!W.inPool(this.eye.x, this.eye.z) || groundAt(this.eye.x, this.eye.z) < eyeWater);
    if (under !== this.underwater) { this.underwater = under; this.g.audio.underwater(under); }
  }

  supportTop(x, z, feetY) {
    const col = this.g.world.col;
    let best = -Infinity;
    for (const c of col.query(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) {
      if (!c.solid || c.y1 > feetY + 0.45) continue;
      if (c.type === 'cyl') { if (Math.hypot(x - c.cx, z - c.cz) < c.r + 0.1) best = Math.max(best, c.y1); continue; }
      const rx = x - c.cx, rz = z - c.cz;
      const lx = rx * c.cos - rz * c.sin, lz = rx * c.sin + rz * c.cos;
      if (Math.abs(lx) < c.hw + 0.12 && Math.abs(lz) < c.hd + 0.12) best = Math.max(best, c.y1);
    }
    return best;
  }

  surface() {
    const W = this.g.world;
    if (W.inPool(this.pos.x, this.pos.z)) return 'water';
    return this.g.surfaceAt(this.pos);
  }

  damage(amount, from, part) {
    if (this.dead || this.g.godMode) return;
    const mul = { easy: 0.5, normal: 0.85, real: 1.35 }[this.g.diff];
    const dmg = amount * (part === 'fall' || part === 'blast' ? 1 : mul) * (part === 'head' ? 1.6 : 1);
    this.health -= dmg;
    this.lastHit = this.g.time;
    this.flinch = 1; this.shake = Math.min(1.2, this.shake + dmg / 40);
    this.bandaging = 0;
    this.g.audio.hurt();
    this.g.hud.damage(from, dmg);
    if (this.health <= 0) { this.health = 0; this.dead = true; this.deathT = 0; this.g.onPlayerDeath(); }
  }

  // Oyuncu isabet kutusu (gövde kapsülü + kafa küresi)
  raycast(o, d, maxT) {
    const eyeH = lerp(1.64, 1.02, this.crouch);
    const head = new THREE.Vector3(this.eye.x, this.pos.y + eyeH + 0.05, this.eye.z);
    let best = null;
    const hs = raySphere(o, d, head, 0.14);
    if (hs !== null && hs <= maxT) best = { t: hs, part: 'head' };
    const top = this.pos.y + eyeH - 0.2;
    const bt = rayCapsule(o, d, new THREE.Vector3(this.pos.x, this.pos.y + 0.25, this.pos.z), new THREE.Vector3(this.eye.x, top, this.eye.z), 0.28);
    if (bt !== null && bt <= maxT && (!best || bt < best.t)) best = { t: bt, part: 'body' };
    return best;
  }
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}
const _ba = new THREE.Vector3(), _oa = new THREE.Vector3();
export function rayCapsule(o, d, a, b, r) {
  _ba.subVectors(b, a); _oa.subVectors(o, a);
  const baba = _ba.dot(_ba), bard = _ba.dot(d), baoa = _ba.dot(_oa), rdoa = d.dot(_oa), oaoa = _oa.dot(_oa);
  const A = baba - bard * bard;
  let B = baba * rdoa - baoa * bard;
  let C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    // uç küreler
    const oc = y <= 0 ? _oa : _oa.clone().sub(_ba);
    B = d.dot(oc); C = oc.dot(oc) - r * r; h = B * B - C;
    if (h > 0) { const t2 = -B - Math.sqrt(h); if (t2 >= 0) return t2; }
  }
  return null;
}
