// Palamutbükü köyü, balık lokantaları, liman mendireği ve ufuktaki adalar (Simi, İleryos/Tilos, İncirli/Nisyros).
import * as THREE from 'three';
import { Frame, facade, windowAt, tileSkirt, parapet, solarHeater, chimney, boxGeo, chair } from './builder.js';
import { heightAt, groundAt, shoreZ, siteMask, westDist, ROAD_Z0, ROAD_Z1, slopeAt } from './terrain.js';
import { PLAY_BOUNDS } from './layout.js';
import { addCar, CAR_COLORS } from './props.js';
import { fbm2 } from './util.js';

export function buildSurroundings(W, batch, r) {
  const houses = [];
  const ok = (x, z, R) => {
    if (siteMask(x, z) > 0.02) return false;
    if (z > ROAD_Z0 - 5 && z < ROAD_Z1 + 3) return false;
    if (Math.abs(westDist(x, z) + 7) < 9) return false;
    for (const h of houses) if (Math.hypot(h[0] - x, h[1] - z) < R + h[2]) return false;
    return true;
  };
  const house = (x, z, rot, w, d, floors, lokanta = false) => {
    const gy = Math.min(heightAt(x - w / 2, z), heightAt(x + w / 2, z), heightAt(x, z - d / 2), heightAt(x, z + d / 2)) - 0.1;
    const top = Math.max(heightAt(x - w / 2, z), heightAt(x + w / 2, z), heightAt(x, z - d / 2), heightAt(x, z + d / 2));
    const base = top - gy;
    const h = floors * 3.0;
    const F = new Frame(batch, x, gy, z, rot);
    if (base > 0.3) F.box('stone', w + 0.3, base + 0.2, d + 0.3, 0, (base + 0.2) / 2, 0, 0, 2.6);
    const G = F.sub(0, base, 0);
    G.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    parapet(G, w, d, h, 0.4);
    tileSkirt(G, w, d, h + 0.36, { width: 0.75, over: 0.35, angle: 0.44 });
    const lit = () => r() < 0.45;
    const nx = Math.max(1, Math.floor(w / 2.6));
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < nx; k++) {
        const u = -w / 2 + (w / nx) * (k + 0.5);
        const door = f === 0 && k === Math.floor(nx / 2);
        windowAt(facade(G, 'front', w, d, u, f * 3 + (door ? 0 : 0.95)), door ? 1.0 : 1.0, door ? 2.2 : 1.2, { door, arch: door && r() < 0.5, shutters: !door && r() < 0.6, lit: lit() });
        if (r() < 0.6) windowAt(facade(G, 'back', w, d, u, f * 3 + 1.0), 0.8, 1.0, { lit: lit() });
      }
      windowAt(facade(G, 'left', w, d, 0, f * 3 + 1.0), 0.8, 1.0, { lit: lit(), shutters: true });
      windowAt(facade(G, 'right', w, d, 0, f * 3 + 1.0), 0.8, 1.0, { lit: lit(), shutters: true });
    }
    if (r() < 0.75) solarHeater(G, (r() - 0.5) * (w - 3), h + 0.04, (r() - 0.5) * (d - 3), -rot);
    if (r() < 0.5) chimney(G, w / 2 - 0.8, h, -d / 2 + 0.8);
    if (floors === 2 && r() < 0.6) {
      G.box('plaster', w, 0.2, 1.4, 0, 3.0, d / 2 + 0.7, 0, 2);
      G.box('plaster', w, 0.9, 0.14, 0, 3.55, d / 2 + 1.33, 0, 2);
    }
    if (lokanta) {
      // sahil tarafı teras: tente + masalar (plajda)
      const T = F.sub(0, 0, 0);
      void T;
    }
    houses.push([x, z, Math.max(w, d) * 0.7]);
    const inside = x > PLAY_BOUNDS.x0 - 10 && x < PLAY_BOUNDS.x1 + 10 && z > PLAY_BOUNDS.z0 - 10 && z < PLAY_BOUNDS.z1 + 10;
    if (inside) W.col.addBox({ x, z, hw: w / 2, hd: d / 2, rot, y0: gy - 1, y1: gy + base + h + 0.4, kind: 'building', cover: 'high' });
    W.villageLights = W.villageLights || [];
    W.villageLights.push([x, gy + base + 2.2, z]);
    return { gy, base, h, F };
  };

  // Doğu: yol kuzeyinde köy evleri
  for (let x = 118; x < 520; x += 11 + r() * 12) {
    const z = ROAD_Z0 - 9 - r() * 10;
    const w = 7 + r() * 4, d = 6 + r() * 3;
    if (!ok(x, z, 6)) continue;
    house(x, z, (r() - 0.5) * 0.15, w, d, r() < 0.45 ? 2 : 1);
  }
  // Doğu: yol güneyi balık lokantaları (terası plaja bakan)
  for (let x = 124; x < 380; x += 18 + r() * 10) {
    const z = ROAD_Z1 + 7.5;
    const w = 9 + r() * 3, d = 6.5;
    if (!ok(x, z, 6)) continue;
    const { gy, F } = house(x, z, Math.PI, w, d, 1, true);
    // plaja doğru tenteli teras
    const T = new Frame(batch, x, gy, z + d / 2 + 3.6, 0);
    for (const [a, b] of [[-w / 2, -3], [w / 2, -3], [-w / 2, 3], [w / 2, 3]]) T.add('woodLight', new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), a, 1.3, b);
    for (let k = 0; k < 10; k++) T.add('fabric', boxGeo(w / 10, 0.02, 6.4, 1), -w / 2 + w / 20 + (k * w) / 10, 2.6, 0, 0, 0.05, 0, k % 2 ? [0.92, 0.92, 0.9] : [0.1, 0.34, 0.62]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const tx = -w / 2 + 1.6 + i * ((w - 3.2) / 2), tz = -1.5 + j * 3;
      T.box('fabric', 1.2, 0.04, 0.8, tx, 0.74, tz, 0, 1, 0, 0, 0, [0.95, 0.95, 0.95]);
      T.box('metal', 0.05, 0.72, 0.05, tx, 0.36, tz);
      chair(T, tx - 0.8, 0, tz, Math.PI / 2); chair(T, tx + 0.8, 0, tz, -Math.PI / 2);
    }
    W.lamps.push({ x, y: gy + 2.4, z: z + d / 2 + 3.6, type: 'string' });
    void F;
  }
  // Batı ve kuzey yamaçları
  for (let i = 0; i < 260 && houses.length < 95; i++) {
    const side = r();
    let x, z;
    if (side < 0.35) { x = -130 - r() * 420; z = ROAD_Z0 - 12 - r() * 180; }
    else if (side < 0.7) { x = -120 + r() * 560; z = -175 - r() * 380; }
    else { x = 160 + r() * 400; z = -30 - r() * 200; }
    if (slopeAt(x, z) > 0.35) continue;
    const w = 7 + r() * 5, d = 6 + r() * 3;
    if (!ok(x, z, 7)) continue;
    const h = heightAt(x, z);
    if (h < 2) continue;
    house(x, z, r() * Math.PI * 2 * 0.1 + (r() < 0.5 ? 0 : Math.PI / 2), w, d, r() < 0.35 ? 2 : 1);
  }
  // yol kenarı park etmiş birkaç araç (köy)
  for (let x = 110; x < 360; x += 9 + r() * 20) addCar(W, batch, x, ROAD_Z0 - 1.6, Math.PI / 2, Math.floor(r() * 3), CAR_COLORS[Math.floor(r() * 7)], { noCollider: x > PLAY_BOUNDS.x1 });
  for (let x = -110; x > -300; x -= 12 + r() * 25) addCar(W, batch, x, ROAD_Z1 + 1.6, -Math.PI / 2, Math.floor(r() * 3), CAR_COLORS[Math.floor(r() * 7)], { noCollider: x < PLAY_BOUNDS.x0 });

  // Liman mendireği (doğu ucu)
  {
    const x0 = 430, z0 = shoreZ(430) - 2;
    const F = new Frame(batch, x0, 0, z0, -0.25);
    F.box('rock', 7, 3.2, 70, 0, 0.4, 35, 0, 3);
    F.box('stone', 3.2, 0.3, 70, 0, 2.1, 35, 0, 2.6);
    F.box('rock', 36, 3.2, 7, -16, 0.4, 72, 0, 3);
    F.box('stone', 36, 0.3, 3.2, -16, 2.1, 72, 0, 2.6);
    F.add('plaster', new THREE.CylinderGeometry(0.9, 1.1, 6, 12), -32, 3.2, 72);
    F.add('lampRed', new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12), -32, 6.6, 72);
    W.beacon = F.world(-32, 72);
  }

  // Ufuktaki adalar (gerçek kerteriz; mesafe ölçekli)
  const islands = [
    { name: 'Tilos (İleryos)', bearing: 203, dist: 29000, len: 14000, wid: 6000, h: 650, seed: 1 },
    { name: 'Nisyros (İncirli)', bearing: 252, dist: 31000, len: 8000, wid: 7500, h: 700, seed: 2 },
    { name: 'Simi (Sömbeki)', bearing: 106, dist: 31500, len: 11000, wid: 8000, h: 610, seed: 3 },
    { name: 'Kos (İstanköy) ucu', bearing: 283, dist: 40000, len: 18000, wid: 5000, h: 820, seed: 4 },
  ];
  const scale = 0.28; // 30 km → 8.4 km (açısal boyut korunur)
  W.islands = [];
  for (const I of islands) {
    const g = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = fbm2(x * 2.5 + I.seed * 10, z * 2.5, 4);
      const rr = Math.hypot(x, z);
      let hh = Math.pow(Math.max(0, y), 1.6) * (0.75 + n * 0.6);
      if (I.seed === 2) hh = Math.max(hh, Math.max(0, 1 - rr * 1.25) * 1.05); // volkan konisi
      p.setY(i, hh - 0.04);
      const k = 0.36 + n * 0.08;
      cols[i * 3] = k * 0.95; cols[i * 3 + 1] = k * 0.9; cols[i * 3 + 2] = k * 0.8;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, W.M.island);
    const a = (I.bearing * Math.PI) / 180;
    const d = I.dist * scale;
    m.position.set(Math.sin(a) * d, 0, -Math.cos(a) * d);
    m.scale.set(I.len * scale / 2, I.h * scale, I.wid * scale / 2);
    m.rotation.y = a + Math.PI / 2 + (I.seed - 2) * 0.2;
    m.receiveShadow = false; m.castShadow = false;
    W.group.add(m);
    W.islands.push({ ...I, mesh: m, pos: m.position.clone() });
  }
}
