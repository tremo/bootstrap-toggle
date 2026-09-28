// Yol bulma: 1 m ızgara, engeller (bina, duvar, araç, havuz, derin su, dik yamaç), A* + yol yumuşatma
import { PLAY_BOUNDS } from './layout.js';
import { groundAt } from './terrain.js';

export class NavGrid {
  constructor(world, cell = 1) {
    this.W = world;
    this.cell = cell;
    const B = PLAY_BOUNDS;
    this.x0 = B.x0 - 10; this.z0 = B.z0 - 10;
    this.nx = Math.ceil((B.x1 - B.x0 + 20) / cell);
    this.nz = Math.ceil((B.z1 - B.z0 + 30) / cell);
    this.block = new Uint8Array(this.nx * this.nz);
    this.cost = new Float32Array(this.nx * this.nz);
    this.build();
    const N = this.nx * this.nz;
    this.g = new Float32Array(N); this.f = new Float32Array(N);
    this.parent = new Int32Array(N); this.stamp = new Uint32Array(N); this.closed = new Uint32Array(N);
    this.cur = 1;
    this.heap = new Int32Array(N);
  }
  idx(i, j) { return j * this.nx + i; }
  toCell(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
  center(i, j) { return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell]; }
  build() {
    const W = this.W, col = W.col;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        const k = this.idx(i, j);
        const h = groundAt(x, z);
        let b = 0;
        if (h < -1.1) b = 1;
        if (W.inPool(x, z)) b = 1;
        const e = 0.8;
        const s = Math.max(Math.abs(groundAt(x + e, z) - groundAt(x - e, z)), Math.abs(groundAt(x, z + e) - groundAt(x, z - e))) / (2 * e);
        if (s > 0.9) b = 1;
        if (!b && col.insideSolid(x, z, h + 0.9, 0.45)) b = 1;
        if (!b && col.insideSolid(x, z, h + 0.35, 0.45)) b = 1;
        this.block[k] = b;
        this.cost[k] = 1 + s * 1.5 + (h < 0 ? 1.5 : 0);
      }
    }
  }
  walkable(x, z) {
    const [i, j] = this.toCell(x, z);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    return !this.block[this.idx(i, j)];
  }
  nearestFree(i, j) {
    if (i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[this.idx(i, j)]) return [i, j];
    for (let r = 1; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= this.nx || b >= this.nz) continue;
        if (!this.block[this.idx(a, b)]) return [a, b];
      }
    }
    return null;
  }
  // A*: dünya koordinatlarında nokta listesi döner
  find(sx, sz, tx, tz, maxIter = 40000) {
    let s = this.nearestFree(...this.toCell(sx, sz));
    let t = this.nearestFree(...this.toCell(tx, tz));
    if (!s || !t) return null;
    const si = this.idx(s[0], s[1]), ti = this.idx(t[0], t[1]);
    const stamp = ++this.cur;
    const { g, f, parent, closed, heap, nx } = this;
    let hn = 0;
    const H = (k) => { const i = k % nx, j = (k / nx) | 0; const dx = Math.abs(i - t[0]), dz = Math.abs(j - t[1]); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const push = (k) => {
      let n = hn++; heap[n] = k;
      while (n > 0) { const p = (n - 1) >> 1; if (f[heap[p]] <= f[k]) break; heap[n] = heap[p]; n = p; }
      heap[n] = k;
    };
    const pop = () => {
      const top = heap[0]; const last = heap[--hn];
      let n = 0;
      for (;;) {
        let c = 2 * n + 1; if (c >= hn) break;
        if (c + 1 < hn && f[heap[c + 1]] < f[heap[c]]) c++;
        if (f[heap[c]] >= f[last]) break;
        heap[n] = heap[c]; n = c;
      }
      heap[n] = last;
      return top;
    };
    this.stamp[si] = stamp; g[si] = 0; f[si] = H(si); parent[si] = -1;
    push(si);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false, iter = 0;
    while (hn > 0 && iter++ < maxIter) {
      const k = pop();
      if (closed[k] === stamp) continue;
      closed[k] = stamp;
      if (k === ti) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, dc] of dirs) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= this.nz) continue;
        const n = b * nx + a;
        if (this.block[n] || closed[n] === stamp) continue;
        if (di && dj && (this.block[j * nx + a] || this.block[b * nx + i])) continue;
        const ng = g[k] + dc * this.cost[n];
        if (this.stamp[n] !== stamp || ng < g[n]) {
          this.stamp[n] = stamp; g[n] = ng; f[n] = ng + H(n) * 1.1; parent[n] = k;
          push(n);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = ti; k !== -1; k = parent[k]) cells.push(k);
    cells.reverse();
    // yumuşatma: görüş hattı ile ara noktaları at
    const pts = cells.map((k) => this.center(k % nx, (k / nx) | 0));
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.clear(pts[a], pts[b])) b--;
      out.push(pts[b]);
      a = b;
    }
    out[out.length - 1] = [tx, tz];
    if (!this.walkable(tx, tz)) out[out.length - 1] = pts[pts.length - 1];
    return out;
  }
  clear(p, q) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < n; s++) {
      const x = p[0] + ((q[0] - p[0]) * s) / n, z = p[1] + ((q[1] - p[1]) * s) / n;
      if (!this.walkable(x, z)) return false;
    }
    return true;
  }
}
