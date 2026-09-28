// Geometri toplayıcı + mimari yardımcılar (pencere, kiremit saçak, korkuluk…)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export function mat4(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Batch {
  constructor() { this.lists = new Map(); }
  add(key, geo, matrix, color = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color || color) {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const col = color || [1, 1, 1];
      const old = g.attributes.color;
      for (let i = 0; i < n; i++) {
        const k = old ? old.getX(i) : 1;
        c[i * 3] = col[0] * k; c[i * 3 + 1] = col[1] * (old ? old.getY(i) : 1); c[i * 3 + 2] = col[2] * (old ? old.getZ(i) : 1);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    if (matrix) g.applyMatrix4(matrix);
    let l = this.lists.get(key);
    if (!l) { l = []; this.lists.set(key, l); }
    l.push(g);
  }
  build(materials, parent, opts = {}) {
    const out = {};
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const mat = materials[key];
      if (!mat) { console.warn('malzeme yok', key); continue; }
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.noShadow?.includes(key) ? false : true;
      mesh.receiveShadow = true;
      mesh.name = key;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out[key] = mesh;
    }
    this.lists.clear();
    return out;
  }
}

// Dünya ölçekli UV'li kutu; ao: alt köşeleri koyulaştır
export function boxGeo(w, h, d, uvScale = 1, ao = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / uvScale, uv.getY(i) * dims[f][1] / uvScale);
  }
  if (ao > 0) {
    const pos = g.attributes.position, n = pos.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = pos.getY(i) < 0 ? 1 - ao : 1;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  return g;
}

// Yerel çerçeve: bina/eleman yerleştirme
export class Frame {
  constructor(batch, x, y, z, rot = 0) {
    this.b = batch; this.m = mat4(x, y, z, rot); this.x = x; this.y = y; this.z = z; this.rot = rot;
    this.cos = Math.cos(rot); this.sin = Math.sin(rot);
  }
  add(key, geo, lx, ly, lz, ry = 0, rx = 0, rz = 0, color = null, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().multiplyMatrices(this.m, mat4(lx, ly, lz, ry, rx, rz, sx, sy, sz));
    this.b.add(key, geo, m, color);
  }
  box(key, w, h, d, lx, ly, lz, ry = 0, uvScale = 1, ao = 0, rx = 0, rz = 0, color = null) {
    this.add(key, boxGeo(w, h, d, uvScale, ao), lx, ly, lz, ry, rx, rz, color);
  }
  world(lx, lz) { return [this.x + lx * this.cos + lz * this.sin, this.z - lx * this.sin + lz * this.cos]; }
  sub(lx, ly, lz, ry = 0) {
    const f = new Frame(this.b, 0, 0, 0, 0);
    f.m = new THREE.Matrix4().multiplyMatrices(this.m, mat4(lx, ly, lz, ry));
    const [wx, wz] = this.world(lx, lz);
    f.x = wx; f.z = wz; f.y = this.y + ly; f.rot = this.rot + ry; f.cos = Math.cos(f.rot); f.sin = Math.sin(f.rot);
    return f;
  }
}

// Cephe konumu: face ∈ front/back/left/right, u: cepheye dışarıdan bakana göre yatay, y: yükseklik
export function facade(F, face, w, d, u, y, out = 0.0) {
  switch (face) {
    case 'front': return F.sub(u, y, d / 2 + out, 0);
    case 'back': return F.sub(-u, y, -d / 2 - out, Math.PI);
    case 'right': return F.sub(w / 2 + out, y, -u, Math.PI / 2);
    default: return F.sub(-w / 2 - out, y, u, -Math.PI / 2);
  }
}

export function archShape(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}
function archPath(w, h) {
  const p = new THREE.Path();
  const r = w / 2;
  p.moveTo(-r, 0); p.lineTo(-r, h - r);
  p.absarc(0, h - r, r, Math.PI, 0, true);
  p.lineTo(r, 0); p.lineTo(-r, 0);
  return p;
}
const geoCache = new Map();
function cached(key, fn) { let g = geoCache.get(key); if (!g) { g = fn(); geoCache.set(key, g); } return g; }

