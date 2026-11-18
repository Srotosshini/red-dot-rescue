// The level as a grid of 0.25-unit cells. Each cell knows the height a kitten
// would stand at and whether it may stand there at all. Kittens find their way
// to the dot along a distance field that is rebuilt whenever the dot moves to
// another cell: puddles and walls bend the field, so kittens walk around them.

export const CELL = 0.25
export const STEP = 0.16 // height changes smaller than this are walked; bigger ones are hopped
export const JUMP_UP = 0.8
export const JUMP_DOWN = 1.35

export const F_WATER = 1 // puddles, spills, the drain channel, the flood
export const F_WALL = 2 // fences, chimneys, cabinets: nothing to stand on
export const F_HOLE = 4 // the gap between two roofs
export const F_SHELTER = 8 // out of the wind
const BLOCK = F_WATER | F_WALL | F_HOLE
const SOLID = F_WALL | F_HOLE

// neighbours: four sides first, then the four corners
const DC = [1, -1, 0, 0, 1, 1, -1, -1]
const DR = [0, 0, 1, -1, 1, -1, 1, -1]

class MinHeap {
  constructor(capacity = 1024) {
    this.items = new Int32Array(capacity)
    this.keys = new Float32Array(capacity)
    this.size = 0
    this.lastKey = 0
  }
  clear() {
    this.size = 0
  }
  push(item, key) {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2)
      const keys = new Float32Array(this.size * 2)
      items.set(this.items)
      keys.set(this.keys)
      this.items = items
      this.keys = keys
    }
    let i = this.size++
    const { items, keys } = this
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      items[i] = items[p]
      keys[i] = keys[p]
      i = p
    }
    items[i] = item
    keys[i] = key
  }
  pop() {
    const { items, keys } = this
    const top = items[0]
    this.lastKey = keys[0]
    const n = --this.size
    if (n > 0) {
      const item = items[n]
      const key = keys[n]
      let i = 0
      for (;;) {
        let c = i * 2 + 1
        if (c >= n) break
        if (c + 1 < n && keys[c + 1] < keys[c]) c++
        if (keys[c] >= key) break
        items[i] = items[c]
        keys[i] = keys[c]
        i = c
      }
      items[i] = item
      keys[i] = key
    }
    return top
  }
}

export class Grid {
  constructor(width, depth, cell = CELL) {
    this.cell = cell
    this.cols = Math.round(width / cell)
    this.rows = Math.round(depth / cell)
    this.width = this.cols * cell
    this.depth = this.rows * cell
    this.x0 = -this.width / 2
    this.z0 = -this.depth / 2
    this.n = this.cols * this.rows
    this.h = new Float32Array(this.n) // standing height
    this.top = new Float32Array(this.n) // where the laser lands (wall tops); -Infinity over a hole
    this.flags = new Uint8Array(this.n) // fixed when the level is built
    this.dyn = new Uint8Array(this.n) // changes in play: gates, the flood
    this.version = 0 // bumps whenever passability changes
    this.maxTop = 0
    this.minTop = 0
    this.heap = new MinHeap(this.n * 2)
  }

  col(x) {
    return Math.floor((x - this.x0) / this.cell)
  }
  row(z) {
    return Math.floor((z - this.z0) / this.cell)
  }
  index(x, z) {
    const c = Math.floor((x - this.x0) / this.cell)
    const r = Math.floor((z - this.z0) / this.cell)
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1
    return r * this.cols + c
  }
  cx(i) {
    return this.x0 + ((i % this.cols) + 0.5) * this.cell
  }
  cz(i) {
    return this.z0 + (Math.floor(i / this.cols) + 0.5) * this.cell
  }

