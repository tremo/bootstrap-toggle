// Mertur Tatil Köyü sahnesini kurar: arazi, binalar, havuzlar, duvarlar, çarpışma, siper noktaları.
import * as THREE from 'three';
import { Batch, Frame, boxGeo, facade, windowAt, tileSkirt, parapet, solarHeater, acUnit, railing, chimney, mat4, chair } from './builder.js';
import { BUILDINGS, POOLS, GAZEBO, WALLS, PATHS, PARKING, ACCESS_ROAD, PLAYGROUND, TEA_GARDEN, SITE_TREES, PLAY_BOUNDS } from './layout.js';
import { groundAt, heightAt, SW_CORNER, APEX, SE_CORNER, SITE_WALL_Z, shoreZ, ROAD_Z0, ROAD_Z1, diagPoint } from './terrain.js';
import { buildTerrainMesh, SPLAT } from './terrainMesh.js';
import { CollisionWorld } from './physics.js';
import { mulberry32, pointInPoly } from './util.js';
import { buildProps } from './props.js';
import { buildVegetation } from './vegetation.js';
import { buildSurroundings } from './surroundings.js';

export function makeMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const n = (s) => new THREE.Vector2(s, s);
  const M = {
    plaster: std({ map: T.plaster.map, normalMap: T.plaster.normal, normalScale: n(0.5), roughness: 0.92 }),
    tile: std({ map: T.tile.map, normalMap: T.tile.normal, normalScale: n(1.2), roughness: 0.75 }),
    roof: std({ map: T.roof.map, roughness: 0.95, color: 0xd8d6d0 }),
    frame: std({ map: T.wood.map, color: 0x6a3f2b, roughness: 0.55 }),
    shutter: std({ map: T.wood.map, color: 0x6e2f22, roughness: 0.65 }),
    door: std({ map: T.wood.map, color: 0x86512f, roughness: 0.5 }),
    glass: std({ color: 0x1a252c, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.3 }),
    glassLit: std({ color: 0x1a252c, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.3, emissive: 0xffa24c, emissiveIntensity: 0 }),
    metal: std({ color: 0x2a2c2f, roughness: 0.45, metalness: 0.75 }),
    steel: std({ color: 0xc6c9cc, roughness: 0.3, metalness: 0.85 }),
    chrome: std({ color: 0xeeeeee, roughness: 0.12, metalness: 1.0 }),
    solar: std({ color: 0x0f1a33, roughness: 0.1, metalness: 0.4, envMapIntensity: 1.5 }),
    pavers: std({ map: T.pavers.map, normalMap: T.pavers.normal, roughness: 0.8 }),
    stone: std({ map: T.flag.map, normalMap: T.flag.normal, roughness: 0.85 }),
    coping: std({ map: T.plaster.map, color: 0xefe9dc, roughness: 0.6 }),
    poolTile: std({ map: T.poolTile.map, normalMap: T.poolTile.normal, roughness: 0.2, emissive: 0x2fd0ff, emissiveIntensity: 0 }),
    woodLight: std({ map: T.wood.map, color: 0xc49a70, roughness: 0.75 }),
    fabric: std({ roughness: 0.92, side: THREE.DoubleSide }),
    straw: std({ map: T.dry.map, color: 0xd6b270, roughness: 1 }),
    lampHead: std({ color: 0xfff4e0, emissive: 0xffc47e, emissiveIntensity: 0, roughness: 0.3 }),
    neon: std({ color: 0xff4fb0, emissive: 0xff2d95, emissiveIntensity: 0.2, roughness: 0.4 }),
    dark: std({ color: 0x161616, roughness: 0.85 }),
    plastic: std({ roughness: 0.45 }),
    rock: std({ map: T.rock.map, normalMap: T.rock.normal, roughness: 0.95 }),
    sera: new THREE.MeshStandardMaterial({ color: 0xdcefe8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    carPaint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 }),
    carGlass: std({ color: 0x0c1116, roughness: 0.02, metalness: 0.3, envMapIntensity: 1.5 }),
    tire: std({ color: 0x151515, roughness: 0.9 }),
    lampRed: std({ color: 0x5a0000, emissive: 0xff1010, emissiveIntensity: 0 }),
    sign: std({ roughness: 0.6 }),
    island: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }),
  };
  M.sera.userData.noBatchShadow = true;
  return M;
}

function poolOutline(p) {
  const hw = p.w / 2, hd = p.d / 2;
  if (p.shape === 'rect') return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const pts = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const pinch = 1 - 0.42 * Math.exp(-Math.pow(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)), 2) / 0.22);
    pts.push([Math.cos(a) * hw, Math.sin(a) * hd * pinch]);
  }
  return pts;
}
function offsetPoly(pts, o) {
  if (pts.length === 4) { // eksen hizalı dikdörtgen
    const hw = Math.abs(pts[0][0]) + o, hd = Math.abs(pts[0][1]) + o;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  }
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    // saat yönü tersine çokgen için dış normal (tz, -tx)
    return [p[0] + tz * o, p[1] - tx * o];
  });
}
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function shapeFrom(pts) {
  // ShapeGeometry XY düzleminde; rotateX(-π/2) ile (x, -y) → (x, z); bu yüzden y = -z
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
}
function pathFrom(pts) {
  // delik, dış konturun tersi yönde olmalı (ExtrudeGeometry delikleri düzeltmiyor)
  const s = new THREE.Path();
  [...pts].reverse().forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
}

export class World {
  constructor(scene, T, renderer, progress) {
    this.scene = scene; this.T = T; this.renderer = renderer;
    this.col = new CollisionWorld();
    this.M = makeMaterials(T);
    this.lamps = [];
    this.windowsLit = [];
    this.poolsInfo = [];
    this.cover = [];
    this.flags = [];
    this.animated = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.progress = progress || (() => {});
  }

