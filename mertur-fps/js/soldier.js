// ΕΚΑΜ operatörü görünümü: iskeletli model + teçhizat, iki kemikli IK ile tüfek tutuşu, çömelme, ölüm düşüşü
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp } from './util.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// GLB doğrudan; sunucu .glb vermiyorsa base64 metin kopyasından
async function loadSoldierGLTF() {
  const loader = new GLTFLoader();
  const b64Only = document.querySelector('meta[name="mertur-assets"]')?.content === 'b64';
  if (!b64Only) try {
    const r = await fetch('assets/Soldier.glb');
    if (r.ok) {
      const buf = await r.arrayBuffer();
      const m = new Uint8Array(buf, 0, 4);
      if (m[0] === 0x67 && m[1] === 0x6c && m[2] === 0x54 && m[3] === 0x46) return loader.parseAsync(buf, '');
    }
  } catch (e) { /* yedek yola geç */ }
  const txt = await (await fetch('assets/Soldier.glb.b64.txt')).text();
  const bin = atob(txt.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return loader.parseAsync(u8.buffer, '');
}

export async function loadSoldierTemplate(T) {
  const gltf = await loadSoldierGLTF();
  const tpl = gltf.scene;
  tpl.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m.name === 'VanguardBodyMat' || o.name === 'vanguard_Mesh') {
        m.color = new THREE.Color(0.2, 0.23, 0.3);
        m.roughness = 0.85; m.metalness = 0.05;
      } else {
        o.material = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.25, metalness: 0.5 });
      }
    }
  });
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  // teçhizat malzemeleri
  const mats = {
    helmet: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.1 }),
    vest: new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.9 }),
    pouch: new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.92 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.5, metalness: 0.6 }),
    gunPoly: new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.7 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4d8, emissiveIntensity: 0 }),
    flag: new THREE.MeshStandardMaterial({ map: T.flagGR, roughness: 0.8 }),
    ekam: new THREE.MeshStandardMaterial({ map: T.ekam, roughness: 0.8 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }),
    laser: new THREE.MeshBasicMaterial({ color: 0x9dff9d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  // tüfek geometrisi (yerel: dipçik 0, namlu +z) — tek ağ + mercek
  const rifleCache = {};
  const rifle = (kind) => {
    if (!rifleCache[kind]) {
      const parts = [];
      const b = (w, h, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
      const L = kind === 'smg' ? 0.55 : kind === 'dmr' ? 1.02 : 0.84;
      b(0.045, 0.09, 0.2, 0, -0.02, 0.1);
      b(0.05, 0.07, L * 0.38, 0, 0.0, 0.2 + L * 0.19);
      b(0.055, 0.06, L * 0.3, 0, 0.0, 0.2 + L * 0.38 + L * 0.15);
      parts.push(new THREE.CylinderGeometry(0.011, 0.011, L * 0.3, 6).rotateX(Math.PI / 2).translate(0, 0.005, 0.2 + L * 0.68 + L * 0.15));
      b(0.03, 0.14, 0.06, 0, -0.1, 0.2 + L * 0.3);
      b(0.03, 0.09, 0.04, 0, -0.07, 0.22);
      if (kind === 'dmr') parts.push(new THREE.CylinderGeometry(0.02, 0.022, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0.075, 0.42));
      else b(0.035, 0.05, 0.07, 0, 0.06, 0.36);
      parts.push(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 8).rotateX(Math.PI / 2).translate(0.035, -0.01, 0.2 + L * 0.5));
      rifleCache[kind] = { geo: mergeGeometries(parts.map((g) => g.toNonIndexed())), L };
    }
    const { geo, L } = rifleCache[kind];
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, mats.gun); body.castShadow = true; g.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), mats.lens);
    lens.position.set(0.035, -0.01, 0.2 + L * 0.5 + 0.046); g.add(lens);
    g.userData = { muzzle: new THREE.Vector3(0, 0.005, 0.2 + L * 0.98), grip: new THREE.Vector3(0, -0.07, 0.24), fore: new THREE.Vector3(0, -0.035, 0.2 + Math.min(0.25, L * 0.3)), light: new THREE.Vector3(0.035, -0.01, 0.2 + L * 0.5 + 0.05) };
    return g;
  };
  // yelek (tek geometri)
  const vparts = [];
  const vb = (w, h, d, x, y, z) => vparts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  vb(0.34, 0.3, 0.07, 0, 0.02, 0.12);
  vb(0.34, 0.32, 0.06, 0, 0.02, -0.12);
  for (const x of [-0.1, 0, 0.1]) vb(0.075, 0.12, 0.05, x, -0.05, 0.17);
  vb(0.2, 0.08, 0.04, 0, 0.12, 0.165);
  vb(0.06, 0.22, 0.2, 0.17, 0.0, 0.0); vb(0.06, 0.22, 0.2, -0.17, 0.0, 0.0);
  const vestGeo = mergeGeometries(vparts);
  const helmetGeo = mergeGeometries([
    new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.0, 0.95, 1.1).toNonIndexed(),
    new THREE.BoxGeometry(0.06, 0.035, 0.05).translate(0, 0.085, 0.115).toNonIndexed(),
    new THREE.BoxGeometry(0.012, 0.03, 0.12).translate(0.14, 0.02, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.012, 0.03, 0.12).translate(-0.14, 0.02, 0).toNonIndexed(),
  ]);
  const geo = {
    helmet: helmetGeo, vest: vestGeo,
    beam: new THREE.ConeGeometry(2.4, 14, 16, 1, true).translate(0, -7, 0).rotateX(-Math.PI / 2),
    laser: new THREE.CylinderGeometry(0.004, 0.004, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2),
  };
  return { tpl, clips, mats, rifle, geo };
}

