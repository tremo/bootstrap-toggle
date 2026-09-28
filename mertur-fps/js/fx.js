// Görsel efektler: parçacıklar, mermi izleri (decal), izli mermi, namlu alevi, patlama
import * as THREE from 'three';

const PVS = `
attribute float size; attribute float alpha; attribute vec3 pcolor; attribute float rot;
varying float vA; varying vec3 vC; varying float vR;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){
  vA = alpha; vC = pcolor; vR = rot;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * uScale / max(0.05, -mvPosition.z);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const PFS = `
uniform sampler2D map; uniform float uAdd;
varying float vA; varying vec3 vC; varying float vR;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(map, p);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.003) discard;
  #include <fog_fragment>
}`;

class ParticleSystem {
  constructor(scene, map, max, additive, lit = false) {
    this.max = max; this.n = 0;
    this.p = []; // {x,y,z,vx,vy,vz,life,t,size,grow,alpha,r,g,b,drag,grav,rot,vrot}
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const vs = PVS.replace('#include <common>', '#include <common>\nuniform float uScale;');
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, uScale: { value: 600 }, uAdd: { value: additive ? 1 : 0 } }]),
      vertexShader: vs, fragmentShader: PFS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = map;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.lit = lit;
    this.light = 1;
  }
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ drag: 0, grav: 0, grow: 0, rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 2, alpha: 1, fade: 1, ...o, t: 0 });
  }
  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      p.size += p.grow * dt;
      p.rot += p.vrot * dt;
      P[w++] = p;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const p = P[i], f = p.t / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size;
      this.alpha[i] = p.alpha * (p.fade === 1 ? (1 - f) * Math.min(1, f * 12 + 0.2) : Math.pow(1 - f, p.fade));
      const L = this.lit ? this.light : 1;
      this.col[i * 3] = p.r * L; this.col[i * 3 + 1] = p.g * L; this.col[i * 3 + 2] = p.b * L;
      this.rot[i] = p.rot;
    }
    this.geo.setDrawRange(0, w);
    for (const a of ['position', 'size', 'alpha', 'pcolor', 'rot']) this.geo.attributes[a].needsUpdate = true;
  }
}

class Decals {
  constructor(scene, map, max, opts = {}) {
    this.max = max; this.i = 0; this.count = 0;
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, metalness: 0, ...opts });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }
  add(x, y, z, nx, ny, nz, size) {
    const n = this._v.set(nx, ny, nz).normalize();
    this._q.setFromUnitVectors(this._z, n);
    this._q2.setFromAxisAngle(this._z, Math.random() * Math.PI * 2);
    this._q.multiply(this._q2);
    this._s.set(size, size, size);
    const p = new THREE.Vector3(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    this._m.compose(p, this._q, this._s);
    this.mesh.setMatrixAt(this.i, this._m);
    this.i = (this.i + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.i = 0; this.count = 0; this.mesh.count = 0; }
}

class Tracers {
  constructor(scene, max = 64) {
    this.max = max; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    const idx = [];
    for (let i = 0; i < max; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Vector3();
  }
  add(tr) { if (this.list.length >= this.max) this.list.shift(); this.list.push(tr); }
  update(cam) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length && n < this.max; i++) {
      const t = L[i];
      if (t.dead) continue;
      const a = this._a.copy(t.tail), b = this._b.copy(t.head);
      const d = this._d.subVectors(b, a);
      if (d.lengthSq() < 1e-6) continue;
      this._c.subVectors(cam, b);
      const side = this._s.crossVectors(d, this._c).normalize().multiplyScalar(t.width || 0.025);
      const k = n * 4;
      this.pos.set([a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z], k * 3);
      const [r, g, bb] = t.color || [1.0, 0.72, 0.35];
      const I = t.intensity || 3;
      this.col.set([r * I, g * I, bb * I, 0, r * I, g * I, bb * I, 0, r * I, g * I, bb * I, 1, r * I, g * I, bb * I, 1], k * 4);
      n++;
    }
    this.list = L.filter((t) => !t.dead);
    this.geo.setDrawRange(0, n * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, T, audio) {
    this.scene = scene; this.audio = audio;
    this.sparks = new ParticleSystem(scene, T.spark, 500, true);
    this.smoke = new ParticleSystem(scene, T.smoke, 500, false, true);
    this.dust = new ParticleSystem(scene, T.smoke, 400, false, true);
    this.blood = new ParticleSystem(scene, T.smoke, 200, false, true);
    this.flashes = new ParticleSystem(scene, T.flash, 60, true);
    this.holes = new Decals(scene, T.hole, 320);
    this.bloods = new Decals(scene, T.blood, 60, { color: 0x7a0a0a });
    this.scorch = new Decals(scene, T.scorch, 30);
    this.tracers = new Tracers(scene);
    // dünya namlu ışıkları
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(l); return { l, t: 0 }; });
    this.li = 0;
    this.shake = 0;
    this.lightLevel = 1;
  }
  setLight(k) { this.lightLevel = k; this.smoke.light = this.dust.light = this.blood.light = 0.15 + k * 0.85; }

  muzzle(pos, dir, big = 1, withLight = true) {
    this.flashes.emit({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 2, vy: dir.y * 2, vz: dir.z * 2, life: 0.05, size: 0.5 * big, r: 1, g: 0.85, b: 0.6, fade: 0.5 });
    this.flashes.emit({ x: pos.x + dir.x * 0.25, y: pos.y + dir.y * 0.25, z: pos.z + dir.z * 0.25, vx: dir.x * 6, vy: dir.y * 6, vz: dir.z * 6, life: 0.04, size: 0.35 * big, r: 1, g: 0.7, b: 0.4, fade: 0.5 });
    for (let i = 0; i < 2; i++) this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 1.5 + rnd(0.3), vy: dir.y * 1.5 + 0.3, vz: dir.z * 1.5 + rnd(0.3), life: 0.9 + Math.random() * 0.6, size: 0.12, grow: 0.9, alpha: 0.18, r: 0.8, g: 0.8, b: 0.8, drag: 2.5 });
    if (withLight) {
      const L = this.lights[this.li++ % this.lights.length];
      L.l.position.copy(pos); L.l.intensity = 25 * big; L.t = 0.05;
    }
  }

  impact(hit, dir, surface) {
    const { x, y, z, nx, ny, nz } = hit;
    const rx = dir.x - 2 * (dir.x * nx + dir.y * ny + dir.z * nz) * nx, ry = dir.y - 2 * (dir.x * nx + dir.y * ny + dir.z * nz) * ny, rz = dir.z - 2 * (dir.x * nx + dir.y * ny + dir.z * nz) * nz;
    const col = { plaster: [0.9, 0.88, 0.84], stone: [0.75, 0.72, 0.66], ground: [0.52, 0.44, 0.33], dirt: [0.52, 0.44, 0.33], grass: [0.45, 0.42, 0.3], sand: [0.72, 0.66, 0.55], wood: [0.5, 0.36, 0.22], metal: [0.5, 0.5, 0.5], glass: [0.8, 0.9, 0.95], plastic: [0.9, 0.9, 0.9], water: [0.9, 0.95, 1.0], asphalt: [0.3, 0.3, 0.3] }[surface] || [0.7, 0.7, 0.7];
    if (surface === 'water') {
      for (let i = 0; i < 16; i++) this.dust.emit({ x, y: y + 0.02, z, vx: rnd(0.8), vy: 2.5 + Math.random() * 3.5, vz: rnd(0.8), life: 0.7, size: 0.1 + Math.random() * 0.08, r: 0.92, g: 0.96, b: 1, grav: 9.8, alpha: 0.8, fade: 1.5 });
      this.dust.emit({ x, y: y + 0.05, z, vx: 0, vy: 0.3, vz: 0, life: 0.6, size: 0.35, grow: 1.2, r: 0.95, g: 0.98, b: 1, alpha: 0.5 });
      this.audio.splash(hit);
      return;
    }
    const n = surface === 'grass' || surface === 'ground' || surface === 'sand' || surface === 'dirt' ? 3 : 2;
    for (let i = 0; i < n; i++) this.dust.emit({ x, y, z, vx: (nx + rx) * 1.2 + rnd(0.6), vy: (ny + ry) * 1.2 + rnd(0.6) + 0.3, vz: (nz + rz) * 1.2 + rnd(0.6), life: 1.0 + Math.random() * 0.8, size: 0.14, grow: 0.8, alpha: 0.55, r: col[0], g: col[1], b: col[2], drag: 3, grav: -0.1 });
    for (let i = 0; i < 6; i++) this.dust.emit({ x, y, z, vx: rx * 3 + nx * 2 + rnd(1.5), vy: ry * 3 + ny * 2 + Math.random() * 2, vz: rz * 3 + nz * 2 + rnd(1.5), life: 0.6, size: 0.025 + Math.random() * 0.02, alpha: 1, r: col[0] * 0.8, g: col[1] * 0.8, b: col[2] * 0.8, grav: 9.8, fade: 0.5 });
    if (surface === 'metal' || surface === 'stone' || Math.random() < 0.25) {
      for (let i = 0; i < (surface === 'metal' ? 8 : 3); i++) this.sparks.emit({ x, y, z, vx: rx * 6 + rnd(3), vy: ry * 6 + rnd(3), vz: rz * 6 + rnd(3), life: 0.18 + Math.random() * 0.2, size: 0.035, r: 1, g: 0.8, b: 0.4, grav: 9.8, fade: 0.7 });
    }
    if (surface !== 'grass' && surface !== 'sand' && surface !== 'ground' && surface !== 'dirt') this.holes.add(x, y, z, nx, ny, nz, surface === 'glass' ? 0.16 : 0.09 + Math.random() * 0.04);
    else this.holes.add(x, y, z, nx, ny, nz, 0.14);
  }

  bloodHit(p, dir) {
    for (let i = 0; i < 6; i++) this.blood.emit({ x: p.x, y: p.y, z: p.z, vx: dir.x * 2 + rnd(1), vy: dir.y * 2 + rnd(1) + 0.4, vz: dir.z * 2 + rnd(1), life: 0.5 + Math.random() * 0.4, size: 0.12 + Math.random() * 0.1, grow: 0.4, alpha: 0.75, r: 0.35, g: 0.02, b: 0.02, drag: 3, grav: 3 });
  }

  explosion(p, groundY, flash = false) {
    this.flashes.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.12, size: flash ? 7 : 5, r: 1, g: flash ? 1 : 0.7, b: flash ? 1 : 0.4, fade: 0.6 });
    const L = this.lights[this.li++ % this.lights.length];
    L.l.position.set(p.x, p.y + 1, p.z); L.l.intensity = flash ? 900 : 500; L.t = flash ? 0.12 : 0.22;
    L.l.distance = 40;
    if (flash) {
      for (let i = 0; i < 10; i++) this.smoke.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: rnd(2), vy: Math.random() * 1.5, vz: rnd(2), life: 3 + Math.random() * 2, size: 0.8, grow: 1.6, alpha: 0.45, r: 0.85, g: 0.85, b: 0.85, drag: 1.5 });
      return;
    }
    for (let i = 0; i < 26; i++) this.smoke.emit({ x: p.x + rnd(0.5), y: p.y + 0.3, z: p.z + rnd(0.5), vx: rnd(4), vy: 1 + Math.random() * 5, vz: rnd(4), life: 3 + Math.random() * 3, size: 1.2, grow: 1.8, alpha: 0.6, r: 0.32, g: 0.3, b: 0.28, drag: 1.6 });
    for (let i = 0; i < 20; i++) this.dust.emit({ x: p.x, y: p.y + 0.2, z: p.z, vx: rnd(12), vy: 4 + Math.random() * 10, vz: rnd(12), life: 1.4, size: 0.05 + Math.random() * 0.05, alpha: 1, r: 0.25, g: 0.22, b: 0.18, grav: 9.8, fade: 0.4, floor: groundY });
    for (let i = 0; i < 30; i++) this.sparks.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: rnd(16), vy: Math.random() * 12, vz: rnd(16), life: 0.3 + Math.random() * 0.4, size: 0.06, r: 1, g: 0.7, b: 0.3, grav: 9.8, fade: 0.7 });
    this.scorch.add(p.x, groundY + 0.02, p.z, 0, 1, 0, 3.2);
  }

  update(dt, cam) {
    for (const L of this.lights) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; else L.l.intensity *= 0.6; }
    this.sparks.update(dt); this.smoke.update(dt); this.dust.update(dt); this.blood.update(dt); this.flashes.update(dt);
    this.tracers.update(cam);
  }
  clear() { this.holes.clear(); this.bloods.clear(); this.scorch.clear(); }
}
const rnd = (s) => (Math.random() - 0.5) * 2 * s;