  async build() {
    const r = mulberry32(2024);
    this.rng = r;
    const batch = new Batch();
    this.batch = batch;
    // havuzlar önce (arazi çukurları)
    this.setupPools();
    const splat = this.paintSplat();
    this.terrain = buildTerrainMesh(this.T, splat, (x, z) => this.depress(x, z), this.renderer);
    this.group.add(this.terrain);
    this.progress(0.1, 'arazi');
    await tick();
    this.buildPools(batch);
    for (const b of BUILDINGS) this.buildBuilding(b, batch, r);
    this.buildGazebo(batch);
    this.buildWalls(batch);
    this.progress(0.3, 'yapılar');
    await tick();
    buildProps(this, batch, r);
    this.progress(0.45, 'donatılar');
    await tick();
    buildSurroundings(this, batch, r);
    this.progress(0.6, 'köy');
    await tick();
    const meshes = batch.build(this.M, this.group, { noShadow: ['glass', 'glassLit', 'lampHead', 'neon', 'sera', 'carGlass', 'poolTile', 'sign'] });
    this.meshes = meshes;
    if (meshes.sera) { meshes.sera.castShadow = false; meshes.sera.renderOrder = 2; }
    await buildVegetation(this, r);
    this.progress(0.85, 'bitki örtüsü');
    await tick();
    this.buildCoverPoints();
    return this;
  }

  // ---------------- havuzlar ----------------
  setupPools() {
    for (const p of POOLS) {
      const outline = poolOutline(p);
      if (polyArea(outline) < 0) outline.reverse();
      const gy = heightAt(p.x, p.z);
      const info = { ...p, outline, expanded: offsetPoly(outline, 1.3), gy, water: gy - 0.12, floor: gy - (p.id === 'main' ? 1.35 : 1.3), cos: Math.cos(p.rot), sin: Math.sin(p.rot) };
      this.poolsInfo.push(info);
      this.col.pools.push({ x: p.x, z: p.z, cos: info.cos, sin: info.sin, hw: p.w / 2 + 0.3, hd: p.d / 2 + 0.3, y: info.water, test: (lx, lz) => pointInPoly(lx, lz, outline) });
    }
  }
  poolLocal(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    return [dx * p.cos - dz * p.sin, dx * p.sin + dz * p.cos];
  }
  inPool(x, z) {
    for (const p of this.poolsInfo) {
      const [lx, lz] = this.poolLocal(p, x, z);
      if (Math.abs(lx) > p.w / 2 + 0.5 || Math.abs(lz) > p.d / 2 + 0.5) continue;
      if (pointInPoly(lx, lz, p.outline)) return { p, lx, lz };
    }
    return null;
  }
  depress(x, z) {
    for (const p of this.poolsInfo) {
      const [lx, lz] = this.poolLocal(p, x, z);
      if (Math.abs(lx) > p.w / 2 + 2 || Math.abs(lz) > p.d / 2 + 2) continue;
      if (pointInPoly(lx, lz, p.expanded)) return p.floor - p.gy - 0.3;
    }
    return 0;
  }
  // Oyuncu/düşman zemini (havuz tabanı + basamaklar dahil)
  floorAt(x, z) {
    const ip = this.inPool(x, z);
    if (ip) {
      const { p, lx, lz } = ip;
      if (p.id === 'main' && lz < -p.d / 2 + 2.2) {
        const k = Math.floor((lx + p.w / 2) / 0.45);
        if (k < 3) return p.gy - 0.34 * (k + 1);
      }
      return p.floor;
    }
    return groundAt(x, z);
  }
  waterAt(x, z) {
    const ip = this.inPool(x, z);
    if (ip) return ip.p.water;
    return 0;
  }

