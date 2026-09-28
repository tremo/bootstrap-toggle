// Bitki örtüsü: kızılçam, palmiye, zeytin, maki, zakkum, begonvil — örneklenmiş (instanced) ağlar.
import * as THREE from 'three';
import { SITE_TREES, PLAY_BOUNDS, BUILDINGS } from './layout.js';
import { groundAt, heightAt, siteMask, westDist, shoreZ, slopeAt, ROAD_Z0, ROAD_Z1 } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm2 } from './util.js';

export const windUniform = { value: 0 };

function windify(mat, strength = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = ip.x * 0.13 + ip.z * 0.11;
        float k = max(0.0, transformed.y - 1.0) * ${(0.02 * strength).toFixed(3)};
        transformed.x += (sin(uTime * 1.3 + ph) * 0.8 + sin(uTime * 3.1 + ph * 3.0 + transformed.y) * 0.25) * k;
        transformed.z += (cos(uTime * 1.1 + ph * 1.3) * 0.6) * k;
      }`);
  };
  mat.customProgramCacheKey = () => 'wind' + strength;
  return mat;
}

// Yaprak kümesi: çapraz kartlar, normaller taç merkezinden dışarı
function clusterCards(centers, size, crownCenter, rnd) {
  const geos = [];
  for (const [cx, cy, cz, s] of centers) {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.PlaneGeometry(size * s, size * s);
      g.rotateY((k * Math.PI) / 3 + rnd() * 0.5);
      g.rotateX((rnd() - 0.5) * 0.9);
      g.translate(cx, cy, cz);
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const nx = p.getX(i) - crownCenter[0], ny = (p.getY(i) - crownCenter[1]) * 1.4, nz = p.getZ(i) - crownCenter[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        n.setXYZ(i, nx / l, ny / l + 0.25, nz / l);
      }
      geos.push(g);
    }
  }
  return mergeGeometries(geos);
}

function rngF(seed) { let a = seed; return () => { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; }; }

function pineGeos() {
  const r = rngF(11);
  const H = 8.5;
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, H, 8, 6);
  trunk.translate(0, H / 2, 0);
  { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / H; p.setX(i, p.getX(i) + y * y * 0.7); } }
  { const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 4); }
  const branches = [];
  const centers = [];
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2, d = 0.5 + Math.sqrt(r()) * 3.4;
    const y = H - 3.4 + r() * 2.8 + (d < 1.5 ? 1.0 : 0) - d * 0.18;
    const cx = Math.cos(a) * d + 0.6, cz = Math.sin(a) * d;
    centers.push([cx, y, cz, 0.8 + r() * 0.5]);
    if (k < 7) {
      const b = new THREE.CylinderGeometry(0.04, 0.08, d + 0.3, 5);
      b.rotateZ(Math.PI / 2 - 0.35).rotateY(-a).translate(0.6 + Math.cos(a) * d * 0.5, y - 0.6, Math.sin(a) * d * 0.5);
      branches.push(b);
    }
  }
  centers.push([0.6, H + 0.4, 0, 1.3]);
  const crown = clusterCards(centers, 2.9, [0.6, H - 1.6, 0], r);
  // uzak LOD: az sayıda büyük kart
  const lowC = centers.filter((_, i) => i % 3 === 0).map(([x, y, z, s]) => [x, y, z, s * 1.5]);
  const crownLow = clusterCards(lowC, 3.2, [0.6, H - 1.6, 0], r);
  const trunkLow = new THREE.CylinderGeometry(0.14, 0.3, H, 5, 1).translate(0.3, H / 2, 0);
  return { trunk: mergeGeometries([trunk, ...branches]), crown, crownLow, trunkLow };
}

function oliveGeos() {
  const r = rngF(23);
  const t1 = new THREE.CylinderGeometry(0.16, 0.32, 2.2, 7).translate(0, 1.1, 0);
  const t2 = new THREE.CylinderGeometry(0.1, 0.16, 1.6, 6).rotateZ(0.5).translate(-0.4, 2.4, 0);
  const t3 = new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6).rotateZ(-0.6).rotateY(1.2).translate(0.3, 2.3, 0.3);
  const centers = [];
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.1;
    centers.push([Math.cos(a) * d, 2.6 + r() * 1.6 - d * 0.2, Math.sin(a) * d, 0.8 + r() * 0.4]);
  }
  return { trunk: mergeGeometries([t1, t2, t3]), crown: clusterCards(centers, 1.9, [0, 2.8, 0], r) };
}

function shrubGeo(n = 9, R = 0.9, H = 1.0, seed = 5) {
  const r = rngF(seed);
  const centers = [];
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    centers.push([Math.cos(a) * d, 0.35 + r() * H * 0.7, Math.sin(a) * d, 0.7 + r() * 0.5]);
  }
  return clusterCards(centers, 1.25, [0, 0.2, 0], r);
}

function palmGeos() {
  const H = 6.5;
  const trunk = new THREE.CylinderGeometry(0.24, 0.34, H, 10, 8).translate(0, H / 2, 0);
  { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / H; p.setX(i, p.getX(i) + Math.sin(y * 1.6) * 0.35); } }
  { const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3); }
  const fronds = [];
  const n = 24;
  for (let k = 0; k < n; k++) {
    const g = new THREE.PlaneGeometry(1.05, 3.3, 1, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 1.7) / 3.4; // 0 taban → 1 uç
      const x = p.getX(i) * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.9));
      p.setXYZ(i, x, 0.0 + t * 1.1 - t * t * (2.0 + (k % 3) * 0.45), t * 3.1);
      p.setX(i, x + Math.abs(x) * 0.0);
    }
    g.computeVertexNormals();
    const pn = g.attributes.normal;
    for (let i = 0; i < pn.count; i++) pn.setXYZ(i, 0, 1, 0);
    const up = (k % 2) * 0.25;
    g.rotateX(-0.25 - up);
    g.rotateY((k / n) * Math.PI * 2 + (k % 2) * 0.17);
    g.translate(Math.sin(1.6) * 0.35, H - 0.1, 0);
    fronds.push(g);
  }
  // meyve / kurumuş yaprak etekliği
  const skirt = new THREE.CylinderGeometry(0.45, 0.32, 0.9, 10, 1, true).translate(Math.sin(1.6) * 0.35, H - 0.7, 0);
  return { trunk: mergeGeometries([trunk, skirt]), crown: mergeGeometries(fronds) };
}

export async function buildVegetation(W, rng) {
  const T = W.T;
  const barkP = new THREE.MeshStandardMaterial({ map: T.pineBark.map, normalMap: T.pineBark.normal, roughness: 0.95 });
  const barkPalm = new THREE.MeshStandardMaterial({ map: T.palmBark.map, normalMap: T.palmBark.normal, roughness: 0.95 });
  const barkOlive = new THREE.MeshStandardMaterial({ map: T.pineBark.map, color: 0x8b8378, roughness: 0.95 });
  const leaf = (map, color = 0xffffff, s = 1) => windify(new THREE.MeshStandardMaterial({ map, color, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85 }), s);
  const pine = pineGeos(), olive = oliveGeos(), palm = palmGeos();
  const shrub = shrubGeo(10, 0.9, 1.0, 5), bush = shrubGeo(7, 0.6, 0.8, 9);

  const lists = { pine: [], olive: [], palm: [], maki: [], oleander: [], bougain: [], pineFar: [], makiFar: [] };
  const occupied = [];
  const col = W.col;
  const inPlay = (x, z) => x > PLAY_BOUNDS.x0 - 20 && x < PLAY_BOUNDS.x1 + 20 && z > PLAY_BOUNDS.z0 - 20 && z < PLAY_BOUNDS.z1 + 10;
  const free = (x, z, rad) => {
    if (col.insideSolid(x, z, groundAt(x, z) + 1.0, rad)) return false;
    if (W.inPool(x, z)) return false;
    for (const b of BUILDINGS) if (Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) / 2 + rad + 1) return false;
    return true;
  };
  const add = (kind, x, z, s, rot = rng() * Math.PI * 2) => {
    const y = groundAt(x, z) - 0.05;
    lists[kind].push([x, y, z, s, rot]);
  };

  for (const t of SITE_TREES) {
    add(t.kind, t.x, t.z, t.s);
    const rr = t.kind === 'palm' ? 0.32 : t.kind === 'olive' ? 0.3 : 0.28;
    col.addCyl({ x: t.x + (t.kind === 'pine' ? 0 : 0), z: t.z, r: rr * t.s, y0: groundAt(t.x, t.z), y1: groundAt(t.x, t.z) + (t.kind === 'olive' ? 2.4 : 7) * t.s, kind: 'tree', mat: 'wood' });
    occupied.push([t.x, t.z]);
  }
  // tesis içi çalılar: güney duvarı boyunca zakkum, S bahçe duvarlarına begonvil
  for (let x = -90; x < 100; x += 4 + rng() * 5) {
    const z = 28.3 + rng() * 0.8;
    if (!free(x, z, 0.4)) continue;
    add('oleander', x, z, 0.9 + rng() * 0.4);
    col.addCyl({ x, z, r: 0.8, y0: groundAt(x, z), y1: groundAt(x, z) + 1.6, kind: 'bush', solid: false, bullet: false });
  }
  for (const b of BUILDINGS.filter((b) => b.type === 'S' || b.type === 'E')) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    for (const lx of [-b.w / 2 - 0.6, b.w / 2 + 0.6]) {
      if (rng() < 0.3) continue;
      const lz = b.d / 2 + (b.type === 'S' ? 2.2 : 0.5);
      const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
      add('bougain', x, z, 1.1 + rng() * 0.4);
      col.addCyl({ x, z, r: 0.9, y0: groundAt(x, z), y1: groundAt(x, z) + 2.0, kind: 'bush', solid: false, bullet: false });
    }
  }
  // tesis içi dağınık çalılar (saklanma yerleri)
  for (let i = 0; i < 70; i++) {
    const x = -90 + rng() * 190, z = -115 + rng() * 142;
    if (siteMask(x, z) < 0.9 || !free(x, z, 1.2)) continue;
    const kind = rng() < 0.5 ? 'maki' : 'oleander';
    const s = 0.9 + rng() * 0.6;
    add(kind, x, z, s);
    col.addCyl({ x, z, r: 0.85 * s, y0: groundAt(x, z), y1: groundAt(x, z) + 1.4 * s, kind: 'bush', solid: false, bullet: false });
  }
  await tick();

  // tepeler: kızılçam ormanı, maki; düzlükte zeytinlik
  const rings = [[45, 520, 7000, 3200], [520, 1600, 9000, 4200], [1600, 4200, 6000, 2600]];
  for (const [r0, r1, tries, cap] of rings) {
    let placed = 0;
    for (let i = 0; i < tries && placed < cap; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
      const x = Math.cos(a) * d, z = -20 + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h < 2.2) continue;
      if (siteMask(x, z) > 0.1) continue;
      if (z > ROAD_Z0 - 6 && z < ROAD_Z1 + 8 && Math.abs(x) < 700) continue;
      if (Math.abs(westDist(x, z) + 7) < 7 && z > -400) continue; // bağlantı yolu
      const sl = slopeAt(x, z);
      if (sl > 1.1) continue;
      const dense = h > 6 || z < -170 || Math.abs(x) > 360;
      const patchy = fbm2(x * 0.004, z * 0.004, 3);
      if (patchy < -0.25 && rng() < 0.7) continue;
      const near = inPlay(x, z);
      const u = rng();
      if (dense && u < 0.68) {
        const s = 0.75 + rng() * 0.55;
        if (near) { if (!free(x, z, 1.5)) continue; lists.pine.push([x, groundAt(x, z) - 0.1, z, s, rng() * 6.28]); col.addCyl({ x, z, r: 0.3 * s, y0: h - 1, y1: h + 7, kind: 'tree', mat: 'wood' }); }
        else lists.pineFar.push([x, groundAt(x, z) - 0.2, z, s * (d > 1600 ? 1.3 : 1), rng() * 6.28]);
        placed++;
      } else if (u < 0.92) {
        const s = 0.8 + rng() * 0.9;
        if (near) {
          if (!free(x, z, 1.2)) continue;
          lists.maki.push([x, groundAt(x, z) - 0.05, z, s, rng() * 6.28]);
          col.addCyl({ x, z, r: 0.8 * s, y0: h - 0.5, y1: h + 1.3 * s, kind: 'bush', solid: false, bullet: false });
        } else if (d < 1600) lists.makiFar.push([x, groundAt(x, z) - 0.1, z, s * 1.3, rng() * 6.28]);
        placed++;
      } else if (!dense && sl < 0.25) {
        const s = 0.8 + rng() * 0.5;
        if (near && !free(x, z, 2)) continue;
        lists.olive.push([x, groundAt(x, z) - 0.05, z, s, rng() * 6.28]);
        if (near) col.addCyl({ x, z, r: 0.3 * s, y0: h - 1, y1: h + 2.4, kind: 'tree', mat: 'wood' });
        placed++;
      }
    }
    await tick();
  }
  // sahil yolu kenarında ılgın/çam gölgelikleri
  for (let x = -300; x <= 320; x += 11 + rng() * 14) {
    const z = ROAD_Z1 + 2.2 + rng() * 1.5;
    if (Math.abs(x) < 100 && rng() < 0.6) continue;
    if (col.insideSolid(x, z, groundAt(x, z) + 1, 1.2)) continue;
    lists.pine.push([x, groundAt(x, z) - 0.1, z, 0.7 + rng() * 0.3, rng() * 6.28]);
    if (inPlay(x, z)) col.addCyl({ x, z, r: 0.25, y0: groundAt(x, z), y1: groundAt(x, z) + 6, kind: 'tree', mat: 'wood' });
  }
  await tick();

  const mk = (geo, mat, arr, cast = true) => {
    if (!arr.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, arr.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    arr.forEach(([x, y, z, sc, rot], i) => {
      e.set(0, rot, 0); q.setFromEuler(e); p.set(x, y, z); s.set(sc, sc, sc);
      M.compose(p, q, s); m.setMatrixAt(i, M);
    });
    m.castShadow = cast; m.receiveShadow = true;
    m.computeBoundingSphere();
    W.group.add(m);
    return m;
  };
  const pineLeaf = leaf(T.leaves.pine, 0xffffff, 1);
  const pineLeafFar = leaf(T.leaves.pine, 0xffffff, 1);
  mk(pine.trunk, barkP, lists.pine);
  mk(pine.crown, pineLeaf, lists.pine);
  mk(pine.trunkLow, barkP, lists.pineFar, false);
  mk(pine.crownLow, pineLeafFar, lists.pineFar, false);
  mk(olive.trunk, barkOlive, lists.olive);
  mk(olive.crown, leaf(T.leaves.olive, 0xffffff, 0.8), lists.olive);
  mk(palm.trunk, barkPalm, lists.palm);
  mk(palm.crown, leaf(T.palmFrond, 0xffffff, 1.4), lists.palm);
  const makiMat = leaf(T.leaves.shrub, 0xffffff, 0.4);
  mk(shrub, makiMat, lists.maki);
  mk(shrub, makiMat, lists.makiFar, false);
  mk(bush, leaf(T.leaves.oleander, 0xffffff, 0.4), lists.oleander);
  mk(shrub, leaf(T.leaves.bougain, 0xffffff, 0.4), lists.bougain);
  W.vegCounts = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
}

const tick = () => new Promise((r) => requestAnimationFrame(() => r()));
void shoreZ;