// Pencere/kapı (yerel: +z dışarı, x merkez, y alt kenar)
export function windowAt(F, w, h, opts = {}) {
  const { arch = false, door = false, shutters = false, lit = false, sill = true, frameKey = 'frame', mullion = true } = opts;
  const fw = 0.09;
  const glassKey = door ? 'door' : (lit ? 'glassLit' : 'glass');
  if (arch) {
    const g = cached(`ag${w}_${h}`, () => new THREE.ShapeGeometry(archShape(w, h), 12));
    F.add(glassKey, g, 0, 0, 0.02);
    const ring = cached(`ar${w}_${h}`, () => {
      const s = archShape(w + fw * 2, h + fw);
      s.holes.push(archPath(w, h));
      return new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false, curveSegments: 12 });
    });
    F.add(frameKey, ring, 0, 0, 0.0);
    // derinlik izi (pervaz)
    F.box('plaster', w + 0.5, 0.08, 0.14, 0, -0.04, 0.05, 0, 1);
    if (door && h > 1.6) F.box(frameKey, 0.05, h - w / 2, 0.06, 0, (h - w / 2) / 2, 0.06);
    return;
  }
  F.add(glassKey, cached(`pg${w}_${h}`, () => new THREE.PlaneGeometry(w, h)), 0, h / 2, 0.025);
  F.box(frameKey, w + fw * 2, fw, 0.1, 0, h + fw / 2, 0.03);
  F.box(frameKey, w + fw * 2, fw, 0.1, 0, -fw / 2 + (door ? fw : 0), 0.03);
  F.box(frameKey, fw, h, 0.1, -w / 2 - fw / 2, h / 2, 0.03);
  F.box(frameKey, fw, h, 0.1, w / 2 + fw / 2, h / 2, 0.03);
  if (!door && mullion && w > 0.7) F.box(frameKey, 0.05, h, 0.06, 0, h / 2, 0.04);
  if (!door && mullion && h > 1.0) F.box(frameKey, w, 0.05, 0.06, 0, h * 0.62, 0.04);
  if (door) { F.box(frameKey, 0.05, h * 0.9, 0.05, w * 0.3, h * 0.45, 0.05); F.box('chrome', 0.03, 0.03, 0.14, w * 0.36, 1.0, 0.1); }
  if (sill && !door) F.box('plaster', w + 0.28, 0.07, 0.2, 0, -0.035, 0.08, 0, 1);
  if (shutters) {
    const sw = w / 2;
    for (const s of [-1, 1]) {
      F.box('shutter', sw, h, 0.04, s * (w / 2 + fw + sw / 2 + 0.02), h / 2, 0.05, 0, 0.5);
      for (let k = 0; k < 6; k++) F.box('shutter', sw * 0.9, 0.02, 0.05, s * (w / 2 + fw + sw / 2 + 0.02), h * (0.12 + k * 0.15), 0.08);
    }
  }
}

// Düz dama kiremit saçak (fotoğraftaki kırmızı kiremit bandı)
export function tileSkirt(F, w, d, y, { width = 0.8, angle = 0.42, over = 0.38, sides = [1, 1, 1, 1] } = {}) {
  const t = 0.07;
  const drop = Math.sin(angle) * width;
  const run = Math.cos(angle) * width;
  // kenar: iç üst kenar duvar hizasından (run - over) içeride
  const inset = run - over;
  const cy = y - drop / 2 + 0.02;
  const specs = [
    [0, d / 2 - inset + run / 2, w + over * 2, 0, 0],
    [0, -(d / 2 - inset + run / 2), w + over * 2, Math.PI, 1],
    [w / 2 - inset + run / 2, 0, d + over * 2, Math.PI / 2, 2],
    [-(w / 2 - inset + run / 2), 0, d + over * 2, -Math.PI / 2, 3],
  ];
  for (const [x, z, L, ry, i] of specs) {
    if (!sides[i]) continue;
    const g = boxGeo(L, t, width, 1.3);
    F.add('tile', g, x, cy, z, ry, angle, 0);
  }
}