export class SoldierView {
  constructor(S, scene, kind) {
    this.S = S;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(S.tpl);
    this.model.rotation.y = Math.PI; // model -z'ye bakıyor; kök yaw=0 → +z
    this.root.add(this.model);
    scene.add(this.root);
    this.b = {};
    this.model.traverse((o) => { if (o.isBone) this.b[o.name.replace('mixamorig', '').replace(':', '')] = o; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const n of ['Idle', 'Walk', 'Run']) {
      const a = this.mixer.clipAction(S.clips[n]);
      a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0);
      a.time = Math.random() * S.clips[n].duration;
      this.act[n] = a;
    }
    this.w = { Idle: 1, Walk: 0, Run: 0 };
    this.rifle = S.rifle(kind);
    scene.add(this.rifle);
    // teçhizat: kask, yelek, arma
    const cm = (o, bone, pos, rot = [0, 0, 0], sc = 1) => {
      const g = new THREE.Group(); g.scale.setScalar(100); // kemikler santimetre ölçeğinde
      o.position.set(...pos); o.rotation.set(...rot); o.scale.multiplyScalar(sc);
      g.add(o); bone.add(g); return o;
    };
    const helmet = new THREE.Mesh(S.geo.helmet, S.mats.helmet);
    helmet.castShadow = true;
    cm(helmet, this.b.Head, [0, 0.105, 0.005]);
    const vest = new THREE.Group();
    const vm = new THREE.Mesh(S.geo.vest, S.mats.vest); vm.castShadow = true; vest.add(vm);
    const ek = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), S.mats.ekam);
    ek.position.set(0, 0.1, -0.152); ek.rotation.y = Math.PI; vest.add(ek);
    cm(vest, this.b.Spine2, [0, 0.02, 0]);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.05), S.mats.flag);
    cm(flag, this.b.LeftArm, [-0.055, 0.1, 0], [0, -Math.PI / 2, Math.PI / 2]);
    // ışık hüzmesi + IR lazer
    this.beam = new THREE.Mesh(S.geo.beam, S.mats.beam.clone());
    this.beam.visible = false;
    this.rifle.add(this.beam);
    this.beam.position.copy(this.rifle.userData.light);
    this.laser = new THREE.Mesh(S.geo.laser, S.mats.laser.clone());
    this.laser.visible = false;
    this.laser.position.copy(this.rifle.userData.light).add(new THREE.Vector3(-0.03, 0.03, 0));
    this.laser.scale.set(1, 1, 60);
    this.rifle.add(this.laser);
    this.lensMat = S.mats.lens.clone();
    this.rifle.traverse((o) => { if (o.material === S.mats.lens) o.material = this.lensMat; });

    this.crouch = 0;
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.aimBlend = 0;
    this.dead = false; this.deathT = 0; this.fallDir = new THREE.Vector3(1, 0, 0);
    this.hitJolt = 0;
    this.hb = { head: new THREE.Vector3(), neck: new THREE.Vector3(), chest: new THREE.Vector3(), hips: new THREE.Vector3(), la: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], ra: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], ll: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], rl: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
    this.visible = true;
  }

  dispose(scene) {
    scene.remove(this.root); scene.remove(this.rifle);
    this.mixer.stopAllAction();
  }

  // dünyaya yerleştirme + animasyon + IK
  update(dt, pos, yaw, speed, aimTarget, aiming, t, lod = 0) {
    this.root.position.copy(pos);
    if (this.dead) { this.updateDeath(dt); return; }
    this.root.rotation.set(0, yaw, 0);
    // animasyon ağırlıkları
    const tw = speed < 0.15 ? { Idle: 1, Walk: 0, Run: 0 } : speed < 2.6 ? { Idle: 0, Walk: 1, Run: 0 } : { Idle: 0, Walk: 0, Run: 1 };
    for (const n of ['Idle', 'Walk', 'Run']) {
      this.w[n] = lerp(this.w[n], tw[n], 1 - Math.exp(-dt * 8));
      this.act[n].setEffectiveWeight(this.w[n]);
    }
    this.act.Walk.timeScale = clamp(speed / 1.45, 0.5, 1.6);
    this.act.Run.timeScale = clamp(speed / 4.6, 0.7, 1.4);
    if (lod > 1 && Math.random() < 0.5) return; // uzakta seyrek güncelleme
    this.mixer.update(dt);
    const b = this.b;
    // çömelme: kalçayı indir, bacaklar IK ile yere bassın
    const hipsDrop = this.crouch * 42 + this.hitJolt * 6;
    b.Hips.position.z -= hipsDrop; // Character düğümünde yukarı ekseni +z
    this.root.updateMatrixWorld(true);
    // yere basan ayaklar
    if (this.crouch > 0.02) {
      for (const s of ['Left', 'Right']) {
        const foot = b[s + 'Foot'];
        const fp = foot.getWorldPosition(_v4);
        fp.y = Math.max(fp.y - hipsDrop * 0.0015, pos.y + 0.09);
        const fwd = _v3.set(Math.sin(yaw), 0, Math.cos(yaw));
        const knee = _v2.copy(b[s + 'Leg'].getWorldPosition(new THREE.Vector3())).addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, 0.1, 0));
        solveIK(b[s + 'UpLeg'], b[s + 'Leg'], foot, fp.clone(), knee);
      }
    }
    // gövdeyi nişana döndür
    this.aimBlend = lerp(this.aimBlend, aiming ? 1 : 0, 1 - Math.exp(-dt * 6));
    const chest = b.Spine2.getWorldPosition(_v1);
    const desired = _v2.copy(aimTarget).sub(chest).normalize();
    const bodyF = _v3.set(Math.sin(yaw), 0, Math.cos(yaw));
    const low = _v4.copy(bodyF).multiplyScalar(0.8).add(new THREE.Vector3(0, -0.55, 0)).normalize();
    this.aimDir.copy(low).lerp(desired, this.aimBlend).normalize();
    // omurga bükümü (yaw + pitch) üç kemiğe paylaştır
    const flat = new THREE.Vector3(this.aimDir.x, 0, this.aimDir.z).normalize();
    let dyaw = Math.atan2(flat.x, flat.z) - yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    dyaw = clamp(dyaw, -1.1, 1.1) - 0.38 * this.aimBlend; // omuz duruşu: sol omuz öne
    const pitch = Math.asin(clamp(this.aimDir.y, -1, 1)) * this.aimBlend;
    const right = new THREE.Vector3(Math.cos(yaw + dyaw), 0, -Math.sin(yaw + dyaw));
    for (const n of ['Spine', 'Spine1', 'Spine2']) {
      _q1.setFromAxisAngle(UP, dyaw / 3);
      _q2.setFromAxisAngle(right, -pitch / 3.2);
      _q1.multiply(_q2);
      rotateWorld(b[n], _q1);
    }
    if (this.hitJolt > 0) { rotateWorld(b.Spine1, _q3.setFromAxisAngle(right, this.hitJolt * 0.5)); this.hitJolt = Math.max(0, this.hitJolt - dt * 4); }
    // tüfek: dipçik sağ omuzda
    const sh = b.RightArm.getWorldPosition(new THREE.Vector3());
    const rightV = new THREE.Vector3().crossVectors(this.aimDir, UP).normalize();
    const butt = sh.clone().addScaledVector(rightV, -0.1).addScaledVector(this.aimDir, 0.02).add(new THREE.Vector3(0, -0.03, 0));
    this.rifle.position.copy(butt);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), this.aimDir.clone().negate(), UP);
    this.rifle.quaternion.setFromRotationMatrix(m);
    this.rifle.updateMatrixWorld(true);
    // kollar IK
    const grip = this.rifle.localToWorld(this.rifle.userData.grip.clone());
    const fore = this.rifle.localToWorld(this.rifle.userData.fore.clone());
    const down = new THREE.Vector3(0, -1, 0);
    solveIK(b.RightArm, b.RightForeArm, b.RightHand, grip, sh.clone().add(down.clone().multiplyScalar(0.5)).addScaledVector(rightV, 0.4).addScaledVector(this.aimDir, -0.2));
    const lsh = b.LeftArm.getWorldPosition(new THREE.Vector3());
    solveIK(b.LeftArm, b.LeftForeArm, b.LeftHand, fore, lsh.clone().add(down.clone().multiplyScalar(0.6)).addScaledVector(rightV, -0.2));
    // eller tüfeğe hizalı
    alignHand(b.RightHand, this.aimDir, rightV, 1);
    alignHand(b.LeftHand, this.aimDir, rightV, -1);
    // baş hedefe baksın
    rotateWorld(b.Head, _q1.setFromAxisAngle(right, -pitch * 0.25));
    this.root.updateMatrixWorld(true);
    this.updateHitboxes();
  }

  updateHitboxes() {
    const b = this.b, h = this.hb;
    b.Head.getWorldPosition(h.head); h.head.y += 0.09;
    b.Neck.getWorldPosition(h.neck);
    b.Spine2.getWorldPosition(h.chest);
    b.Hips.getWorldPosition(h.hips);
    b.LeftArm.getWorldPosition(h.la[0]); b.LeftForeArm.getWorldPosition(h.la[1]); b.LeftHand.getWorldPosition(h.la[2]);
    b.RightArm.getWorldPosition(h.ra[0]); b.RightForeArm.getWorldPosition(h.ra[1]); b.RightHand.getWorldPosition(h.ra[2]);
    b.LeftUpLeg.getWorldPosition(h.ll[0]); b.LeftLeg.getWorldPosition(h.ll[1]); b.LeftFoot.getWorldPosition(h.ll[2]);
    b.RightUpLeg.getWorldPosition(h.rl[0]); b.RightLeg.getWorldPosition(h.rl[1]); b.RightFoot.getWorldPosition(h.rl[2]);
  }

  muzzleWorld(out = new THREE.Vector3()) { return this.rifle.localToWorld(out.copy(this.rifle.userData.muzzle)); }

  die(dir) {
    this.dead = true; this.deathT = 0;
    this.fallDir.copy(dir).setY(0).normalize();
    if (this.fallDir.lengthSq() < 0.01) this.fallDir.set(1, 0, 0);
    this.startQuat = this.root.quaternion.clone();
    this.startY = this.root.position.y;
    this.rifleV = new THREE.Vector3(dir.x * 1.5, 1.5, dir.z * 1.5);
    this.rifleW = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6);
    this.beam.visible = false; this.laser.visible = false; this.lensMat.emissiveIntensity = 0;
    this.deathSide = Math.random() < 0.5 ? -1 : 1;
  }
  updateDeath(dt) {
    if (this.deathT > 3) return;
    this.deathT += dt;
    const k = clamp(this.deathT / 0.75, 0, 1);
    const e = k * k * (3 - 2 * k);
    // devrilme: ayak ekseninde düşme yönüne
    const axis = new THREE.Vector3().crossVectors(UP, this.fallDir).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, e * 1.5);
    this.root.quaternion.copy(q).multiply(this.startQuat);
    this.root.position.y = this.startY - e * 0.12;
    this.root.updateMatrixWorld(true);
    // kollar gevşer
    const b = this.b;
    if (k < 1) {
      rotateWorld(b.LeftArm, _q1.setFromAxisAngle(axis, dt * 1.2));
      rotateWorld(b.RightArm, _q1.setFromAxisAngle(axis, dt * 1.0));
      rotateWorld(b.Spine1, _q1.setFromAxisAngle(this.fallDir, dt * 0.3 * this.deathSide));
      rotateWorld(b.LeftLeg, _q1.setFromAxisAngle(axis, -dt * 0.9));
      this.root.updateMatrixWorld(true);
    }
    // tüfek yere düşer
    if (this.rifle.position.y > this.floorY + 0.05) {
      this.rifleV.y -= 9.8 * dt;
      this.rifle.position.addScaledVector(this.rifleV, dt);
      this.rifle.rotation.x += this.rifleW.x * dt; this.rifle.rotation.z += this.rifleW.z * dt;
      if (this.rifle.position.y < this.floorY + 0.05) { this.rifle.position.y = this.floorY + 0.05; this.rifle.rotation.x = Math.PI / 2 * Math.sign(this.rifle.rotation.x || 1) * 0; this.rifle.rotation.z = Math.PI / 2; }
    }
    this.updateHitboxes();
  }

  setLight(on, laserOn) {
    this.beam.visible = on;
    this.beam.material.opacity = on ? 0.045 : 0;
    this.lensMat.emissiveIntensity = on ? 6 : 0;
    this.laser.visible = laserOn;
    this.laser.material.opacity = laserOn ? 0.55 : 0;
  }
}

