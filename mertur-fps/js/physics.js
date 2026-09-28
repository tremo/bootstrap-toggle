// Basit çarpışma dünyası: Y ekseninde dönmüş kutular (OBB) + dikey silindirler + arazi + su.
import { groundAt } from './terrain.js';

const CELL = 8;
export class CollisionWorld {
  constructor() {
    this.items = [];
    this.grid = new Map();
    this.stamp = 1;
    this.pools = []; // {x,z,cos,sin,hw,hd,y}
  }
  key(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  addBox(o) {
    const c = { type: 'box', cx: o.x, cz: o.z, hw: o.hw, hd: o.hd, rot: o.rot || 0, y0: o.y0, y1: o.y1, kind: o.kind || 'building', cover: o.cover || null, mat: o.mat || 'plaster', cos: Math.cos(o.rot || 0), sin: Math.sin(o.rot || 0), mark: 0, cells: [], data: o.data || null, blocksView: o.blocksView !== false, solid: o.solid !== false };
    this.items.push(c);
    this.insert(c);
    return c;
  }
  addCyl(o) {
    const c = { type: 'cyl', cx: o.x, cz: o.z, r: o.r, y0: o.y0, y1: o.y1, kind: o.kind || 'tree', mat: o.mat || 'wood', mark: 0, cells: [], blocksView: o.blocksView !== false, solid: o.solid !== false, bullet: o.bullet !== false };
    this.items.push(c);
    this.insert(c);
    return c;
  }
  bounds(c) {
    if (c.type === 'cyl') return [c.cx - c.r, c.cz - c.r, c.cx + c.r, c.cz + c.r];
    const ex = Math.abs(c.hw * c.cos) + Math.abs(c.hd * c.sin);
    const ez = Math.abs(c.hw * c.sin) + Math.abs(c.hd * c.cos);
    return [c.cx - ex, c.cz - ez, c.cx + ex, c.cz + ez];
  }
  insert(c) {
    const [x0, z0, x1, z1] = this.bounds(c);
    c.cells = [];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(c);
        c.cells.push(k);
      }
    }
  }
  remove(c) {
    for (const k of c.cells) {
      const a = this.grid.get(k);
      if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
    }
    const i = this.items.indexOf(c);
    if (i >= 0) this.items.splice(i, 1);
  }
  move(c, x, z, rot) {
    for (const k of c.cells) { const a = this.grid.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } }
    c.cx = x; c.cz = z;
    if (rot !== undefined) { c.rot = rot; c.cos = Math.cos(rot); c.sin = Math.sin(rot); }
    this.insert(c);
  }
  query(x0, z0, x1, z1, out = []) {
    const s = ++this.stamp;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const a = this.grid.get(this.key(i, j));
        if (!a) continue;
        for (const c of a) if (c.mark !== s) { c.mark = s; out.push(c); }
      }
    }
    return out;
  }

  // Işın–kutu (yerel uzayda kesişim)
  rayItem(c, ox, oy, oz, dx, dy, dz, maxT, hit) {
    if (c.type === 'box') {
      const rx = ox - c.cx, rz = oz - c.cz;
      const lox = rx * c.cos - rz * c.sin, loz = rx * c.sin + rz * c.cos;
      const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos;
      let tmin = 0, tmax = maxT, axis = -1, sign = 0;
      // x
      if (Math.abs(ldx) < 1e-9) { if (lox < -c.hw || lox > c.hw) return false; }
      else {
        let t1 = (-c.hw - lox) / ldx, t2 = (c.hw - lox) / ldx, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < c.y0 || oy > c.y1) return false; }
      else {
        let t1 = (c.y0 - oy) / dy, t2 = (c.y1 - oy) / dy, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
      if (Math.abs(ldz) < 1e-9) { if (loz < -c.hd || loz > c.hd) return false; }
      else {
        let t1 = (-c.hd - loz) / ldz, t2 = (c.hd - loz) / ldz, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
      if (axis < 0 || tmin >= hit.t) return false; // içeriden başlayan ışınlar yok sayılır
      // yerel normal → dünya. ldx negatifse +x yüzüne çarpar
      let nx = 0, ny = 0, nz = 0;
      // yerel→dünya: x = lx cos + lz sin, z = -lx sin + lz cos
      if (axis === 0) { const l = ldx > 0 ? -1 : 1; nx = l * c.cos; nz = -l * c.sin; }
      else if (axis === 1) ny = dy > 0 ? -1 : 1;
      else { const l = ldz > 0 ? -1 : 1; nx = l * c.sin; nz = l * c.cos; }
      void sign;
      hit.t = tmin; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.item = c;
      return true;
    }
    // silindir
    const rx = ox - c.cx, rz = oz - c.cz;
    const a = dx * dx + dz * dz;
    if (a < 1e-12) return false;
    const b = 2 * (rx * dx + rz * dz), cc = rx * rx + rz * rz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t >= hit.t || t > maxT) return false;
    const y = oy + dy * t;
    if (y < c.y0 || y > c.y1) return false;
    const hx = rx + dx * t, hz = rz + dz * t, l = Math.hypot(hx, hz) || 1;
    hit.t = t; hit.nx = hx / l; hit.ny = 0; hit.nz = hz / l; hit.item = c;
    return true;
  }

  // DDA ile ızgara geçişi. opts: {terrain:true, water:true, view:false (görüş testi), ignore:item}
  raycast(ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
    const hit = { t: maxT, nx: 0, ny: 1, nz: 0, item: null, kind: null };
    const stamp = ++this.stamp;
    let i = Math.floor(ox / CELL), j = Math.floor(oz / CELL);
    const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (i + 1) * CELL - ox : ox - i * CELL) / Math.abs(dx)) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (j + 1) * CELL - oz : oz - j * CELL) / Math.abs(dz)) : Infinity;
    let tCell = 0;
    for (let n = 0; n < 400 && tCell < hit.t; n++) {
      const a = this.grid.get(this.key(i, j));
      if (a) {
        for (const c of a) {
          if (c.mark === stamp) continue;
          c.mark = stamp;
          if (c === opts.ignore) continue;
          if (opts.view && !c.blocksView) continue;
          if (!opts.view && c.bullet === false) continue;
          this.rayItem(c, ox, oy, oz, dx, dy, dz, hit.t, hit);
        }
      }
      if (tmx < tmz) { tCell = tmx; tmx += tdx; i += stepI; } else { tCell = tmz; tmz += tdz; j += stepJ; }
    }
    if (hit.item) hit.kind = hit.item.kind;
    // su yüzeyi (deniz y=0, havuzlar)
    if (opts.water !== false && dy < 0) {
      if (oy > 0) {
        const t = -oy / dy;
        if (t < hit.t) {
          const x = ox + dx * t, z = oz + dz * t;
          if (groundAt(x, z) < -0.02) { hit.t = t; hit.nx = 0; hit.ny = 1; hit.nz = 0; hit.item = null; hit.kind = 'water'; }
        }
      }
      for (const p of this.pools) {
        if (oy <= p.y) continue;
        const t = (p.y - oy) / dy;
        if (t >= hit.t || t < 0) continue;
        const x = ox + dx * t - p.x, z = oz + dz * t - p.z;
        const lx = x * p.cos - z * p.sin, lz = x * p.sin + z * p.cos;
        if (Math.abs(lx) < p.hw && Math.abs(lz) < p.hd && (!p.test || p.test(lx, lz))) {
          hit.t = t; hit.nx = 0; hit.ny = 1; hit.nz = 0; hit.item = null; hit.kind = 'water';
        }
      }
    }
    // arazi
    if (opts.terrain !== false) {
      const tt = this.terrainRay(ox, oy, oz, dx, dy, dz, hit.t);
      if (tt !== null && tt < hit.t) {
        hit.t = tt; hit.item = null; hit.kind = 'ground';
        const x = ox + dx * tt, z = oz + dz * tt, e = 0.5;
        const hx = groundAt(x + e, z) - groundAt(x - e, z), hz = groundAt(x, z + e) - groundAt(x, z - e);
        let nx = -hx, ny = 2 * e, nz = -hz; const l = Math.hypot(nx, ny, nz);
        hit.nx = nx / l; hit.ny = ny / l; hit.nz = nz / l;
      }
    }
    hit.x = ox + dx * hit.t; hit.y = oy + dy * hit.t; hit.z = oz + dz * hit.t;
    hit.hit = hit.kind !== null;
    return hit;
  }

  terrainRay(ox, oy, oz, dx, dy, dz, maxT) {
    let t = 0, prevT = 0;
    let above = oy - groundAt(ox, oz);
    if (above < 0) return 0;
    while (t < maxT) {
      const step = Math.max(0.6, Math.min(6, above * 0.8 + t * 0.01));
      prevT = t;
      t = Math.min(maxT, t + step);
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      above = y - groundAt(x, z);
      if (above < 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m - groundAt(ox + dx * m, oz + dz * m) < 0) b = m; else a = m;
        }
        return b;
      }
      if (t >= maxT) break;
    }
    return null;
  }

  // Görüş hattı: iki nokta arası engel var mı (bitki dahil görüş engelleri)
  los(ax, ay, az, bx, by, bz, ignore = null) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, { view: true, water: false, ignore });
    return !h.hit;
  }

  // Daire itmesi (hareket). y aralığı [yb, yt]; step: tırmanılabilir basamak
  pushCircle(pos, r, yb, yt, step = 0.4) {
    const cand = this.query(pos.x - r - 1, pos.z - r - 1, pos.x + r + 1, pos.z + r + 1);
    let pushed = false;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of cand) {
        if (!c.solid) continue;
        if (c.y1 <= yb + step || c.y0 >= yt) continue;
        if (c.type === 'cyl') {
          const dx = pos.x - c.cx, dz = pos.z - c.cz;
          const d = Math.hypot(dx, dz), m = r + c.r;
          if (d < m && d > 1e-6) { pos.x += dx / d * (m - d); pos.z += dz / d * (m - d); pushed = true; }
          continue;
        }
        const rx = pos.x - c.cx, rz = pos.z - c.cz;
        const lx = rx * c.cos - rz * c.sin, lz = rx * c.sin + rz * c.cos;
        const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ex = lx - qx, ez = lz - qz;
        let d = Math.hypot(ex, ez);
        let nlx, nlz;
        if (d < 1e-6) {
          // merkez içeride: en yakın kenara it
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; d = -px; } else { nlx = 0; nlz = Math.sign(lz) || 1; d = -pz; }
        } else if (d < r) { nlx = ex / d; nlz = ez / d; } else continue;
        const pen = r - d;
        const wx = nlx * c.cos + nlz * c.sin, wz = -nlx * c.sin + nlz * c.cos;
        pos.x += wx * pen; pos.z += wz * pen; pushed = true;
      }
    }
    return pushed;
  }

  // Ayak altındaki en yüksek destek (duvar üstü, araba, platform)
  supportAt(x, z, r, feetY, step = 0.45) {
    let best = groundAt(x, z);
    const cand = this.query(x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5);
    for (const c of cand) {
      if (!c.solid || c.y1 > feetY + step || c.y1 < best) continue;
      if (c.type === 'cyl') { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r * 0.5) best = c.y1; continue; }
      const rx = x - c.cx, rz = z - c.cz;
      const lx = rx * c.cos - rz * c.sin, lz = rx * c.sin + rz * c.cos;
      if (Math.abs(lx) < c.hw + r * 0.4 && Math.abs(lz) < c.hd + r * 0.4) best = c.y1;
    }
    return best;
  }

  insideSolid(x, z, y, r = 0) {
    const cand = this.query(x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5);
    for (const c of cand) {
      if (!c.solid || y < c.y0 || y > c.y1) continue;
      if (c.type === 'cyl') { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r) return c; continue; }
      const rx = x - c.cx, rz = z - c.cz;
      const lx = rx * c.cos - rz * c.sin, lz = rx * c.sin + rz * c.cos;
      if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return c;
    }
    return null;
  }
}
