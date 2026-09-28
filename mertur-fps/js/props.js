// Tesis donatıları: tabelalar, bayrak, aydınlatma, şezlong, şemsiye, oyun parkı, araçlar, plaj.
import * as THREE from 'three';
import { Frame, boxGeo, mat4 } from './builder.js';
import { chair } from './builder.js';
import { PATHS, POOLS, PLAYGROUND, TEA_GARDEN, WINE_FOUNTAIN, BREAKFAST, PINGPONG, CARS, PARKING, GARDEN_S } from './layout.js';
import { heightAt, groundAt, shoreZ, ROAD_Z0, SITE_WALL_Z } from './terrain.js';
import { makeTextCanvas } from './textures.js';

export const CAR_COLORS = [[0.86, 0.86, 0.85], [0.55, 0.56, 0.58], [0.26, 0.27, 0.29], [0.03, 0.03, 0.035], [0.5, 0.04, 0.03], [0.05, 0.11, 0.3], [0.62, 0.55, 0.42]];

export function buildProps(W, batch, r) {
  const col = W.col;
  const gyAt = (x, z) => heightAt(x, z);

  // ---- tabelalar ----
  for (const s of W.signs || []) {
    const bg = s.neon ? '#140a14' : s.big ? '#1d4f91' : '#f4f1ea';
    const fg = s.neon ? '#ff5fbf' : s.big ? '#ffffff' : '#1d4f91';
    const cw = 1024, ch = Math.round((1024 * s.h) / s.w);
    const c = makeTextCanvas(s.text, { w: cw, h: Math.max(64, ch), bg, fg, font: `bold ${Math.round(Math.max(64, ch) * 0.62)}px "Barlow Condensed", "Arial Narrow", sans-serif`, border: s.big ? '#ffffff' : null });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, emissive: s.neon ? 0xffffff : 0x000000, emissiveMap: s.neon ? t : null, emissiveIntensity: s.neon ? 0.4 : 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), m);
    mesh.applyMatrix4(s.F.m);
    mesh.receiveShadow = true;
    W.group.add(mesh);
    if (s.neon) (W.neonMats = W.neonMats || []).push(m);
  }

  // ---- Türk bayrağı ----
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = 300; flagCanvas.height = 200;
  {
    const g = flagCanvas.getContext('2d'), G = 200;
    g.fillStyle = '#e30a17'; g.fillRect(0, 0, 300, 200);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0.5 * G, 0.5 * G, 0.25 * G, 0, 7); g.fill();
    g.fillStyle = '#e30a17'; g.beginPath(); g.arc(0.5625 * G, 0.5 * G, 0.2 * G, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + (i * Math.PI) / 5, rr = i % 2 ? 0.05 * G : 0.125 * G;
      g.lineTo(0.905 * G + Math.cos(a) * rr, 0.5 * G + Math.sin(a) * rr);
    }
    g.fill();
  }
  const flagTex = new THREE.CanvasTexture(flagCanvas);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
  W.flags.push({ x: -80, z: SITE_WALL_Z + 2.2, y: gyAt(-80, SITE_WALL_Z + 2.2), h: 7 });
  for (const f of W.flags) {
    const F = new Frame(batch, f.x, f.y, f.z, 0);
    F.add('steel', new THREE.CylinderGeometry(0.05, 0.07, f.h, 8), 0, f.h / 2, 0);
    F.add('steel', new THREE.SphereGeometry(0.09, 8, 6), 0, f.h + 0.05, 0);
    const geo = new THREE.PlaneGeometry(1.8, 1.2, 14, 8);
    geo.translate(0.9, 0, 0);
    const mesh = new THREE.Mesh(geo, flagMat);
    mesh.position.set(f.x + 0.07, f.y + f.h - 0.7, f.z);
    mesh.castShadow = true;
    W.group.add(mesh);
    const base = geo.attributes.position.array.slice();
    const ph = r() * 10;
    W.animated.push((dt, t) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const k = x / 1.8;
        p.setZ(i, Math.sin(x * 3.2 - t * 6.5 + ph) * 0.13 * k + Math.sin(y * 2 + t * 3.1) * 0.03 * k);
        p.setY(i, y - k * k * 0.12);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    });
    col.addCyl({ x: f.x, z: f.z, r: 0.07, y0: f.y, y1: f.y + f.h, kind: 'pole', mat: 'metal', blocksView: false });
  }

  // ---- aydınlatma elemanları ----
  const bollard = (x, z) => {
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add('metal', new THREE.CylinderGeometry(0.09, 0.11, 0.75, 8), 0, 0.375, 0);
    F.add('lampHead', new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10), 0, 0.82, 0);
    F.add('metal', new THREE.CylinderGeometry(0.14, 0.12, 0.05, 10), 0, 0.915, 0);
    W.lamps.push({ x, y: gy + 0.85, z, type: 'bollard' });
  };
  const gardenPole = (x, z) => {
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add('metal', new THREE.CylinderGeometry(0.05, 0.08, 3.2, 8), 0, 1.6, 0);
    F.add('lampHead', new THREE.SphereGeometry(0.22, 12, 10), 0, 3.35, 0);
    F.add('metal', new THREE.CylinderGeometry(0.06, 0.12, 0.12, 8), 0, 3.14, 0);
    col.addCyl({ x, z, r: 0.08, y0: gy, y1: gy + 3.4, kind: 'pole', mat: 'metal', blocksView: false });
    W.lamps.push({ x, y: gy + 3.35, z, type: 'pole' });
  };
  // yollar boyunca
  for (const p of PATHS) {
    let acc = 4;
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let d = 0; d < L; d += 0.5) {
        acc += 0.5;
        if (acc < 11) continue;
        acc = 0;
        const x = ax + ((bx - ax) * d) / L + nx * (p.w / 2 + 0.4), z = az + ((bz - az) * d) / L + nz * (p.w / 2 + 0.4);
        if (col.insideSolid(x, z, gyAt(x, z) + 0.5, 0.5) || W.inPool(x, z)) continue;
        bollard(x, z);
      }
    }
  }
  const pm = POOLS[0];
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gardenPole(pm.x + dx * (pm.w / 2 + 3.2), pm.z + dz * (pm.d / 2 + 3.2));
  {
    const c = Math.cos(PARKING.rot), s = Math.sin(PARKING.rot);
    for (const lx of [-15, 0, 15]) gardenPole(PARKING.x + lx * c + 6.6 * s, PARKING.z - lx * s + 6.6 * c);
  }
  for (const [x, z] of [[34, 10], [34, -20], [58, -40], [80, -30], [60, 0], [-4, -30], [-40, 10]]) gardenPole(x, z);
  // sokak lambaları (sahil yolu)
  for (let x = -330; x <= 330; x += 34) {
    const z = ROAD_Z0 - 0.9;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add('steel', new THREE.CylinderGeometry(0.07, 0.12, 7.5, 8), 0, 3.75, 0);
    F.box('steel', 0.08, 0.08, 1.6, 0, 7.4, 0.8);
    F.box('steel', 0.3, 0.1, 0.6, 0, 7.35, 1.6);
    F.box('lampHead', 0.26, 0.04, 0.5, 0, 7.29, 1.6);
    col.addCyl({ x, z, r: 0.12, y0: gy, y1: gy + 7.5, kind: 'pole', mat: 'metal', blocksView: false });
    W.lamps.push({ x, y: gy + 7.2, z: z + 1.6, type: 'street' });
  }

  // ---- havuz başı: şezlong + şemsiye ----
  const lounger = (x, z, rot, F0 = null) => {
    const gy = gyAt(x, z);
    const F = F0 || new Frame(batch, x, gy, z, rot);
    F.box('plastic', 0.66, 0.06, 1.35, 0, 0.36, 0.25, 0, 1, 0, 0, 0, [0.95, 0.95, 0.94]);
    F.box('plastic', 0.66, 0.06, 0.75, 0, 0.6, -0.72, 0, 1, 0, 0.75, 0, [0.95, 0.95, 0.94]);
    for (const [a, b] of [[-0.29, 0.8], [0.29, 0.8], [-0.29, -0.35], [0.29, -0.35]]) F.box('plastic', 0.05, 0.34, 0.05, a, 0.17, b, 0, 1, 0, 0, 0, [0.9, 0.9, 0.9]);
    F.box('fabric', 0.6, 0.05, 1.3, 0, 0.415, 0.25, 0, 1, 0, 0, 0, [0.12, 0.35, 0.55]);
    col.addBox({ x, z, hw: 0.35, hd: 1.0, rot, y0: gy, y1: gy + 0.5, kind: 'prop', mat: 'plastic', solid: false, blocksView: false });
  };
  const umbrella = (x, z, R = 1.4, colr = [0.95, 0.93, 0.88], straw = false) => {
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add(straw ? 'woodLight' : 'steel', new THREE.CylinderGeometry(0.03, 0.035, 2.45, 6), 0, 1.22, 0);
    if (straw) {
      const cone = new THREE.ConeGeometry(R, 0.75, 14, 1, true);
      F.add('straw', cone, 0, 2.55, 0);
      F.add('straw', new THREE.CylinderGeometry(R, R + 0.05, 0.22, 14, 1, true), 0, 2.08, 0);
    } else {
      const cone = new THREE.ConeGeometry(R, 0.45, 12, 1, true);
      F.add('fabric', cone, 0, 2.4, 0, 0, 0, 0, colr);
    }
    col.addCyl({ x, z, r: 0.04, y0: gy, y1: gy + 2.4, kind: 'pole', mat: 'wood', blocksView: false });
  };
  {
    const p = W.poolsInfo[0];
    for (let k = 0; k < 6; k++) {
      const x = p.x - p.w / 2 + 2 + k * 3.4;
      lounger(x, p.z - p.d / 2 - 2.6, 0);
      lounger(x + 0.9, p.z - p.d / 2 - 2.6, 0);
      if (k % 2 === 0) umbrella(x + 0.45, p.z - p.d / 2 - 3.9);
      if (k < 5) { lounger(x + 1.2, p.z + p.d / 2 + 2.6, Math.PI); if (k % 2) umbrella(x + 1.2, p.z + p.d / 2 + 3.9); }
    }
    const e = W.poolsInfo[1];
    for (let k = 0; k < 5; k++) {
      const a = k * 0.9 + 0.4;
      lounger(e.x + Math.sin(a) * 8.2, e.z + Math.cos(a) * 6.2, a + Math.PI);
    }
  }

  // ---- çay bahçesi (T) ----
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = TEA_GARDEN.x - 4.5 + i * 4.5, z = TEA_GARDEN.z - 1.6 + j * 3.2;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add('woodLight', new THREE.CylinderGeometry(0.45, 0.45, 0.05, 14), 0, 0.72, 0);
    F.add('metal', new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6), 0, 0.35, 0);
    for (let c = 0; c < 4; c++) chair(F, Math.sin(c * 1.57) * 0.72, 0, Math.cos(c * 1.57) * 0.72, c * 1.57 + Math.PI);
    // çay bardağı (ince belli)
    F.add('glass', new THREE.CylinderGeometry(0.03, 0.022, 0.09, 8), 0.15, 0.79, 0.1);
    col.addBox({ x, z, hw: 0.5, hd: 0.5, rot: 0, y0: gy, y1: gy + 0.75, kind: 'prop', mat: 'wood', solid: false, blocksView: false });
    if (j === 0) umbrella(x, z + 1.6, 2.0, [0.93, 0.88, 0.78]);
  }

  // ---- çocuk bahçesi ----
  {
    const { x, z } = PLAYGROUND;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0.2);
    // salıncak
    for (const s of [-1, 1]) for (const t of [-1, 1]) F.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), s * 1.6 + t * 0.35 * 0, 1.15, t * 0.5, 0, t * 0.4, 0);
    F.add('metal', new THREE.CylinderGeometry(0.045, 0.045, 3.4, 6).rotateZ(Math.PI / 2), 0, 2.3, 0);
    for (const sx of [-0.7, 0.7]) {
      F.box('metal', 0.02, 1.8, 0.02, sx - 0.2, 1.4, 0); F.box('metal', 0.02, 1.8, 0.02, sx + 0.2, 1.4, 0);
      F.box('plastic', 0.45, 0.04, 0.2, sx, 0.5, 0, 0, 1, 0, 0, 0, [0.9, 0.2, 0.15]);
    }
    // kaydırak
    F.box('plastic', 0.6, 1.6, 0.6, 3.6, 0.8, 1.8, 0, 1, 0, 0, 0, [0.15, 0.45, 0.8]);
    F.box('plastic', 0.55, 0.05, 2.6, 3.6, 0.85, 3.2, 0, 1, 0, 0.62, 0, [0.95, 0.75, 0.1]);
    col.addBox({ x: x + 3.4, z: z + 2.4, hw: 0.4, hd: 1.4, rot: 0.2, y0: gy, y1: gy + 1.6, kind: 'prop', mat: 'plastic', cover: 'low' });
    // tahterevalli
    F.box('plastic', 2.4, 0.06, 0.25, -3.2, 0.45, 1.6, 0, 1, 0, 0, 0.12, [0.2, 0.7, 0.3]);
    F.box('metal', 0.2, 0.4, 0.2, -3.2, 0.2, 1.6);
  }

  // ---- pinpon ----
  {
    const { x, z, rot } = PINGPONG;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, rot);
    F.box('plastic', 1.525, 0.04, 2.74, 0, 0.76, 0, 0, 1, 0, 0, 0, [0.05, 0.28, 0.16]);
    F.box('plastic', 0.02, 0.005, 2.74, 0, 0.782, 0, 0, 1, 0, 0, 0, [0.95, 0.95, 0.95]);
    F.box('dark', 1.75, 0.15, 0.01, 0, 0.855, 0);
    for (const [a, b] of [[-0.6, -1.1], [0.6, -1.1], [-0.6, 1.1], [0.6, 1.1]]) F.box('metal', 0.05, 0.74, 0.05, a, 0.37, b);
    col.addBox({ x, z, hw: 0.77, hd: 1.37, rot, y0: gy, y1: gy + 0.8, kind: 'prop', mat: 'wood', blocksView: false });
  }

  // ---- şarap çeşmesi ----
  {
    const { x, z } = WINE_FOUNTAIN;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0.3);
    F.add('stone', new THREE.CylinderGeometry(1.1, 1.2, 0.55, 18), 0, 0.27, 0);
    F.box('stone', 0.7, 2.0, 0.7, 0, 1.0, -0.6, 0, 2.6);
    F.add('steel', new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateX(Math.PI / 2), 0, 1.2, -0.12);
    F.add('dark', new THREE.CylinderGeometry(1.0, 1.0, 0.02, 18), 0, 0.53, 0, 0, 0, 0, [0.25, 0.04, 0.08]);
    F.box('tile', 1.6, 0.06, 1.3, 0, 2.0, -0.45, 0, 1.3, 0, 0.35, 0);
    col.addCyl({ x, z, r: 1.15, y0: gy, y1: gy + 0.55, kind: 'prop', mat: 'stone', blocksView: false });
    col.addBox({ x: x - 0.6 * Math.sin(0.3), z: z - 0.6 * Math.cos(0.3), hw: 0.35, hd: 0.35, rot: 0.3, y0: gy, y1: gy + 1.7, kind: 'prop', mat: 'stone', cover: 'high' });
  }

  // ---- kahvaltı-dondurma bantları ve tenteler ----
  for (let k = 0; k < 2; k++) {
    const x = BREAKFAST.x - 3 + k * 6.5, z = BREAKFAST.z - 5;
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.box('stone', 3.4, 1.0, 0.8, 0, 0.5, 0, 0, 2.6);
    F.box('woodLight', 3.6, 0.06, 1.0, 0, 1.03, 0, 0, 1);
    F.box('glass', 3.0, 0.35, 0.5, 0, 1.25, 0);
    for (const [a, b] of [[-1.8, -0.9], [1.8, -0.9], [-1.8, 1.4], [1.8, 1.4]]) F.add('woodLight', new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), a, 1.25, b);
    for (let s = 0; s < 9; s++) F.add('fabric', boxGeo(0.42, 0.02, 2.6, 1), -1.8 + 0.21 + s * 0.42, 2.45, 0.25, 0, 0.12, 0, s % 2 ? [0.94, 0.93, 0.9] : [0.1, 0.35, 0.6]);
    col.addBox({ x, z, hw: 1.7, hd: 0.4, rot: 0, y0: gy, y1: gy + 1.05, kind: 'prop', mat: 'stone', cover: 'low' });
  }

  // ---- banklar, çöp kutuları ----
  const benchSpots = [[GARDEN_S[0] - 5, GARDEN_S[1] + 3, 0.6], [GARDEN_S[0] + 6, GARDEN_S[1] + 5, -0.9], [-40, 18, 0], [20, 22, 0], [34, -4, Math.PI / 2], [34, -30, Math.PI / 2], [52, -56, 1], [72, -44, -2.4], [58, 22, 0], [-14, 26, 0], [-60, 22, 0.7]];
  for (const [x, z, rot] of benchSpots) {
    const gy = gyAt(x, z);
    const F = new Frame(batch, x, gy, z, rot);
    for (let k = 0; k < 4; k++) F.box('woodLight', 1.6, 0.04, 0.09, 0, 0.44, -0.18 + k * 0.1, 0, 1);
    for (let k = 0; k < 3; k++) F.box('woodLight', 1.6, 0.09, 0.03, 0, 0.62 + k * 0.12, -0.26, 0, 1, 0, -0.12);
    for (const a of [-0.65, 0.65]) { F.box('metal', 0.05, 0.44, 0.45, a, 0.22, -0.05); F.box('metal', 0.05, 0.45, 0.05, a, 0.66, -0.26); }
    col.addBox({ x, z, hw: 0.8, hd: 0.25, rot, y0: gy, y1: gy + 0.5, kind: 'prop', mat: 'wood', solid: false, blocksView: false });
    const bx = x + Math.cos(rot) * 1.3, bz = z - Math.sin(rot) * 1.3;
    const B = new Frame(batch, bx, gyAt(bx, bz), bz, 0);
    B.add('plastic', new THREE.CylinderGeometry(0.22, 0.2, 0.7, 10), 0, 0.35, 0, 0, 0, 0, [0.15, 0.32, 0.18]);
  }

  // ---- araçlar ----
  for (const c of CARS) addCar(W, batch, c.x, c.z, c.rot, c.kind, CAR_COLORS[c.color]);

  // ---- plaj: hasır şemsiyeler, şezlonglar, iskele şamandıraları ----
  for (let x = -80; x <= 98; x += 7) {
    for (const row of [0, 1]) {
      const z = 49.5 + row * 6.5 + (x % 14 === 0 ? 0.8 : 0);
      if (Math.abs(x - 22) < 6) continue;
      if (shoreZ(x) - z < 7) continue;
      umbrella(x, z, 1.35, null, true);
      for (const s of [-1, 1]) {
        const lx = x + s * 1.05, lz = z + 0.4;
        const gy = gyAt(lx, lz);
        const F = new Frame(batch, lx, gy, lz, 0);
        F.box('woodLight', 0.6, 0.05, 1.3, 0, 0.3, 0.25, 0, 1);
        F.box('woodLight', 0.6, 0.05, 0.7, 0, 0.52, -0.68, 0, 1, 0, 0.7);
        F.box('fabric', 0.56, 0.04, 1.26, 0, 0.345, 0.25, 0, 1, 0, 0, 0, row ? [0.85, 0.83, 0.78] : [0.1, 0.3, 0.5]);
        for (const [a, b] of [[-0.26, 0.8], [0.26, 0.8], [-0.26, -0.3], [0.26, -0.3]]) F.box('woodLight', 0.05, 0.28, 0.05, a, 0.14, b, 0, 1);
      }
    }
  }
  // yüzme alanı şamandıra hattı
  for (let x = -90; x <= 110; x += 3.2) {
    const z = shoreZ(x) + 48;
    const F = new Frame(batch, x, 0.02, z, 0);
    F.add('plastic', new THREE.SphereGeometry(0.16, 8, 6), 0, 0, 0, 0, 0, 0, x % 2 < 1 ? [0.95, 0.4, 0.05] : [0.95, 0.95, 0.9]);
  }
  // çekilmiş balıkçı tekneleri
  for (const [x, rot] of [[128, 0.2], [140, -0.1], [152, 0.35], [-120, -0.2]]) {
    const z = shoreZ(x) - 5;
    addBoat(batch, x, gyAt(x, z) + 0.15, z, rot + Math.PI, 0.08);
  }
  for (const [x, zo, rot] of [[180, 40, 1.2], [210, 55, 0.4], [-160, 60, 2.0], [260, 30, 1.9]]) {
    addBoat(batch, x, 0.05, shoreZ(x) + zo, rot, 0);
  }
}