  // Every cell whose centre lies inside a rectangle {x, z, w, d} or a circle {x, z, r}.
  each(shape, fn) {
    const { cell, x0, z0, cols, rows } = this
    const hw = shape.r ?? shape.w / 2
    const hd = shape.r ?? shape.d / 2
    const c0 = Math.max(0, Math.ceil((shape.x - hw - x0) / cell - 0.5))
    const c1 = Math.min(cols - 1, Math.floor((shape.x + hw - x0) / cell - 0.5 - 1e-6))
    const r0 = Math.max(0, Math.ceil((shape.z - hd - z0) / cell - 0.5))
    const r1 = Math.min(rows - 1, Math.floor((shape.z + hd - z0) / cell - 0.5 - 1e-6))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = x0 + (c + 0.5) * cell
        const z = z0 + (r + 0.5) * cell
        if (shape.r != null && (x - shape.x) ** 2 + (z - shape.z) ** 2 > shape.r * shape.r) continue
        fn(r * cols + c, x, z)
      }
    }
  }

  heightAt(x, z) {
    const i = this.index(x, z)
    return i < 0 ? -Infinity : this.h[i]
  }
  topAt(x, z) {
    const i = this.index(x, z)
    return i < 0 ? -Infinity : this.top[i]
  }
  standable(i) {
    return i >= 0 && !((this.flags[i] | this.dyn[i]) & BLOCK)
  }
  wet(i) {
    return i >= 0 && ((this.flags[i] | this.dyn[i]) & F_WATER) !== 0
  }
  flooded(i) {
    return i >= 0 && (this.dyn[i] & F_WATER) !== 0
  }
  solid(i) {
    return i < 0 || ((this.flags[i] | this.dyn[i]) & SOLID) !== 0
  }
  sheltered(i) {
    return i >= 0 && (this.flags[i] & F_SHELTER) !== 0
  }
  // could a kitten whose feet are at `floor` stand in cell i (a walk or a hop)?
  canStand(i, floor) {
    if (!this.standable(i)) return false
    const dh = this.h[i] - floor
    return dh <= JUMP_UP && -dh <= JUMP_DOWN
  }
  canStep(a, b) {
    return this.canStand(b, this.h[a])
  }
  // swimming: anything that is not a wall or a hole, and dry land low enough to climb onto
  canSwim(a, b, waterLevel) {
    if (this.solid(b)) return false
    if (this.wet(b)) return true
    return this.h[b] - Math.max(this.h[a], waterLevel) <= JUMP_UP
  }

  setDyn(i, flag, on) {
    const was = this.dyn[i]
    this.dyn[i] = on ? was | flag : was & ~flag
    if (this.dyn[i] !== was) this.version++
  }

  // Dijkstra outward from the seeds over cells a kitten could walk or hop
  // between. out[i] ends up as the path length from cell i to the nearest seed.
  flow(seeds, out, { swim = false, waterLevel = -Infinity } = {}) {
    out.fill(Infinity)
    const heap = this.heap
    heap.clear()
    for (const s of seeds) {
      if (s.cost < out[s.i]) {
        out[s.i] = s.cost
        heap.push(s.i, s.cost)
      }
    }
    const { cols, rows, h, cell } = this
    while (heap.size) {
      const i = heap.pop()
      const d = heap.lastKey
      if (d > out[i]) continue
      const c = i % cols
      const r = (i - c) / cols
      for (let k = 0; k < 8; k++) {
        const nc = c + DC[k]
        const nr = r + DR[k]
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const j = nr * cols + nc
        // the field points toward the seeds, so ask whether j can reach i
        if (swim ? !this.canSwim(j, i, waterLevel) : !this.canStep(j, i)) continue
        if (k >= 4) {
          // no squeezing diagonally past the corner of a wall
          const a = r * cols + nc
          const b = nr * cols + c
          if (swim ? this.solid(a) || this.solid(b) : !this.standable(a) || !this.standable(b)) continue
        }
        const jump = Math.abs(h[i] - h[j]) > STEP
        const nd = d + cell * (k >= 4 ? Math.SQRT2 : 1) * (jump ? 1.8 : 1)
        if (nd < out[j]) {
          out[j] = nd
          heap.push(j, nd)
        }
      }
    }
  }

  // The neighbour of i that is closest to the seeds, or -1.
  bestStep(field, i, { swim = false, waterLevel = -Infinity } = {}) {
    if (i < 0) return -1
    const { cols, rows } = this
    const c = i % cols
    const r = (i - c) / cols
    let best = -1
    let bestD = field[i]
    for (let k = 0; k < 8; k++) {
      const nc = c + DC[k]
      const nr = r + DR[k]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const j = nr * cols + nc
      if (!(field[j] < bestD)) continue
      if (swim ? !this.canSwim(i, j, waterLevel) : !this.canStep(i, j)) continue
      if (k >= 4) {
        const a = r * cols + nc
        const b = nr * cols + c
        if (swim ? this.solid(a) || this.solid(b) : !this.standable(a) || !this.standable(b)) continue
      }
      best = j
      bestD = field[j]
    }
    return best
  }

  // Can a kitten walk straight from one point to another without hopping?
  lineClear(x0, z0, x1, z1, floor) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.ceil(len / 0.1)
    let prev = floor
    for (let s = 1; s <= n; s++) {
      const t = s / n
      const i = this.index(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
      if (!this.standable(i)) return false
      if (Math.abs(this.h[i] - prev) > STEP) return false
      prev = this.h[i]
    }
    return true
  }

  // The standable cell nearest to (x, z) that a kitten at `floor` could reach
  // in one hop (any height when floor is null), within maxR. -1 if none.
  nearestStandable(x, z, floor = null, maxR = 1.5) {
    const c0 = this.col(x)
    const r0 = this.row(z)
    const R = Math.ceil(maxR / this.cell)
    let best = -1
    let bestD = Infinity
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const c = c0 + dc
        const r = r0 + dr
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
        const i = r * this.cols + c
        if (floor == null ? !this.standable(i) : !this.canStand(i, floor)) continue
        const d = (this.cx(i) - x) ** 2 + (this.cz(i) - z) ** 2
        if (d < bestD && d <= maxR * maxR) {
          bestD = d
          best = i
        }
      }
    }
    return best
  }

  // March a ray down through the level and return where it first meets a
  // surface: {x, y, z, i, t}, or null over the void.
  raycast(o, d) {
    if (d.y > -1e-4) return null
    const yTop = this.maxTop + 0.3
    const yBot = this.minTop - 0.3
    let t = Math.max(0, (yTop - o.y) / d.y)
    const tEnd = (yBot - o.y) / d.y
    let prev = t
    const hit = (s) => {
      const i = this.index(o.x + d.x * s, o.z + d.z * s)
      return i >= 0 && o.y + d.y * s <= this.top[i]
    }
    for (; t <= tEnd; t += 0.03) {
      if (hit(t)) {
        let a = prev
        let b = t
        for (let k = 0; k < 7; k++) {
          const m = (a + b) / 2
          if (hit(m)) b = m
          else a = m
        }
        const x = o.x + d.x * b
        const z = o.z + d.z * b
        const i = this.index(x, z)
        if (i < 0) return null
        return { x, y: this.top[i], z, i, t: b }
      }
      prev = t
    }
    return null
  }

  // Mark the cells that a wall or a higher roof shields from wind blowing
  // along (wx, wz).
  computeShelter(wx, wz) {
    const len = Math.hypot(wx, wz) || 1
    const ux = -wx / len
    const uz = -wz / len
    for (let i = 0; i < this.n; i++) {
      this.flags[i] &= ~F_SHELTER
      if (!this.standable(i)) continue
      const x = this.cx(i)
      const z = this.cz(i)
      for (let s = 1; s <= 5; s++) {
        const j = this.index(x + ux * s * 0.22, z + uz * s * 0.22)
        if (j >= 0 && this.top[j] > this.h[i] + 0.45 && this.top[j] !== -Infinity) {
          this.flags[i] |= F_SHELTER
          break
        }
      }
    }
  }
}