  buildPools(batch) {
    for (const p of this.poolsInfo) {
      const F = new Frame(batch, p.x, p.gy, p.z, p.rot);
      const out = p.outline;
      const deckOuter = offsetPoly(out, p.deck);
      // döşeme (fotoğraftaki kırmızı parke)
      {
        const s = shapeFrom(deckOuter); s.holes.push(pathFrom(out));
        const g = new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2);
        scaleUV(g, 1 / 1.6);
        F.add('pavers', g, 0, 0.035, 0);
      }
      // kenar taşı (harpuşta)
      {
        const s = shapeFrom(offsetPoly(out, 0.4)); s.holes.push(pathFrom(out));
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }).rotateX(-Math.PI / 2);
        scaleUV(g, 1 / 1.5);
        F.add('coping', g, 0, 0.0, 0);
      }
      // iç duvarlar
      {
        const s = shapeFrom(offsetPoly(out, 0.25)); s.holes.push(pathFrom(out));
        const depth = p.gy - p.floor + 0.05;
        const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
        scaleUV(g, 1 / 1.2);
        F.add('poolTile', g, 0, -depth + 0.001, 0);
      }
      // taban
      {
        const g = new THREE.ShapeGeometry(shapeFrom(out), 8).rotateX(-Math.PI / 2);
        scaleUV(g, 1 / 1.2);
        F.add('poolTile', g, 0, p.floor - p.gy, 0);
      }
      // basamaklar ve merdiven
      if (p.id === 'main') {
        for (let k = 0; k < 3; k++) {
          const top = -0.34 * (k + 1);
          const h = top - (p.floor - p.gy);
          F.box('poolTile', 0.45, h, 2.2, -p.w / 2 + 0.225 + k * 0.45, (p.floor - p.gy) + h / 2, -p.d / 2 + 1.1, 0, 1.2);
        }
        for (const s of [-0.3, 0.3]) {
          const rail = new THREE.TorusGeometry(0.35, 0.025, 6, 12, Math.PI);
          F.add('chrome', rail, p.w / 2 - 3 + s, 0.5, p.d / 2 - 0.05, Math.PI / 2, 0, 0);
          F.box('chrome', 0.05, 1.3, 0.05, p.w / 2 - 3 + s, -0.4, p.d / 2 - 0.4);
        }
        // atlama tahtası yerine duş
        F.add('chrome', new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), p.w / 2 + 2.6, 1.15, -p.d / 2 - 2.2);
        F.box('chrome', 0.5, 0.04, 0.04, p.w / 2 + 2.4, 2.3, -p.d / 2 - 2.2);
      }
      // su yüzeyi (ayrı mesh; water.js malzemesi atanacak)
      const wg = new THREE.ShapeGeometry(shapeFrom(out), 12).rotateX(-Math.PI / 2);
      wg.applyMatrix4(mat4(p.x, p.water, p.z, p.rot));
      p.waterGeo = wg;
    }
  }

  // ---------------- binalar ----------------
  buildBuilding(b, batch, r) {
    const gy = heightAt(b.x, b.z) - 0.08;
    b.gy = gy;
    const F = new Frame(batch, b.x, gy, b.z, b.rot);
    const add = (o) => this.col.addBox({ x: b.x, z: b.z, rot: b.rot, y0: gy - 1, kind: 'building', cover: 'high', mat: 'plaster', ...o });
    const lit = () => r() < 0.4;
    switch (b.type) {
      case 'S': this.buildS(b, F, r, lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.45 }); break;
      case 'E': this.buildE(b, F, r, lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.4 }); break;
      case 'M': this.buildM(b, F, r, lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.4 }); break;
      case 'R': this.buildR(b, F, r, lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.4 }); break;
      case 'G': this.buildG(b, F, r, lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.4 }); break;
      case 'K': this.buildK(b, F, r); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h + 0.4 }); break;
      case 'D': this.buildD(b, F, r); break;
      case 'BEKCI': this.buildSmall(b, F, 'bekci', lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h }); break;
      case 'BUFE': this.buildSmall(b, F, 'bufe', lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h }); break;
      case 'PUMP': this.buildSmall(b, F, 'pump', lit); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h }); break;
      case 'HUT': this.buildHut(b, F); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h, mat: 'wood' }); break;
      case 'SERA': this.buildSera(b, F); add({ hw: b.w / 2, hd: b.d / 2, y1: gy + b.h, mat: 'glass', blocksView: false }); break;
    }
  }

  roofKit(F, w, d, h, r, opts = {}) {
    parapet(F, w, d, h, opts.par ?? 0.42);
    tileSkirt(F, w, d, h + (opts.par ?? 0.42) - 0.04, { width: opts.skirt ?? 0.8, over: 0.36, angle: 0.44 });
  }

  buildS(b, F, r, lit) {
    const { w, d, h } = b;
    const fl = 3.0;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    F.box('plaster', 0.3, h - 0.25, 1.35, 0, (h - 0.25) / 2, d / 2 + 0.67, 0, 3, 0.15);
    F.box('plaster', 0.3, h - 0.25, 0.8, 0, (h - 0.25) / 2, -d / 2 - 0.4, 0, 3, 0.15);
    this.col.addBox({ x: F.world(0, d / 2 + 0.67)[0], z: F.world(0, d / 2 + 0.67)[1], hw: 0.15, hd: 0.68, rot: b.rot, y0: b.gy, y1: b.gy + h, kind: 'building', cover: 'high' });
    for (const s of [-1, 1]) {
      const cu = s * w / 4;
      // balkon döşemesi, korkuluk duvarı
      F.box('plaster', w / 2 - 0.3, 0.22, 1.35, cu + s * 0.0, fl, d / 2 + 0.67, 0, 2);
      F.box('plaster', w / 2 - 0.3, 0.9, 0.16, cu, fl + 0.11 + 0.45, d / 2 + 1.27, 0, 2, 0.1);
      F.box('plaster', 0.16, 0.9, 1.35, s * (w / 2 - 0.08), fl + 0.56, d / 2 + 0.67, 0, 2, 0.1);
      F.box('tile', w / 2 - 0.1, 0.06, 0.34, cu, fl + 1.04, d / 2 + 1.3, 0, 1.3);
      // ön cephe
      windowAt(facade(F, 'front', w, d, s * 1.05, 0), 1.0, 2.3, { arch: true, door: true });
      windowAt(facade(F, 'front', w, d, s * 3.15, 0.95), 1.1, 1.3, { shutters: true, lit: lit() });
      windowAt(facade(F, 'front', w, d, s * 1.2, fl + 0.12), 0.9, 2.2, { arch: true, lit: lit() });
      windowAt(facade(F, 'front', w, d, s * 3.15, fl + 0.95), 1.0, 1.2, { shutters: true, lit: lit() });
      // arka
      windowAt(facade(F, 'back', w, d, s * 1.6, 1.1), 0.7, 1.0, { lit: lit() });
      windowAt(facade(F, 'back', w, d, s * 3.3, 1.1), 0.8, 1.0, { lit: lit(), shutters: true });
      windowAt(facade(F, 'back', w, d, s * 2.4, fl + 1.1), 0.9, 1.1, { lit: lit(), shutters: true });
      // yan
      const side = s > 0 ? 'right' : 'left';
      windowAt(facade(F, side, w, d, -1.6, 1.0), 0.9, 1.15, { shutters: true, lit: lit() });
      windowAt(facade(F, side, w, d, 1.8, fl + 1.0), 0.9, 1.15, { shutters: true, lit: lit() });
      acUnit(facade(F, side, w, d, 0.4, fl + 2.1), 0, 0, 0.0);
    }
    this.roofKit(F, w, d, h, r);
    chimney(F, -3.1, h, -2.6); chimney(F, 3.1, h, -2.6);
    if (r() < 0.8) solarHeater(F, (r() < 0.5 ? -1 : 1) * 1.8, h + 0.04, 0.2, -b.rot);
    // bahçe kapısı fenerleri
    const [lx, lz] = F.world(0, d / 2 + 3.3);
    this.lamps.push({ x: lx, y: b.gy + 1.0, z: lz, type: 'bollard' });
  }

  buildE(b, F, r, lit) {
    const { w, d, h } = b;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    this.roofKit(F, w, d, h, r, { par: 0.36 });
    // ön sundurma: kiremitli saçak + ayaklar
    F.add('tile', boxGeo(w + 0.3, 0.07, 2.1, 1.3), 0, 2.72, d / 2 + 0.98, 0, 0.27, 0);
    F.box('frame', w + 0.1, 0.16, 0.16, 0, 2.5, d / 2 + 1.85);
    for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) {
      F.box('plaster', 0.32, 2.45, 0.32, x, 1.225, d / 2 + 1.85, 0, 2, 0.1);
      const [wx, wz] = F.world(x, d / 2 + 1.85);
      this.col.addCyl({ x: wx, z: wz, r: 0.2, y0: b.gy, y1: b.gy + 2.5, kind: 'pillar', mat: 'plaster' });
    }
    for (const s of [-1, 1]) {
      windowAt(facade(F, 'front', w, d, s * 1.45, 0), 1.0, 2.2, { arch: true, door: true });
      windowAt(facade(F, 'front', w, d, s * 3.8, 0.9), 1.2, 1.2, { shutters: true, lit: lit() });
      windowAt(facade(F, 'back', w, d, s * 2.6, 1.2), 0.8, 0.9, { lit: lit() });
    }
    windowAt(facade(F, 'left', w, d, 0, 1.0), 0.9, 1.1, { shutters: true, lit: lit() });
    windowAt(facade(F, 'right', w, d, 0, 1.0), 0.9, 1.1, { shutters: true, lit: lit() });
    if (r() < 0.7) solarHeater(F, 2.5, h + 0.04, -0.8, -b.rot);
    chimney(F, -3.8, h, -2.0);
    const [lx, lz] = F.world(0, d / 2 + 2.6);
    this.lamps.push({ x: lx, y: b.gy + 2.3, z: lz, type: 'wall' });
  }

  buildM(b, F, r, lit) {
    const { w, d, h } = b;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    this.roofKit(F, w, d, h, r, { par: 0.34 });
    F.add('tile', boxGeo(w + 0.3, 0.07, 1.8, 1.3), 0, 2.72, d / 2 + 0.84, 0, 0.25, 0);
    F.box('frame', w + 0.1, 0.15, 0.15, 0, 2.52, d / 2 + 1.6);
    for (const x of [-w / 2 + 0.2, -w / 6, w / 6, w / 2 - 0.2]) {
      F.box('frame', 0.16, 2.45, 0.16, x, 1.225, d / 2 + 1.6);
      const [wx, wz] = F.world(x, d / 2 + 1.6);
      this.col.addCyl({ x: wx, z: wz, r: 0.12, y0: b.gy, y1: b.gy + 2.5, kind: 'pillar', mat: 'wood' });
    }
    for (let k = 0; k < 4; k++) {
      const c = -w / 2 + w / 8 + k * w / 4;
      windowAt(facade(F, 'front', w, d, c - 0.55, 0), 0.9, 2.1, { door: true });
      windowAt(facade(F, 'front', w, d, c + 0.6, 1.05), 0.75, 0.95, { lit: lit() });
      windowAt(facade(F, 'back', w, d, -c, 1.5), 0.6, 0.5, { lit: lit(), mullion: false });
    }
    acUnit(facade(F, 'back', w, d, 1.5, 2.3), 0, 0, 0);
    if (r() < 0.6) solarHeater(F, 0, h + 0.04, -0.6, -b.rot);
    const [lx, lz] = F.world(0, d / 2 + 2.2);
    this.lamps.push({ x: lx, y: b.gy + 2.3, z: lz, type: 'wall' });
  }

  arcade(F, w, h, n, aw, ah, z, depth = 0.4) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
    const pier = (w - n * aw) / (n + 1);
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + pier + aw / 2 + i * (aw + pier);
      const p = new THREE.Path();
      const rr = aw / 2;
      p.moveTo(cx - rr, 0.001); p.lineTo(cx - rr, ah - rr);
      p.absarc(cx, ah - rr, rr, Math.PI, 0, true);
      p.lineTo(cx + rr, 0.001); p.lineTo(cx - rr, 0.001);
      s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
    scaleUV(g, 1 / 3);
    F.add('plaster', g, 0, 0, z - depth / 2);
    const piers = [];
    for (let i = 0; i <= n; i++) piers.push(-w / 2 + pier / 2 + i * (aw + pier));
    return { pier, piers };
  }

  buildR(b, F, r, lit) {
    const { w, d, h } = b;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    this.roofKit(F, w, d, h, r);
    const az = d / 2 + 2.0;
    const { pier, piers } = this.arcade(F, w, h - 0.1, 4, 2.2, 2.75, az);
    F.box('roof', w, 0.22, 2.0, 0, h - 0.1, d / 2 + 1.0, 0, 2);
    tileSkirt(F.sub(0, 0, d / 2 + 1.0), w, 2.0, h + 0.1, { width: 0.7, over: 0.3, angle: 0.42, sides: [1, 0, 1, 1] });
    for (const x of piers) {
      const [wx, wz] = F.world(x, az);
      this.col.addBox({ x: wx, z: wz, hw: pier / 2, hd: 0.2, rot: b.rot, y0: b.gy, y1: b.gy + h, kind: 'building', cover: 'high' });
    }
    windowAt(facade(F, 'front', w, d, 0, 0), 1.8, 2.3, { door: true });
    windowAt(facade(F, 'front', w, d, -3.6, 0.8), 2.0, 1.4, { lit: true });
    windowAt(facade(F, 'front', w, d, 3.6, 0.8), 2.0, 1.4, { lit: true });
    windowAt(facade(F, 'back', w, d, -3, 1.2), 1.2, 1.0, { lit: lit() });
    windowAt(facade(F, 'back', w, d, 3, 1.2), 1.2, 1.0, { lit: lit() });
    windowAt(facade(F, 'left', w, d, 0, 1.0), 1.0, 1.2, { lit: lit(), shutters: true });
    windowAt(facade(F, 'right', w, d, 0, 1.0), 1.0, 1.2, { lit: lit(), shutters: true });
    this.signs = this.signs || [];
    this.signs.push({ F: F.sub(0, h - 0.62, az + 0.21), text: 'MERTUR · RESEPSİYON', w: 5.2, h: 0.55 });
    const [lx, lz] = F.world(0, az + 0.4);
    this.lamps.push({ x: lx, y: b.gy + 2.9, z: lz, type: 'wall' });
    // bayrak direği
    const [fx, fz] = F.world(w / 2 + 2.2, az + 2);
    this.flags.push({ x: fx, z: fz, y: b.gy, h: 9 });
  }

  buildG(b, F, r, lit) {
    const { w, d, h } = b;
    const fl = 3.4;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    this.roofKit(F, w, d, h, r, { skirt: 0.9 });
    const az = d / 2 + 2.4;
    const { pier, piers } = this.arcade(F, w, fl, 5, 2.3, 2.8, az, 0.45);
    F.box('plaster', w, 0.25, 2.6, 0, fl + 0.1, d / 2 + 1.25, 0, 2);
    railing(F, w - 0.3, 0, fl + 0.22, az + 0.1, 0, 1.0);
    for (const x of piers) {
      const [wx, wz] = F.world(x, az);
      this.col.addBox({ x: wx, z: wz, hw: pier / 2, hd: 0.23, rot: b.rot, y0: b.gy, y1: b.gy + fl + 0.2, kind: 'building', cover: 'high' });
    }
    for (let k = -2; k <= 2; k++) {
      windowAt(facade(F, 'front', w, d, k * 3.3, 0), 1.6, 2.4, { door: k === 0, arch: k !== 0, lit: true });
      windowAt(facade(F, 'front', w, d, k * 3.3, fl + 0.25), 1.0, 2.2, { door: false, arch: true, lit: lit() });
      windowAt(facade(F, 'back', w, d, k * 3.3, 1.2), 1.1, 1.1, { lit: lit(), shutters: true });
      windowAt(facade(F, 'back', w, d, k * 3.3, fl + 1.0), 1.1, 1.2, { lit: lit(), shutters: true });
    }
    for (const side of ['left', 'right']) {
      windowAt(facade(F, side, w, d, -2.5, 1.1), 1.1, 1.2, { lit: lit(), shutters: true });
      windowAt(facade(F, side, w, d, 2.5, fl + 1.0), 1.1, 1.2, { lit: lit(), shutters: true });
    }
    chimney(F, -6, h, -3.5); chimney(F, 5.5, h, -3);
    acUnit(F, -3, h + 0.35, -1.5, 0); acUnit(F, 2, h + 0.35, -1.0, 0);
    this.signs = this.signs || [];
    this.signs.push({ F: F.sub(0, fl - 0.45, az + 0.23), text: 'GAZİNO · ÇARŞI', w: 4.4, h: 0.5 });
    for (const x of [-6, 0, 6]) {
      const [lx, lz] = F.world(x, az + 0.5);
      this.lamps.push({ x: lx, y: b.gy + 3.0, z: lz, type: 'wall' });
    }
  }

  buildK(b, F, r) {
    const { w, d, h } = b;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 3, 0.2);
    this.roofKit(F, w, d, h, r, { par: 0.3 });
    windowAt(facade(F, 'front', w, d, 0, 0), 2.0, 2.4, { door: true });
    for (const side of ['left', 'right', 'back']) {
      for (const u of [-2.5, 0, 2.5]) {
        const S = facade(F, side, w, d, u, 2.3);
        S.add('glassLit', new THREE.CircleGeometry(0.38, 20), 0, 0, 0.03);
        S.add('frame', new THREE.TorusGeometry(0.42, 0.06, 6, 20), 0, 0, 0.04);
      }
    }
    this.neons = this.neons || [];
    const S = facade(F, 'front', w, d, 0, 2.95, 0.06);
    this.signs = this.signs || [];
    this.signs.push({ F: S, text: 'DİSKO', w: 3.0, h: 0.8, neon: true });
    F.add('tile', boxGeo(4.2, 0.07, 1.6, 1.3), 0, 2.6, d / 2 + 0.7, 0, 0.3, 0);
  }

  buildD(b, F, r) {
    const { w, d } = b;
    const ph = 0.38;
    F.box('stone', w, ph, d, 0, ph / 2, 0, 0, 2.6);
    this.col.addBox({ x: b.x, z: b.z, hw: w / 2, hd: d / 2, rot: b.rot, y0: b.gy - 1, y1: b.gy + ph, kind: 'platform', cover: null, mat: 'stone' });
    // pergola
    const posts = [];
    for (const x of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) posts.push([x, z]);
    for (const [x, z] of posts) {
      F.box('woodLight', 0.16, 2.6, 0.16, x, ph + 1.3, z, 0, 1);
      const [wx, wz] = F.world(x, z);
      this.col.addCyl({ x: wx, z: wz, r: 0.1, y0: b.gy, y1: b.gy + 3, kind: 'pillar', mat: 'wood' });
    }
    for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) F.box('woodLight', w, 0.18, 0.12, 0, ph + 2.65, z, 0, 1);
    for (let k = 0; k < 14; k++) F.box('woodLight', 0.07, 0.12, d + 0.4, -w / 2 + 0.5 + k * (w - 1) / 13, ph + 2.8, 0, 0, 1);
    // bar tezgâhı
    F.box('stone', 4.5, 1.1, 0.7, 2.5, ph + 0.55, -d / 2 + 1.6, 0, 2.6);
    F.box('woodLight', 4.7, 0.06, 0.9, 2.5, ph + 1.13, -d / 2 + 1.6, 0, 1);
    const [bx, bz] = F.world(2.5, -d / 2 + 1.6);
    this.col.addBox({ x: bx, z: bz, hw: 2.25, hd: 0.35, rot: b.rot, y0: b.gy, y1: b.gy + ph + 1.15, kind: 'prop', cover: 'low', mat: 'stone' });
    for (let k = 0; k < 4; k++) {
      F.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), 0.9 + k * 1.1, ph + 0.37, -d / 2 + 2.3);
      F.add('woodLight', new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), 0.9 + k * 1.1, ph + 0.77, -d / 2 + 2.3);
    }
    // masalar
    for (const [x, z] of [[-4.5, 1.5], [-1.5, 2.6], [-4.2, -1.8], [1.8, 2.2]]) {
      F.add('woodLight', new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), x, ph + 0.74, z);
      F.add('metal', new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6), x, ph + 0.37, z);
      for (let c = 0; c < 3; c++) {
        const a = c * 2.1 + x;
        chair(F, x + Math.sin(a) * 0.75, ph, z + Math.cos(a) * 0.75, a + Math.PI);
      }
    }
    this.lamps.push({ x: b.x, y: b.gy + 2.6, z: b.z, type: 'string' });
  }

  buildSmall(b, F, kind, lit) {
    const { w, d, h } = b;
    F.box('plaster', w, h, d, 0, h / 2, 0, 0, 2, 0.2);
    F.box('roof', w + 0.6, 0.18, d + 0.6, 0, h + 0.09, 0, 0, 2);
    F.box('tile', w + 0.8, 0.06, d + 0.8, 0, h + 0.2, 0, 0, 1.3);
    if (kind === 'bekci') {
      for (const f of ['front', 'back', 'left', 'right']) windowAt(facade(F, f, w, d, 0, 0.95), 1.6, 1.1, { lit: true, mullion: false });
      windowAt(facade(F, 'right', w, d, 0.9, 0), 0.8, 2.0, { door: true });
    } else if (kind === 'bufe') {
      windowAt(facade(F, 'front', w, d, 0, 0.95), 2.8, 1.2, { lit: true, mullion: false });
      F.box('woodLight', 3.2, 0.06, 0.5, 0, 0.95, d / 2 + 0.25, 0, 1);
      // çizgili tente
      for (let k = 0; k < 8; k++) {
        const col = k % 2 ? [0.9, 0.9, 0.88] : [0.75, 0.12, 0.1];
        F.add('fabric', boxGeo(w / 8, 0.03, 1.4, 1), -w / 2 + w / 16 + k * w / 8, 2.45, d / 2 + 0.62, 0, 0.35, 0, col);
      }
      windowAt(facade(F, 'back', w, d, 0, 0), 0.8, 2.0, { door: true });
      this.signs = this.signs || [];
      this.signs.push({ F: facade(F, 'front', w, d, 0, 2.62, 0.05), text: 'BÜFE', w: 1.6, h: 0.4 });
    } else {
      windowAt(facade(F, 'front', w, d, 0, 0), 1.0, 2.0, { door: true });
    }
    this.lamps.push({ x: b.x, y: b.gy + h, z: b.z, type: 'wall' });
  }

  buildHut(b, F) {
    const { w, d, h } = b;
    F.box('woodLight', w, h, d, 0, h / 2, 0, 0, 1);
    F.box('straw', w + 1.2, 0.25, d + 1.2, 0, h + 0.12, 0, 0, 2);
    const cols = [[0.95, 0.55, 0.1], [0.1, 0.5, 0.85], [0.9, 0.2, 0.15], [0.95, 0.85, 0.15]];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.SphereGeometry(0.3, 10, 6).scale(1, 0.55, 6.5);
      F.add('plastic', g, -w / 2 - 1.2 - k * 0.8, 0.2, 0.4, 0, 0, 0, cols[k]);
    }
    this.signs = this.signs || [];
    this.signs.push({ F: facade(F, 'front', w, d, 0, 1.9, 0.05), text: 'DENİZ SPORLARI', w: 3.0, h: 0.4 });
  }

  buildSera(b, F) {
    const { w, d, h } = b;
    const wall = h * 0.65;
    F.box('sera', w, wall, d, 0, wall / 2, 0);
    for (const s of [-1, 1]) F.add('sera', boxGeo(w, 0.02, d / 2 / Math.cos(0.5) + 0.05, 1), 0, wall + Math.tan(0.5) * d / 4, s * d / 4, 0, s * 0.5, 0);
    for (let k = 0; k <= 5; k++) {
      const x = -w / 2 + (k * w) / 5;
      for (const s of [-1, 1]) F.box('steel', 0.05, wall, 0.05, x, wall / 2, s * d / 2);
      F.box('steel', 0.05, 0.05, d, x, wall + 0.2, 0);
    }
    F.box('steel', w, 0.05, 0.05, 0, wall + Math.tan(0.5) * d / 2, 0);
    for (let k = 0; k < 8; k++) F.add('plastic', new THREE.CylinderGeometry(0.18, 0.13, 0.28, 8), -w / 2 + 0.8 + k * 1.3, 0.14, d / 4, 0, 0, 0, [0.62, 0.3, 0.2]);
  }

  buildGazebo(batch) {
    const { x, z, r: R } = GAZEBO;
    const gy = heightAt(x, z);
    const F = new Frame(batch, x, gy, z, 0);
    F.add('pavers', new THREE.CylinderGeometry(R, R + 0.1, 0.3, 28), 0, 0.15, 0);
    this.col.addCyl({ x, z, r: R, y0: gy - 1, y1: gy + 0.3, kind: 'platform', mat: 'stone', blocksView: false });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const cx = Math.sin(a) * (R - 0.35), cz = Math.cos(a) * (R - 0.35);
      F.add('plaster', new THREE.CylinderGeometry(0.14, 0.17, 2.5, 10), cx, 0.3 + 1.25, cz);
      this.col.addCyl({ x: x + cx, z: z + cz, r: 0.17, y0: gy, y1: gy + 2.8, kind: 'pillar', mat: 'plaster' });
    }
    F.add('plaster', new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.3, 28, 1, true), 0, 2.95, 0);
    const cone = new THREE.ConeGeometry(R + 0.8, 1.8, 28, 1, true);
    { const uv = cone.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * (R + 0.8)) / 1.3, uv.getY(i) * 2.4 / 1.3); }
    F.add('tile', cone, 0, 3.1 + 0.9, 0);
    F.add('tile', new THREE.CircleGeometry(R + 0.8, 28).rotateX(Math.PI / 2), 0, 3.1, 0);
    F.add('plaster', new THREE.SphereGeometry(0.18, 10, 8), 0, 4.95, 0);
    // yuvarlak havuz bar
    F.add('stone', new THREE.CylinderGeometry(1.55, 1.55, 1.05, 24), 0, 0.3 + 0.52, 0);
    F.add('woodLight', new THREE.CylinderGeometry(1.75, 1.75, 0.07, 24), 0, 1.4, 0);
    this.col.addCyl({ x, z, r: 1.6, y0: gy, y1: gy + 1.4, kind: 'prop', mat: 'stone', cover: 'low' });
    this.lamps.push({ x, y: gy + 2.7, z, type: 'pool' });
  }

  buildWalls(batch) {
    for (const [x1, z1, x2, z2, h, t] of WALLS) {
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.2) continue;
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const rot = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2; // yerel x duvar boyunca
      const gy = Math.min(heightAt(x1, z1), heightAt(x2, z2), heightAt(cx, cz)) - 0.1;
      const F = new Frame(batch, cx, gy, cz, rot);
      const hh = h + 0.1;
      F.box('plaster', L, hh, t, 0, hh / 2, 0, 0, 2.5, 0.25);
      F.box('tile', L + 0.05, 0.07, t + 0.16, 0, hh + 0.035, 0, 0, 1.3);
      this.col.addBox({ x: cx, z: cz, hw: L / 2, hd: t / 2, rot, y0: gy - 0.5, y1: gy + hh + 0.07, kind: 'wall', cover: h < 1.25 ? 'low' : 'high', mat: 'plaster' });
      // kapı sütunları
      for (const [px, pz] of [[x1, z1], [x2, z2]]) {
        if (h < 1.0) continue;
        const pg = heightAt(px, pz) - 0.1;
        const P = new Frame(batch, px, pg, pz, rot);
        P.box('plaster', 0.5, h + 0.5, 0.5, 0, (h + 0.5) / 2, 0, 0, 2, 0.2);
        P.box('tile', 0.66, 0.08, 0.66, 0, h + 0.54, 0, 0, 1.3);
      }
    }
    // ana giriş tabelası
    this.signs = this.signs || [];
    const F = new Frame(this.batch, -93.5, heightAt(-93.5, SITE_WALL_Z) - 0.1, SITE_WALL_Z + 0.3, 0);
    F.box('plaster', 5.2, 2.4, 0.4, 0, 1.2, 0, 0, 2, 0.2);
    F.box('tile', 5.5, 0.08, 0.7, 0, 2.44, 0, 0, 1.3);
    this.col.addBox({ x: -93.5, z: SITE_WALL_Z + 0.3, hw: 2.6, hd: 0.2, rot: 0, y0: 0, y1: 4, kind: 'wall', cover: 'high' });
    this.signs.push({ F: F.sub(0, 1.4, 0.21), text: 'MERTUR TATİL KÖYÜ', w: 4.6, h: 0.8, big: true });
  }

  // ---------------- zemin boyama ----------------
  paintSplat() {
    const { x0, z0, x1, z1, ppm } = SPLAT;
    const W = (x1 - x0) * ppm, H = (z1 - z0) * ppm;
    const c = document.createElement('canvas');
    c.width = W * 2; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W * 2, H);
    const X = (x) => (x - x0) * ppm, Z = (z) => (z - z0) * ppm;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const poly = (pts, off = 0) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(off + X(x), Z(z)) : g.moveTo(off + X(x), Z(z)))); g.closePath(); g.fill(); };
    const line = (pts, w, off = 0) => { g.lineWidth = w * ppm; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(off + X(x), Z(z)) : g.moveTo(off + X(x), Z(z)))); g.stroke(); };
    const rect = (cx, cz, hw, hd, rot, off = 0) => {
      const c0 = Math.cos(rot), s0 = Math.sin(rot);
      const P = (lx, lz) => [cx + lx * c0 + lz * s0, cz - lx * s0 + lz * c0];
      poly([P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)], off);
    };
    // --- sol yarı: R yol taşı, G parke, B asfalt
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.fillStyle = g.strokeStyle = 'rgb(0,0,255)';
    g.fillRect(0, Z(ROAD_Z0), W, (ROAD_Z1 - ROAD_Z0) * ppm);
    line(ACCESS_ROAD, 6.5);
    rect(PARKING.x, PARKING.z, PARKING.w / 2, PARKING.d / 2, PARKING.rot);
    line([[PARKING.x, PARKING.z], diagPoint(151, -7)], 6);
    g.fillStyle = g.strokeStyle = 'rgb(255,0,0)';
    for (const p of PATHS) line(p.pts, p.w);
    // çay bahçesi, pinpon alanı
    rect(TEA_GARDEN.x, TEA_GARDEN.z, 7, 4, 0);
    // bina önleri / etrafı taş kaldırım (1 m saçak)
    for (const b of BUILDINGS) {
      if (['D', 'SERA', 'HUT'].includes(b.type)) continue;
      rect(b.x, b.z, b.w / 2 + 0.9, b.d / 2 + 0.9, b.rot);
      if (['E', 'M', 'R', 'G'].includes(b.type)) {
        const c0 = Math.cos(b.rot), s0 = Math.sin(b.rot);
        const dz = b.d / 2 + 1.4;
        rect(b.x + dz * s0, b.z + dz * c0, b.w / 2 + 0.5, 1.6, b.rot);
      }
    }
    g.fillStyle = 'rgb(0,255,0)';
    for (const p of this.poolsInfo) {
      const c0 = Math.cos(p.rot), s0 = Math.sin(p.rot);
      poly(offsetPoly(p.outline, p.deck + 0.2).map(([lx, lz]) => [p.x + lx * c0 + lz * s0, p.z - lx * s0 + lz * c0]));
    }
    g.beginPath(); g.arc(X(GAZEBO.x), Z(GAZEBO.z), (GAZEBO.r + 1.2) * ppm, 0, Math.PI * 2); g.fill();
    g.restore();
    // --- sağ yarı: R çim, G kum/plaj, B toprak/çakıl
    g.save();
    g.beginPath(); g.rect(W, 0, W, H); g.clip();
    g.filter = 'blur(3px)';
    g.fillStyle = 'rgb(255,0,0)';
    poly([SW_CORNER, APEX, SE_CORNER], W);
    g.fillStyle = 'rgb(0,0,255)';
    g.fillRect(W, Z(ROAD_Z1), W, 3.4 * ppm);
    g.fillRect(W, Z(ROAD_Z0 - 2.5), W, 2.5 * ppm);
    g.filter = 'blur(6px)';
    // plaj
    g.fillStyle = 'rgb(0,255,0)';
    const beach = [];
    for (let x = x0 - 5; x <= x1 + 5; x += 4) beach.push([x, ROAD_Z1 + 3.2]);
    for (let x = x1 + 5; x >= x0 - 5; x -= 4) beach.push([x, shoreZ(x) + 40]);
    poly(beach, W);
    // çocuk bahçesi kumu
    g.beginPath(); g.ellipse(W + X(PLAYGROUND.x), Z(PLAYGROUND.z), 7 * ppm, 4.5 * ppm, 0, 0, Math.PI * 2); g.fill();
    // kuzey servis alanı (kuru toprak)
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath(); g.ellipse(W + X(60), Z(-100), 22 * ppm, 14 * ppm, 0.6, 0, Math.PI * 2); g.fill();
    g.filter = 'none';
    g.restore();
    return c;
  }

  // ---------------- siper noktaları (YZ için) ----------------
  buildCoverPoints() {
    const pts = [];
    for (const c of this.col.items) {
      if (c.type !== 'box' || !c.cover) continue;
      const edges = [
        [c.hw, 0, 1, 0, c.hd], [-c.hw, 0, -1, 0, c.hd], [0, c.hd, 0, 1, c.hw], [0, -c.hd, 0, -1, c.hw],
      ];
      for (const [ex, ez, nx, nz, half] of edges) {
        const len = half * 2;
        const n = Math.max(1, Math.floor(len / 1.7));
        for (let i = 0; i < n; i++) {
          const t = -half + ((i + 0.5) * len) / n;
          const off = 0.65;
          const lx = ex + nx * off + (nz !== 0 ? t : 0);
          const lz = ez + nz * off + (nx !== 0 ? t : 0);
          const wx = c.cx + lx * c.cos + lz * c.sin, wz = c.cz - lx * c.sin + lz * c.cos;
          const wnx = nx * c.cos + nz * c.sin, wnz = -nx * c.sin + nz * c.cos;
          if (wx < PLAY_BOUNDS.x0 || wx > PLAY_BOUNDS.x1 || wz < PLAY_BOUNDS.z0 || wz > PLAY_BOUNDS.z1) continue;
          const gy = groundAt(wx, wz);
          if (this.col.insideSolid(wx, wz, gy + 0.9, 0.35)) continue;
          if (this.inPool(wx, wz)) continue;
          // köşe: kenar boyunca dışarı adım (yüksek siper için)
          const edgeDist = half - Math.abs(t);
          let peek = null;
          if (c.cover === 'high' && edgeDist < 1.3) {
            const s = Math.sign(t) || 1;
            const tx = (nz !== 0 ? 1 : 0) * s, tz = (nx !== 0 ? 1 : 0) * s;
            const px = tx * c.cos + tz * c.sin, pz = -tx * c.sin + tz * c.cos;
            peek = [wx + px * (edgeDist + 0.9), wz + pz * (edgeDist + 0.9)];
            if (this.col.insideSolid(peek[0], peek[1], gy + 0.9, 0.3)) peek = null;
          }
          pts.push({ x: wx, z: wz, y: gy, nx: wnx, nz: wnz, low: c.cover === 'low', item: c, peek, owner: null });
        }
      }
    }
    this.cover = pts;
  }

  update(dt, t) {
    for (const a of this.animated) a(dt, t);
  }
}


export function scaleUV(g, s) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return g;
}

const tick = () => new Promise((r) => requestAnimationFrame(() => r()));