// ---- prosedürel araba ----
const carGeoCache = new Map();
function carGeos(kind) {
  if (carGeoCache.has(kind)) return carGeoCache.get(kind);
  const spec = [
    { L: 4.05, W: 1.76, body: [[-2.02, 0.32], [-2.03, 0.9], [-1.7, 0.98], [1.55, 0.92], [2.02, 0.72], [2.03, 0.35]], cab: [[-1.85, 0.94], [-1.55, 1.45], [0.45, 1.47], [1.3, 0.94]] },
    { L: 4.55, W: 1.79, body: [[-2.27, 0.35], [-2.28, 0.95], [-1.5, 1.0], [1.7, 0.94], [2.27, 0.74], [2.28, 0.35]], cab: [[-1.45, 0.98], [-0.95, 1.44], [0.55, 1.46], [1.3, 0.95]] },
    { L: 4.5, W: 1.86, body: [[-2.25, 0.42], [-2.26, 1.08], [-1.9, 1.12], [1.6, 1.08], [2.25, 0.88], [2.26, 0.42]], cab: [[-2.1, 1.1], [-2.0, 1.68], [0.8, 1.7], [1.55, 1.09]] },
  ][kind];
  const ext = (pts, w, bevel) => {
    const s = new THREE.Shape();
    pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(w - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  };
  const body = ext(spec.body, spec.W, 0.07);
  const cab = ext(spec.cab, spec.W - 0.14, 0.04);
  const roofPts = spec.cab.map(([a, b]) => [a, b]);
  const roof = ext([[roofPts[1][0] + 0.08, roofPts[1][1] - 0.02], [roofPts[1][0] + 0.12, roofPts[1][1] + 0.03], [roofPts[2][0] - 0.1, roofPts[2][1] + 0.03], [roofPts[2][0] - 0.05, roofPts[2][1] - 0.02]], spec.W - 0.18, 0.02);
  const tires = [], rims = [];
  const wz = spec.L / 2 - 0.78;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    tires.push(new THREE.CylinderGeometry(0.31, 0.31, 0.22, 14).rotateZ(Math.PI / 2).translate(sx * (spec.W / 2 - 0.13), 0.31, sz * wz));
    rims.push(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 10).rotateZ(Math.PI / 2).translate(sx * (spec.W / 2 - 0.02), 0.31, sz * wz));
  }
  const lights = [boxGeo(0.35, 0.1, 0.05).translate(-0.6, 0.78, spec.L / 2 + 0.01), boxGeo(0.35, 0.1, 0.05).translate(0.6, 0.78, spec.L / 2 + 0.01)];
  const tail = [boxGeo(0.3, 0.12, 0.05).translate(-0.62, 0.86, -spec.L / 2 - 0.01), boxGeo(0.3, 0.12, 0.05).translate(0.62, 0.86, -spec.L / 2 - 0.01)];
  const out = { spec, body, cab, roof, tires, rims, lights, tail };
  carGeoCache.set(kind, out);
  return out;
}