// Kemiği dünya uzayında döndür
const _pw = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _qq = new THREE.Quaternion();
function rotateWorld(bone, q) {
  _qq.copy(q);
  bone.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_pw);
  bone.getWorldQuaternion(_bw);
  _qq.multiply(_bw);
  bone.quaternion.copy(_pw.invert().multiply(_qq));
  bone.updateMatrixWorld(true);
}

function rotateBoneToward(bone, from, to) {
  const f = from.clone().normalize(), t = to.clone().normalize();
  if (f.lengthSq() < 1e-8 || t.lengthSq() < 1e-8) return;
  const q = new THREE.Quaternion().setFromUnitVectors(f, t);
  rotateWorld(bone, q);
}

// iki kemikli IK (dünya uzayı)
export function solveIK(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const dVec = target.clone().sub(a);
  const d = clamp(dVec.length(), Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999);
  const n = dVec.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const along = l1 * cosA, h = l1 * Math.sqrt(1 - cosA * cosA);
  const pv = pole.clone().sub(a);
  pv.addScaledVector(n, -pv.dot(n));
  if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0);
  pv.normalize();
  const bNew = a.clone().addScaledVector(n, along).addScaledVector(pv, h);
  rotateBoneToward(upper, b.clone().sub(a), bNew.clone().sub(a));
  const b2 = lower.getWorldPosition(new THREE.Vector3());
  const c2 = end.getWorldPosition(new THREE.Vector3());
  const tgt = a.clone().addScaledVector(n, d);
  rotateBoneToward(lower, c2.clone().sub(b2), tgt.sub(b2));
}

function alignHand(hand, fwd, right, side) {
  // el kemiğinin Y ekseni (parmaklara doğru) namlu yönüne yakın olsun
  hand.updateWorldMatrix(true, false);
  const m = hand.matrixWorld.elements;
  const y = new THREE.Vector3(m[4], m[5], m[6]).normalize();
  const want = fwd.clone().multiplyScalar(0.55).addScaledVector(right, -0.45 * side).add(new THREE.Vector3(0, -0.35, 0)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(y, want);
  const s = new THREE.Quaternion().slerp(q, 0.8);
  rotateWorld(hand, s);
}