export function parapet(F, w, d, y, h = 0.42, t = 0.22) {
  F.box('plaster', w, h, t, 0, y + h / 2, d / 2 - t / 2, 0, 1, 0.08);
  F.box('plaster', w, h, t, 0, y + h / 2, -d / 2 + t / 2, 0, 1, 0.08);
  F.box('plaster', t, h, d - t * 2, w / 2 - t / 2, y + h / 2, 0, 0, 1, 0.08);
  F.box('plaster', t, h, d - t * 2, -w / 2 + t / 2, y + h / 2, 0, 0, 1, 0.08);
  F.box('roof', w - t * 2, 0.04, d - t * 2, 0, y + 0.02, 0, 0, 2);
}

// Güneş enerjili su ısıtıcısı (Türk damlarının vazgeçilmezi)
export function solarHeater(F, lx, ly, lz, ry = 0) {
  const S = F.sub(lx, ly, lz, ry);
  S.box('solar', 1.0, 0.06, 1.9, -0.6, 0.75, 0.1, 0, 1, 0, 0.62);
  S.box('solar', 1.0, 0.06, 1.9, 0.5, 0.75, 0.1, 0, 1, 0, 0.62);
  S.add('steel', cached('tank', () => new THREE.CylinderGeometry(0.28, 0.28, 2.1, 14).rotateZ(Math.PI / 2)), -0.05, 1.45, -0.75);
  S.box('metal', 0.05, 1.4, 0.05, -1.0, 0.7, -0.75); S.box('metal', 0.05, 1.4, 0.05, 0.95, 0.7, -0.75);
  S.box('metal', 0.05, 0.3, 0.05, -1.0, 0.15, 0.85); S.box('metal', 0.05, 0.3, 0.05, 0.95, 0.15, 0.85);
  S.box('metal', 2.0, 0.05, 0.05, -0.02, 0.05, 0.9);
}

export function acUnit(F, lx, ly, lz, ry = 0) {
  const S = F.sub(lx, ly, lz, ry);
  S.box('steel', 0.8, 0.55, 0.3, 0, 0, 0.15);
  S.add('metal', cached('fan', () => new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16).rotateX(Math.PI / 2)), -0.1, 0, 0.31);
}

export function railing(F, len, lx, ly, lz, ry = 0, h = 1.0) {
  const S = F.sub(lx, ly, lz, ry);
  S.box('metal', len, 0.05, 0.05, 0, h, 0);
  S.box('metal', len, 0.03, 0.03, 0, 0.1, 0);
  const n = Math.max(2, Math.round(len / 0.14));
  for (let i = 0; i <= n; i++) S.box('metal', 0.02, h - 0.1, 0.02, -len / 2 + (len * i) / n, 0.1 + (h - 0.1) / 2, 0);
}

export function chimney(F, lx, ly, lz) {
  F.box('plaster', 0.6, 1.3, 0.6, lx, ly + 0.65, lz, 0, 1, 0.05);
  F.box('tile', 0.85, 0.06, 0.85, lx, ly + 1.45, lz, 0, 1);
  F.box('plaster', 0.12, 0.2, 0.12, lx - 0.3, ly + 1.35, lz - 0.3); F.box('plaster', 0.12, 0.2, 0.12, lx + 0.3, ly + 1.35, lz + 0.3);
  F.box('plaster', 0.12, 0.2, 0.12, lx + 0.3, ly + 1.35, lz - 0.3); F.box('plaster', 0.12, 0.2, 0.12, lx - 0.3, ly + 1.35, lz + 0.3);
}

export function chair(F, x, y, z, rot) {
  const S = F.sub(x, y, z, rot);
  S.box('woodLight', 0.42, 0.04, 0.42, 0, 0.45, 0, 0, 1);
  S.box('woodLight', 0.42, 0.45, 0.04, 0, 0.7, -0.2, 0, 1);
  for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) S.box('metal', 0.03, 0.45, 0.03, a, 0.225, b);
}