export function addCar(W, batch, x, z, rot, kind, color, opts = {}) {
  const g = carGeos(kind);
  const gy = groundAt(x, z);
  const m = mat4(x, gy, z, rot);
  batch.add('carPaint', g.body, m, color);
  batch.add('carPaint', g.roof, m, color);
  batch.add('carGlass', g.cab, m);
  for (const t of g.tires) batch.add('tire', t, m);
  for (const t of g.rims) batch.add('chrome', t, m);
  for (const t of g.lights) batch.add('chrome', t, m);
  for (const t of g.tail) batch.add('lampRed', t, m);
  if (!opts.noCollider) W.col.addBox({ x, z, hw: g.spec.W / 2, hd: g.spec.L / 2, rot, y0: gy, y1: gy + (kind === 2 ? 1.65 : 1.42), kind: 'car', cover: 'low', mat: 'metal' });
  return g.spec;
}

// ---- ahşap balıkçı teknesi ----
function addBoat(batch, x, y, z, rot, tilt) {
  const F = new Frame(batch, x, y, z, rot);
  const s = new THREE.Shape();
  s.moveTo(-1.1, -3.2); s.quadraticCurveTo(-1.35, 0, -1.1, 2.2); s.quadraticCurveTo(-0.4, 3.6, 0, 3.9);
  s.quadraticCurveTo(0.4, 3.6, 1.1, 2.2); s.quadraticCurveTo(1.35, 0, 1.1, -3.2); s.closePath();
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.95, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  hull.rotateX(-Math.PI / 2).translate(0, -0.35, 0);
  F.add('plaster', hull, 0, 0, 0, 0, tilt, 0);
  F.box('plastic', 2.62, 0.12, 6.4, 0, 0.45, -0.3, 0, 1, 0, tilt, 0, [0.1, 0.3, 0.65]);
  F.box('woodLight', 1.2, 0.9, 1.3, 0, 0.95, 1.2, 0, 1, 0, tilt);
  F.box('plastic', 1.35, 0.08, 1.45, 0, 1.44, 1.2, 0, 1, 0, tilt, 0, [0.1, 0.3, 0.65]);
}
