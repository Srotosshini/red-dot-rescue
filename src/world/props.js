// Everything the levels are built from, as low-poly geometry: the floating
// diorama base, fences, decks, roofs, kitchen units, drain tunnels, the
// shelter, and the meshes for things that move (boxes, the basket, the robot
// vacuum, butterflies...). Static pieces all go into one Poly, so a level is a
// couple of draw calls however busy it looks.
import * as THREE from 'three'
import { Poly, MAT, colour } from '../core/lowpoly.js'
import { hash3, noise3, makeRng } from '../core/rng.js'
import { F_HOLE } from './grid.js'

const TAU = Math.PI * 2
const tmp = new THREE.Color()

// ---- painting helpers ----------------------------------------------------------
// A shape painted by which way each face looks: tops, the sides facing the
// camera, the other sides (a touch darker), and undersides.
function byFace(top, side, { topFn = null, sideFn = null, under = 0.55 } = {}) {
  return (p, n, out) => {
    if (n.y > 0.55) {
      if (topFn) topFn(p, n, out)
      else out.copy(colour(top))
    } else if (n.y < -0.55) out.copy(colour(side)).multiplyScalar(under)
    else {
      if (sideFn) sideFn(p, n, out)
      else out.copy(colour(side))
      out.multiplyScalar(n.z > 0.5 ? 1 : Math.abs(n.x) > 0.5 ? 0.86 : 0.72)
    }
  }
}

const pick = (list, v) => list[Math.min(list.length - 1, Math.floor(v * list.length))]

function quad(P, a, b, c, d, hex, vary = 0.05) {
  const col = tmp.copy(colour(hex)).multiplyScalar(1 + (P.rand() - 0.5) * 2 * vary)
  P.tri(a, b, c, col).tri(a, c, d, col)
}

// A vertical face from (ax, az) to (bx, bz); it faces (-dz, 0, dx).
function vquad(P, ax, az, bx, bz, yTop, yBot, hex, vary = 0.05) {
  quad(P, [ax, yTop, az], [ax, yBot, az], [bx, yBot, bz], [bx, yTop, bz], hex, vary)
}

// ---- the ground and the floating base --------------------------------------------
const GROUNDS = {
  grass: (x, z, r) => {
    const n = noise3(x * 0.5, 0, z * 0.5, 3)
    if (r < 0.025) return '#b7d86f'
    return pick(['#76ab50', '#82b75a', '#8cc163', '#97c96b'], n)
  },
  tiles: (x, z) => {
    const t = (Math.floor((x + 100) / 0.75) + Math.floor((z + 100) / 0.75)) & 1
    return t ? '#e9dfcf' : '#bfae96'
  },
  concrete: (x, z, r) => {
    const n = noise3(x * 0.7, 3, z * 0.7, 9)
    if (r < 0.04) return '#3e4249'
    return pick(['#42464e', '#4a4f57', '#535861', '#5b6069'], n)
  },
  yard: (x, z, r) => {
    const n = noise3(x * 0.45, 1, z * 0.45, 5)
    if (n < 0.38) return r < 0.5 ? '#7d6448' : '#735b40'
    if (r < 0.03) return '#a9c86a'
    return pick(['#6f944b', '#79a055', '#83a95c'], (n - 0.38) / 0.62)
  },
}

function buildGround(P, ctx) {
  const { grid: g, theme } = ctx
  const paint = GROUNDS[theme.ground]
  if (!paint) return
  const jit = (c, r) => (c <= 0 || r <= 0 || c >= g.cols || r >= g.rows ? 0 : (hash3(c, r, 0, 17) - 0.5) * 0.032)
  for (let i = 0; i < g.n; i++) {
    if (g.flags[i] & F_HOLE) continue
    if (Math.abs(g.h[i]) > 1e-3) continue
    const c = i % g.cols
    const r = (i - c) / g.cols
    const x0 = g.x0 + c * g.cell
    const z0 = g.z0 + r * g.cell
    const x1 = x0 + g.cell
    const z1 = z0 + g.cell
    const a = [x0, jit(c, r), z0]
    const b = [x0, jit(c, r + 1), z1]
    const cc = [x1, jit(c + 1, r + 1), z1]
    const d = [x1, jit(c + 1, r), z0]
    const ca = colour(paint(x0 + 0.08, z0 + 0.15, P.rand())).clone().multiplyScalar(0.96 + P.rand() * 0.08)
    const cb = colour(paint(x1 - 0.08, z1 - 0.15, P.rand())).clone().multiplyScalar(0.96 + P.rand() * 0.08)
    if (hash3(c, r, 1, 5) < 0.5) P.tri(a, b, cc, ca).tri(a, cc, d, cb)
    else P.tri(a, b, d, ca).tri(b, cc, d, cb)
  }
}

// The island's sides: the soil showing under the lip of the ground, and a
// rocky underside tapering to a point, so the level floats.
function buildBase(P, ctx) {
  const { grid: g, theme, rand } = ctx
  const style = theme.base
  if (style === 'none') return
  const x0 = g.x0
  const x1 = -g.x0
  const z0 = g.z0
  const z1 = -g.z0
  const edges = [
    [x0, z1, x1, z1],
    [x1, z1, x1, z0],
    [x1, z0, x0, z0],
    [x0, z0, x0, z1],
  ]
  const slab = style === 'slab' ? 0.55 : 1.0
  const bands = theme.sides // [lip, upper, lower]
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.round(len / g.cell)
    for (let s = 0; s < n; s++) {
      const t0 = s / n
      const t1 = (s + 1) / n
      const px = ax + (bx - ax) * t0
      const pz = az + (bz - az) * t0
      const qx = ax + (bx - ax) * t1
      const qz = az + (bz - az) * t1
      // the cell just inside this stretch of edge
      const mx = (px + qx) / 2
      const mz = (pz + qz) / 2
      const ix = az === bz ? g.index(mx, mz - Math.sign(mz) * 0.05) : g.index(mx - Math.sign(mx) * 0.05, mz)
      if (ix < 0 || g.flags[ix] & F_HOLE) continue
      const top = Math.min(0, g.h[ix])
      const lip = top - 0.14
      vquad(P, px, pz, qx, qz, top, lip, bands[0], 0.04)
      const jag = -slab + (hash3(Math.round(px * 4), Math.round(pz * 4), 2, 3) - 0.5) * 0.12
      vquad(P, px, pz, qx, qz, lip, (lip + jag) / 2, bands[1], 0.06)
      vquad(P, px, pz, qx, qz, (lip + jag) / 2, -slab, bands[2], 0.06)
    }
  }
  if (style === 'slab') {
    // a dollhouse floor: just close the bottom
    quad(P, [x0, -slab, z0], [x1, -slab, z0], [x1, -slab, z1], [x0, -slab, z1], bands[2], 0)
    return
  }
  // rocky underside: rings that shrink toward a point
  const ring = []
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.round(len / 1.1))
    for (let s = 0; s < n; s++) ring.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n])
  }
  const levels = [
    [1, -slab],
    [0.8, -slab - 0.9],
    [0.52, -slab - 1.9],
    [0.24, -slab - 2.8],
  ]
  const rings = levels.map(([k, y], li) =>
    ring.map(([x, z]) => {
      const j = li === 0 ? 0 : (rand() - 0.5) * 0.6
      return [x * k + j, y + (li === 0 ? 0 : (rand() - 0.5) * 0.35), z * k + j]
    }),
  )
  const rock = theme.rock
  for (let li = 0; li < rings.length - 1; li++) {
    const A = rings[li]
    const B = rings[li + 1]
    for (let s = 0; s < A.length; s++) {
      const s1 = (s + 1) % A.length
      const hex = rock[Math.min(rock.length - 1, li + (rand() < 0.3 ? 1 : 0))]
      const col = colour(hex).clone().multiplyScalar(0.92 + rand() * 0.16)
      P.tri(A[s], B[s], B[s1], col).tri(A[s], B[s1], A[s1], col)
    }
  }
  const tip = [(rand() - 0.5) * 1.2, -slab - 3.7, (rand() - 0.5) * 0.8]
  const last = rings[rings.length - 1]
  for (let s = 0; s < last.length; s++) {
    const col = colour(rock[rock.length - 1]).clone().multiplyScalar(0.8 + rand() * 0.2)
    P.tri(last[s], tip, last[(s + 1) % last.length], col)
  }
}

// ---- shapes: things with a footprint on the grid ---------------------------------------
const WOOD = ['#b98352', '#a8744a', '#c08d5c', '#ae7a4c']
const plankTop = (axis, width, cols = WOOD) => (p, n, out) => {
  const v = axis === 'x' ? p.z : p.x
  out.copy(colour(cols[(Math.floor((v + 100) / width) + 7) % cols.length]))
}

function slab(P, s, y0, y1, top, side, opts) {
  P.box(s.w, y1 - y0, s.d, { at: [s.x, (y0 + y1) / 2, s.z], paint: byFace(top, side, opts), vary: 0.03 })
}

function fence(P, s, base) {
  const along = s.w >= s.d ? 'x' : 'z'
  const len = along === 'x' ? s.w : s.d
  const h = s.h - base
  const white = ['#f2ece0', '#e8e0d0', '#f6f1e7']
  const at = (u, y, v = 0) => (along === 'x' ? [s.x - len / 2 + u, base + y, s.z + v] : [s.x + v, base + y, s.z - len / 2 + u])
  const railSize = along === 'x' ? [len, 0.06, 0.04] : [0.04, 0.06, len]
  for (const y of [h * 0.3, h * 0.72]) P.box(railSize[0], railSize[1], railSize[2], { at: at(len / 2, y, along === 'x' ? -0.05 : 0.05), color: '#ddd3c1' })
  const posts = Math.max(2, Math.round(len / 1.4) + 1)
  for (let k = 0; k < posts; k++) {
    const u = (k / (posts - 1)) * (len - 0.1) + 0.05
    P.box(0.1, h + 0.04, 0.1, { at: at(u, (h + 0.04) / 2, along === 'x' ? -0.04 : 0.04), color: '#e4dccb' })
    P.cone(0.075, 0.08, 4, { at: at(u, h + 0.08, along === 'x' ? -0.04 : 0.04), rot: [0, Math.PI / 4, 0], color: '#e4dccb' })
  }
  const n = Math.floor(len / 0.19)
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) * (len / n)
    const ph = h - 0.06 - (P.rand() * 0.05)
    const c = white[k % white.length]
    P.box(along === 'x' ? 0.075 : 0.025, ph, along === 'x' ? 0.025 : 0.075, { at: at(u, ph / 2), color: c })
    P.cone(0.054, 0.07, 4, { at: at(u, ph + 0.035), rot: [0, Math.PI / 4, 0], scale: along === 'x' ? [1, 1, 0.4] : [0.4, 1, 1], color: c })
  }
}

function windowsOn(P, glow, ctx, { x0, x1, z, y0, y1, face = 1, lit = 0.5, w = 0.38, h = 0.46, gapX = 0.9, gapY = 0.85, warm = '#ffcf7a', axis = 'x' }) {
  const rand = ctx.rand
  for (let y = y1 - h / 2 - 0.25; y - h / 2 > y0 + 0.05; y -= gapY) {
    for (let u = x0 + gapX / 2; u < x1 - gapX / 3; u += gapX) {
      const on = rand() < lit
      const frame = [u - w / 2 - 0.04, u + w / 2 + 0.04]
      const zz = z + face * 0.012
      const pts = (a, b, ya, yb, zf) =>
        axis === 'x'
          ? [[a, yb, zf], [a, ya, zf], [b, ya, zf], [b, yb, zf]]
          : [[zf, yb, a], [zf, ya, a], [zf, ya, b], [zf, yb, b]]
      const order = (q) => (face > 0 === (axis === 'x') ? q : [q[3], q[2], q[1], q[0]])
      let q = order(pts(frame[0], frame[1], y - h / 2 - 0.04, y + h / 2 + 0.04, zz))
      quad(P, q[0], q[1], q[2], q[3], '#3b3640', 0.05)
      q = order(pts(u - w / 2, u + w / 2, y - h / 2, y + h / 2, zz + face * 0.006))
      const target = on ? glow : P
      const col = on ? (rand() < 0.2 ? '#ffe0a3' : warm) : '#27303f'
      if (on) {
        const c = colour(col).clone().multiplyScalar(1.6 + rand() * 0.8)
        target.tri(q[0], q[1], q[2], c).tri(q[0], q[2], q[3], c)
      } else quad(target, q[0], q[1], q[2], q[3], col, 0.08)
    }
  }
}

function tree(P, s, base, ctx) {
  const h = s.h - base
  P.cyl(s.r * 0.75, s.r, h, 6, { at: [s.x, base + h / 2, s.z], color: '#7a5537', vary: 0.08 })
  const greens = ctx.theme.leaves ?? ['#4f8f3f', '#5c9c47', '#6aaa4f', '#467f38']
  const R = s.canopy ?? 1.3
  const blobs = [
    [0, 0.25, 0, 1],
    [0.55, -0.1, 0.2, 0.7],
    [-0.5, -0.05, -0.15, 0.72],
    [0.1, 0.55, -0.3, 0.6],
    [-0.15, -0.2, 0.5, 0.6],
  ]
  for (const [dx, dy, dz, k] of blobs) {
    P.ico(R * k * 0.7, 1, {
      at: [s.x + dx * R * 0.7, s.h + 0.1 + dy * R, s.z + dz * R * 0.7],
      scale: [1, 0.85, 1],
      paint: (p, n, out) => {
        out.copy(colour(pick(greens, P.rand())))
        out.multiplyScalar(0.75 + 0.3 * (n.y * 0.5 + 0.5))
      },
    })
  }
}

function building(P, glow, s, ctx) {
  // a city block under a roof: brick sides with windows, tar on top
  const bottom = -6
  const brick = s.brick ?? pick(['#9c4f3c', '#8a5a48', '#a0674e', '#6f5a55'], ctx.rand())
  P.box(s.w, s.h - bottom, s.d, {
    at: [s.x, (s.h + bottom) / 2, s.z],
    paint: byFace('#575b66', brick, {
      topFn: (p, n, out) => {
        const v = hash3(Math.floor(p.x * 3), 0, Math.floor(p.z * 3), 11)
        out.copy(colour(v < 0.08 ? '#6b707b' : v < 0.5 ? '#4f535d' : '#555a64'))
      },
      sideFn: (p, n, out) => {
        out.copy(colour(brick))
        // fade into the dark street below
        out.multiplyScalar(0.25 + 0.75 * Math.min(1, Math.max(0, (p.y + 4.5) / (s.h + 4.5))))
      },
    }),
    vary: 0.03,
  })
  // cornice
  P.box(s.w + 0.08, 0.1, s.d + 0.08, { at: [s.x, s.h - 0.05, s.z], paint: byFace('#6a6f7a', '#c9b8a3'), vary: 0.02 })
  const front = s.z + s.d / 2
  windowsOn(P, glow, ctx, { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z: front, y0: -3.6, y1: s.h - 0.25, lit: 0.45 })
  // windows on the side that faces the gap
  if (s.sideWindows) {
    const xs = s.sideWindows === 'right' ? s.x + s.w / 2 : s.x - s.w / 2
    windowsOn(P, glow, ctx, { x0: s.z - s.d / 2, x1: s.z + s.d / 2, z: xs, y0: -3.6, y1: s.h - 0.25, lit: 0.4, axis: 'z', face: s.sideWindows === 'right' ? 1 : -1 })
  }
}

function counter(P, s, ctx, { island = false } = {}) {
  const cab = ctx.theme.cabinet ?? '#5f87a3'
  const h = s.h
  P.box(s.w - 0.06, h - 0.07, s.d - 0.06, {
    at: [s.x, (h - 0.07) / 2, s.z],
    paint: byFace(cab, cab, {
      sideFn: (p, n, out) => {
        // door seams every half unit
        const u = Math.abs(n.z) > 0.5 ? p.x : p.z
        const seam = Math.abs(((u + 100) % 0.5) - 0.25) > 0.235
        out.copy(colour(seam ? '#3f5d73' : cab))
        if (p.y < 0.08) out.copy(colour('#2f3d4a'))
      },
    }),
  })
  P.box(s.w, 0.07, s.d, { at: [s.x, h - 0.035, s.z], paint: byFace('#e8e4dc', '#cfc9be'), vary: 0.02 })
  // handles
  const faces = island ? [1, -1] : [1]
  for (const f of faces) {
    for (let u = s.x - s.w / 2 + 0.25; u < s.x + s.w / 2; u += 0.5)
      P.box(0.12, 0.025, 0.03, { at: [u, h - 0.22, s.z + f * (s.d / 2 - 0.02)], color: '#d9dde2' })
  }
}

function brickPaint(base) {
  return (p, n, out) => {
    const row = Math.floor((p.y + 100) / 0.12)
    const col = Math.floor((p.x + p.z + (row % 2) * 0.12 + 100) / 0.24)
    out.copy(colour(base)).multiplyScalar(0.85 + hash3(row, col, 0, 4) * 0.25)
    out.multiplyScalar(n.z > 0.5 ? 1 : 0.8)
    if (n.y > 0.5) out.copy(colour('#6d6a66'))
  }
}

// Builders for every shape kind. (P, glow, s, base, ctx)
const SHAPES = {
  deck: (P, g, s) => {
    slab(P, s, -0.02, s.h, '#b98352', '#7f5534', { topFn: plankTop('x', 0.25) })
    for (const [sx, sz] of [[-1, 1], [1, 1]]) P.box(0.1, s.h + 0.05, 0.1, { at: [s.x + sx * (s.w / 2 - 0.08), s.h / 2, s.z + sz * (s.d / 2 - 0.05)], color: '#6e4a2d' })
  },
  porch: (P, g, s) => {
    slab(P, s, -0.02, s.h, '#b5814f', '#7a5234', { topFn: plankTop('x', 0.25) })
    for (let u = s.x - s.w / 2 + 0.4; u < s.x + s.w / 2; u += 2) P.box(0.12, 1.9, 0.12, { at: [u, s.h + 0.95, s.z - s.d / 2 + 0.12], color: '#e9dcc4' })
  },
  roof: (P, g, s, base, ctx) => building(P, g, s, ctx),
  walkway: (P, g, s) => pallet(P, s),
  pallet: (P, g, s) => pallet(P, s),
  bridge: (P, g, s, base, ctx) => {
    slab(P, { ...s, w: s.w }, s.h - 0.1, s.h, '#8f7f6a', '#5e5447', { topFn: ctx.theme.ground === 'concrete' ? (p, n, out) => out.copy(colour((Math.floor((p.z + 100) * 8) & 1) ? '#6d727b' : '#5a5f68')) : plankTop('z', 0.2) })
    for (const sz of [-1, 1]) P.box(s.w, 0.05, 0.05, { at: [s.x, s.h + 0.32, s.z + sz * (s.d / 2 - 0.03)], color: '#8c939c' })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.05, 0.34, 0.05, { at: [s.x + sx * (s.w / 2 - 0.03), s.h + 0.17, s.z + sz * (s.d / 2 - 0.03)], color: '#7b828b' })
  },
  ledge: (P, g, s) => slab(P, s, -0.02, s.h, '#6a6f78', '#4d5159'),
  skylight: (P, g, s, base) => {
    slab(P, s, base, s.h - 0.03, '#8f969f', '#7c838c')
    const glass = { ...s, w: s.w - 0.16, d: s.d - 0.16 }
    g.box(glass.w, 0.02, glass.d, { at: [s.x, s.h - 0.01, s.z], color: '#9ed4ff', vary: 0 })
    P.box(0.04, 0.03, s.d - 0.1, { at: [s.x, s.h, s.z], color: '#c9ced6' })
  },
  ac: (P, g, s, base) => {
    slab(P, s, base, s.h, '#cfd4da', '#b9bfc6')
    P.cyl(0.26, 0.26, 0.02, 10, { at: [s.x, base + (s.h - base) / 2, s.z + s.d / 2 + 0.01], rot: [Math.PI / 2, 0, 0], color: '#3c4148' })
    P.box(0.5, 0.02, 0.025, { at: [s.x, base + (s.h - base) / 2, s.z + s.d / 2 + 0.025], color: '#9aa1aa' })
  },
  counter: (P, g, s, base, ctx) => counter(P, s, ctx),
  island: (P, g, s, base, ctx) => counter(P, s, ctx, { island: true }),
  table: (P, g, s) => {
    P.box(s.w, 0.07, s.d, { at: [s.x, s.h - 0.035, s.z], paint: byFace('#c08a57', '#94653d', { topFn: plankTop('z', 0.31, ['#c08a57', '#b98251', '#c6915e']) }) })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.07, s.h - 0.07, 0.07, { at: [s.x + sx * (s.w / 2 - 0.1), (s.h - 0.07) / 2, s.z + sz * (s.d / 2 - 0.1)], color: '#8a5d38' })
  },
  chair: (P, g, s) => {
    P.box(s.w, 0.05, s.d, { at: [s.x, s.h - 0.025, s.z], color: '#b07a4b' })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.045, s.h - 0.05, 0.045, { at: [s.x + sx * (s.w / 2 - 0.05), (s.h - 0.05) / 2, s.z + sz * (s.d / 2 - 0.05)], color: '#8a5d38' })
    if (s.back) {
      const sz = s.back === 'z+' ? 1 : -1
      P.box(s.w, 0.5, 0.05, { at: [s.x, s.h + 0.25, s.z + sz * (s.d / 2 - 0.025)], color: '#a8724a' })
    }
  },
  stool: (P, g, s) => {
    P.cyl(s.w * 0.48, s.w * 0.45, 0.06, 8, { at: [s.x, s.h - 0.03, s.z], color: '#d36b4f' })
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU
      P.cyl(0.02, 0.025, s.h - 0.05, 4, { at: [s.x + Math.cos(a) * 0.14, (s.h - 0.05) / 2, s.z + Math.sin(a) * 0.14], color: '#3d4148' })
    }
  },
  plank: (P, g, s) => {
    const len = s.axis === 'x' ? s.w : s.d
    const rise = s.to - s.from
    const ang = Math.atan2(rise, len)
    const L = Math.hypot(len, rise) + 0.12
    const y = (s.from + s.to) / 2 - 0.03
    P.box(s.axis === 'x' ? L : s.w * 0.9, 0.06, s.axis === 'x' ? s.d * 0.9 : L, {
      at: [s.x, y, s.z],
      rot: s.axis === 'x' ? [0, 0, ang] : [-ang, 0, 0],
      paint: byFace('#b8834f', '#8a5d38', { topFn: plankTop(s.axis === 'x' ? 'z' : 'x', 0.17, ['#b8834f', '#a9774a']) }),
    })
  },
  stairs: (P, g, s) => {
    const len = s.axis === 'x' ? s.w : s.d
    const n = Math.max(2, Math.round(len / 0.25))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const h = s.from + (s.to - s.from) * t
      const u = -len / 2 + (k + 0.5) * (len / n)
      const at = s.axis === 'x' ? [s.x + u, h / 2, s.z] : [s.x, h / 2, s.z + u]
      P.box(s.axis === 'x' ? len / n : s.w, h, s.axis === 'x' ? s.d : len / n, { at, paint: byFace('#b5814f', '#7a5234'), vary: 0.04 })
    }
  },
  fence: (P, g, s, base) => fence(P, s, base),
  parapet: (P, g, s, base) => {
    const b = Math.max(base, -6)
    P.box(s.w, s.h - b, s.d, { at: [s.x, (s.h + b) / 2, s.z], paint: brickPaint('#94503d'), vary: 0 })
    P.box(s.w + 0.04, 0.05, s.d + 0.04, { at: [s.x, s.h + 0.02, s.z], color: '#c9bba7' })
  },
  chimney: (P, g, s, base) => {
    P.box(s.w, s.h - base, s.d, { at: [s.x, (s.h + base) / 2, s.z], paint: brickPaint('#a4553f'), vary: 0 })
    P.box(s.w + 0.12, 0.1, s.d + 0.12, { at: [s.x, s.h + 0.05, s.z], color: '#6b6560' })
    P.cyl(0.13, 0.13, 0.28, 6, { at: [s.x - s.w * 0.2, s.h + 0.2, s.z], color: '#8e5a46' })
  },
  tank: (P, g, s, base) => {
    const h = s.h - base
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4
      P.box(0.07, h * 0.4, 0.07, { at: [s.x + Math.cos(a) * s.r * 0.7, base + h * 0.2, s.z + Math.sin(a) * s.r * 0.7], color: '#4e4440' })
    }
    P.cyl(s.r, s.r, h * 0.48, 10, {
      at: [s.x, base + h * 0.64, s.z],
      paint: (p, n, out) => out.copy(colour(Math.floor((p.y + 100) / 0.18) % 2 ? '#8d6748' : '#7d5a3f')),
    })
    P.cone(s.r * 1.08, h * 0.16, 10, { at: [s.x, base + h * 0.96, s.z], color: '#5c4636' })
  },
  house: (P, g, s, base, ctx) => {
    const siding = ['#e7d6b8', '#dcc9a8']
    P.box(s.w, s.h, s.d, {
      at: [s.x, s.h / 2, s.z],
      paint: byFace('#8a5246', siding[0], { sideFn: (p, n, out) => out.copy(colour(siding[Math.floor((p.y + 100) / 0.16) % 2])) }),
    })
    // roof edge and gutter
    P.box(s.w + 0.25, 0.14, s.d + 0.3, { at: [s.x, s.h + 0.07, s.z], color: '#8a4b3f' })
    const front = s.z + s.d / 2 + 0.01
    // back door onto the deck
    P.box(0.85, 1.6, 0.06, { at: [s.x - 0.6, 0.3 + 0.8, front], color: '#5c7e8f' })
    P.box(0.07, 0.07, 0.05, { at: [s.x - 0.3, 1.1, front + 0.04], color: '#e8c35a' })
    windowsOn(P, g, ctx, { x0: s.x + 0.1, x1: s.x + s.w / 2 - 0.1, z: front - 0.01, y0: 0.6, y1: s.h - 0.2, lit: ctx.theme.dark ? 0.8 : 0.2, w: 0.6, h: 0.7, gapX: 1.4, gapY: 2, warm: '#ffd38a' })
  },
  doghouse: (P, g, s) => {
    const h = s.h * 0.62
    P.box(s.w, h, s.d, { at: [s.x, h / 2, s.z], paint: byFace('#c4583f', '#c4583f', { sideFn: (p, n, out) => out.copy(colour(Math.floor((p.y + 100) / 0.14) % 2 ? '#c4583f' : '#b24f39')) }) })
    // gable roof
    const rh = s.h - h
    const x0 = s.x - s.w / 2 - 0.08
    const x1 = s.x + s.w / 2 + 0.08
    const z0 = s.z - s.d / 2 - 0.08
    const z1 = s.z + s.d / 2 + 0.08
    const roof = '#5b4a43'
    quad(P, [x0, h, z1], [x1, h, z1], [x1, s.h, s.z], [x0, s.h, s.z], roof, 0.04)
    quad(P, [x1, h, z0], [x0, h, z0], [x0, s.h, s.z], [x1, s.h, s.z], roof, 0.04)
    P.tri([x0 + 0.08, h, s.z + s.d / 2], [x0 + 0.08, h, s.z - s.d / 2], [x0 + 0.08, s.h - 0.05, s.z], colour('#b24f39'))
    P.tri([x1 - 0.08, h, s.z - s.d / 2], [x1 - 0.08, h, s.z + s.d / 2], [x1 - 0.08, s.h - 0.05, s.z], colour('#b24f39'))
    // dark doorway
    P.box(0.42, 0.5, 0.02, { at: [s.x, 0.25, s.z + s.d / 2 + 0.005], color: '#1f1a1c' })
    P.cyl(0.21, 0.21, 0.02, 8, { at: [s.x, 0.5, s.z + s.d / 2 + 0.005], rot: [Math.PI / 2, 0, 0], color: '#1f1a1c' })
    P.box(0.36, 0.08, 0.02, { at: [s.x, 0.68, s.z + s.d / 2 + 0.006], color: '#f1e3c4' })
  },
  trunk: (P, g, s, base, ctx) => tree(P, s, base, ctx),
  hedge: (P, g, s) => {
    const along = s.w >= s.d
    const len = along ? s.w : s.d
    for (let u = 0.3; u < len; u += 0.42) {
      const x = along ? s.x - len / 2 + u : s.x
      const z = along ? s.z : s.z - len / 2 + u
      P.ico(0.36, 1, { at: [x, s.h * 0.55, z], scale: [1, 1.4, 1], color: '#4f8a3e', vary: 0.12 })
    }
  },
  backwall: (P, g, s, base, ctx) => {
    const front = s.z + s.d / 2
    P.box(s.w, s.h, s.d, { at: [s.x, s.h / 2, s.z], paint: byFace('#d9cbb6', '#e3d6c2', { sideFn: (p, n, out) => out.copy(colour(p.y < 0.12 ? '#b9a88f' : '#e3d6c2')) }) })
    // a window full of night and rain
    const wx = s.windowX ?? -2
    P.box(2.1, 1.25, 0.06, { at: [wx, 1.75, front + 0.02], color: '#f3ede2' })
    g.box(1.85, 1.0, 0.02, { at: [wx, 1.75, front + 0.055], color: '#1d2a4a', vary: 0 })
    P.box(0.06, 1.0, 0.03, { at: [wx, 1.75, front + 0.07], color: '#f3ede2' })
    P.box(1.85, 0.05, 0.03, { at: [wx, 1.75, front + 0.07], color: '#f3ede2' })
    for (let k = 0; k < 9; k++) {
      const x = wx - 0.85 + ctx.rand() * 1.7
      const y = 1.3 + ctx.rand() * 0.9
      g.box(0.008, 0.12, 0.005, { at: [x, y, front + 0.06], color: '#7f93c4', vary: 0 })
    }
    // upper cabinets, a clock
    const cab = ctx.theme.cabinet ?? '#5f87a3'
    for (const [x0, x1] of s.cabinets ?? []) {
      P.box(x1 - x0, 0.75, 0.42, { at: [(x0 + x1) / 2, 1.95, front + 0.21], paint: byFace(cab, cab, { sideFn: (p, n, out) => out.copy(colour(Math.abs(((p.x + 100) % 0.5) - 0.25) > 0.235 ? '#3f5d73' : cab)) }) })
    }
    P.cyl(0.17, 0.17, 0.04, 12, { at: [s.clockX ?? 3.8, 2.0, front + 0.02], rot: [Math.PI / 2, 0, 0], color: '#f4efe6' })
    P.box(0.015, 0.11, 0.01, { at: [s.clockX ?? 3.8, 2.04, front + 0.045], color: '#2a2a30' })
    P.box(0.08, 0.015, 0.01, { at: [(s.clockX ?? 3.8) + 0.03, 2.0, front + 0.045], color: '#2a2a30' })
  },
  partition: (P, g, s) => {
    P.box(s.w, s.h, s.d, { at: [s.x, s.h / 2, s.z], paint: byFace('#cdbfa9', '#e6dac8') })
    P.box(s.w + 0.04, 0.05, s.d + 0.04, { at: [s.x, s.h, s.z], color: '#f2eadf' })
  },
  fridge: (P, g, s) => {
    P.box(s.w, s.h, s.d, { at: [s.x, s.h / 2, s.z], paint: byFace('#e3e8ed', '#e9eef2', { sideFn: (p, n, out) => out.copy(colour(Math.abs(p.y - s.h * 0.66) < 0.015 ? '#9aa4ad' : '#e9eef2')) }) })
    const front = s.z + s.d / 2 + 0.02
    P.box(0.05, 0.5, 0.05, { at: [s.x + s.w / 2 - 0.15, s.h * 0.82, front], color: '#a9b3bc' })
    P.box(0.05, 0.7, 0.05, { at: [s.x + s.w / 2 - 0.15, s.h * 0.4, front], color: '#a9b3bc' })
    const mags = ['#ff6b6b', '#ffd166', '#5fd0a5', '#6fa8ff']
    for (let k = 0; k < 5; k++) P.box(0.09, 0.09, 0.02, { at: [s.x - 0.35 + (k % 3) * 0.2, s.h * 0.48 + Math.floor(k / 3) * 0.25, front - 0.005], color: mags[k % 4] })
  },
  washer: (P, g, s) => {
    P.box(s.w - 0.04, s.h, s.d - 0.04, { at: [s.x, s.h / 2, s.z], color: '#eef1f4' })
    const front = s.z + s.d / 2 - 0.01
    P.torus(0.26, 0.04, { at: [s.x, s.h * 0.45, front], color: '#b7c0c9' })
    P.cyl(0.24, 0.24, 0.02, 12, { at: [s.x, s.h * 0.45, front - 0.005], rot: [Math.PI / 2, 0, 0], color: s.dryer ? '#4a5560' : '#3a6f9a' })
    P.box(s.w - 0.1, 0.12, 0.03, { at: [s.x, s.h - 0.08, front], color: '#c9d0d7' })
  },
  tunnel: (P, g, s, base, ctx) => {
    P.box(s.w, s.h, s.d, {
      at: [s.x, s.h / 2, s.z],
      paint: (p, n, out) => {
        const v = noise3(p.x * 0.8, p.y * 0.8, 3, 21)
        out.copy(colour(pick(['#3b4048', '#424750', '#4a4f58'], v)))
        if (p.y < 0.35 && hash3(Math.floor(p.x * 4), Math.floor(p.y * 6), 0, 2) < 0.4) out.copy(colour('#3f5a35'))
        out.multiplyScalar(n.z > 0.5 ? 1 : 0.75)
      },
    })
    const front = s.z + s.d / 2
    for (let x = s.x - s.w / 2 + 1; x < s.x + s.w / 2; x += 2) P.box(0.3, s.h, 0.16, { at: [x, s.h / 2, front + 0.08], color: '#4c525b' })
    P.cyl(0.18, 0.18, s.w, 8, { at: [s.x, s.h - 0.35, front + 0.3], rot: [0, 0, Math.PI / 2], color: '#5d5148' })
    P.cyl(0.1, 0.1, s.w, 6, { at: [s.x, s.h - 0.75, front + 0.22], rot: [0, 0, Math.PI / 2], color: '#6b4f42' })
    void ctx
  },
  rail: (P, g, s) => {
    P.box(s.w, s.h, s.d, { at: [s.x, s.h / 2, s.z], color: '#4b5058' })
    P.box(s.w, 0.04, 0.04, { at: [s.x, s.h + 0.25, s.z], color: '#8b929b' })
    for (let x = s.x - s.w / 2 + 0.5; x < s.x + s.w / 2; x += 1) P.box(0.04, 0.25, 0.04, { at: [x, s.h + 0.12, s.z], color: '#7d848d' })
  },
  channel: (P, g, s) => {
    const z0 = s.z - s.d / 2
    const z1 = s.z + s.d / 2
    const x0 = s.x - s.w / 2
    const x1 = s.x + s.w / 2
    const wall = '#363a41'
    for (let x = x0; x < x1 - 1e-3; x += 1) {
      const xe = Math.min(x1, x + 1)
      vquad(P, x, z0, xe, z0, 0, s.h, wall, 0.06) // north wall, facing +z
      vquad(P, xe, z1, x, z1, 0, s.h, wall, 0.06) // south wall, facing -z
      P.box(xe - x, 0.03, 0.06, { at: [(x + xe) / 2, -0.015, z0 + 0.03], color: '#5a5f68' })
      P.box(xe - x, 0.03, 0.06, { at: [(x + xe) / 2, -0.015, z1 - 0.03], color: '#5a5f68' })
    }
    quad(P, [x0, s.h, z0], [x0, s.h, z1], [x1, s.h, z1], [x1, s.h, z0], '#22262c', 0)
  },
  gap: (P, g, s, base, ctx) => {
    if (ctx.theme.ground === null || ctx.theme.base === 'none') return
    const x0 = s.x - s.w / 2
    const x1 = s.x + s.w / 2
    const z0 = s.z - s.d / 2
    const z1 = s.z + s.d / 2
    const deep = -1.6
    const c = '#383c43'
    vquad(P, x1, z0, x0, z0, 0, deep, c, 0.1)
    vquad(P, x0, z1, x1, z1, 0, deep, c, 0.1)
    vquad(P, x0, z0, x0, z1, 0, deep, c, 0.1)
    vquad(P, x1, z1, x1, z0, 0, deep, c, 0.1)
    quad(P, [x0, deep, z0], [x0, deep, z1], [x1, deep, z1], [x1, deep, z0], '#101216', 0)
    for (let k = 0; k < 7; k++)
      P.ico(0.12 + ctx.rand() * 0.14, 0, { at: [x0 + ctx.rand() * s.w, deep + 0.1, z0 + ctx.rand() * s.d], color: '#4a4f57', vary: 0.15 })
  },
  rubble: (P, g, s, base, ctx) => {
    for (let k = 0; k < 7; k++) {
      const x = s.x + (ctx.rand() - 0.5) * s.w * 0.8
      const z = s.z + (ctx.rand() - 0.5) * s.d * 0.8
      P.box(0.3 + ctx.rand() * 0.3, 0.2 + ctx.rand() * 0.3, 0.3 + ctx.rand() * 0.25, { at: [x, 0.12 + (k % 3) * 0.18, z], rot: [ctx.rand() * 0.4, ctx.rand() * 3, ctx.rand() * 0.4], color: '#5c616a', vary: 0.12 })
    }
    P.cyl(0.14, 0.14, 0.9, 7, { at: [s.x, s.h - 0.15, s.z], rot: [0.2, 0, 1.2], color: '#6b4f42' })
  },
  shelter: (P, g, s, base, ctx) => {
    P.box(s.w, s.h, s.d, {
      at: [s.x, s.h / 2, s.z],
      paint: byFace('#7c4b42', '#e8d5b5', { sideFn: (p, n, out) => out.copy(colour(p.y < 0.4 ? '#b9a07f' : Math.floor((p.y + 100) / 0.2) % 2 ? '#e8d5b5' : '#e1cca9')) }),
    })
    P.box(s.w + 0.3, 0.16, s.d + 0.45, { at: [s.x, s.h + 0.08, s.z + 0.1], color: '#7c4b42' })
    const front = s.z + s.d / 2
    windowsOn(P, g, ctx, { x0: s.x - s.w / 2 + 0.3, x1: s.x + s.w / 2 - 2.5, z: front, y0: 0.9, y1: s.h - 0.1, lit: 0.85, w: 0.7, h: 0.75, gapX: 1.6, gapY: 3, warm: '#ffcf7a' })
    // the door, with a heart sign over it
    const dx = s.doorX ?? 6.75
    P.box(1.1, 1.9, 0.08, { at: [dx, 0.9 + 0.95, front + 0.03], color: '#6f8f6a' })
    g.box(0.5, 0.5, 0.02, { at: [dx, 2.35, front + 0.08], color: '#ffd28a', vary: 0 })
    P.box(1.7, 0.5, 0.06, { at: [dx, 3.1, front + 0.06], color: '#f4ead6' })
    const heart = colour('#e8475b').clone().multiplyScalar(1.3)
    const hy = 3.1
    const hz = front + 0.1
    P.tri([dx - 0.16, hy + 0.06, hz], [dx, hy - 0.16, hz], [dx + 0.16, hy + 0.06, hz], heart)
    P.tri([dx - 0.16, hy + 0.06, hz], [dx - 0.08, hy + 0.14, hz], [dx, hy + 0.06, hz], heart)
    P.tri([dx, hy + 0.06, hz], [dx + 0.08, hy + 0.14, hz], [dx + 0.16, hy + 0.06, hz], heart)
  },
  post: (P, g, s, base, ctx) => {
    P.cyl(0.05, 0.07, s.h, 6, { at: [s.x, s.h / 2, s.z], color: '#2f343c' })
    P.box(0.5, 0.05, 0.05, { at: [s.x + 0.2, s.h - 0.05, s.z], color: '#2f343c' })
    P.cone(0.2, 0.18, 6, { at: [s.x + 0.42, s.h - 0.12, s.z], color: '#2f343c' })
    g.ico(0.09, 0, { at: [s.x + 0.42, s.h - 0.24, s.z], color: '#ffe2a0', vary: 0 })
    ctx.lights.push({ x: s.x + 0.42, y: s.h - 0.35, z: s.z, color: '#ffc979', intensity: 6, distance: 6 })
    ctx.glowColours.push([s.x + 0.42, s.h - 0.24, s.z])
  },
  barrow: (P, g, s) => {
    P.add(new THREE.CylinderGeometry(0.62, 0.42, 0.32, 4, 1), { at: [s.x, s.h - 0.2, s.z], rot: [0, Math.PI / 4, 0], scale: [0.85, 1, 1.25], color: '#3f7fb5' })
    P.cyl(0.18, 0.18, 0.08, 10, { at: [s.x, 0.18, s.z + s.d / 2 - 0.15], rot: [0, 0, Math.PI / 2], color: '#2d2f33' })
    for (const sx of [-1, 1]) P.box(0.05, 0.05, 0.9, { at: [s.x + sx * 0.25, 0.4, s.z - 0.3], rot: [0.25, 0, 0], color: '#7a5537' })
  },
  puddle: (P, g, s, base, ctx) => {
    const y = base + 0.014
    const n = 11
    const pts = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU
      const r = s.r * (0.86 + ctx.rand() * 0.2)
      pts.push([s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r])
    }
    const water = ctx.theme.puddle ?? '#8fb0cc'
    const centre = [s.x, y, s.z]
    for (let k = 0; k < n; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % n]
      const shine = k === 2 || k === 3 ? 1.25 : k === 7 ? 1.12 : 1
      P.tri(centre, b, a, colour(water).clone().multiplyScalar(shine * (0.95 + ctx.rand() * 0.1)))
    }
  },
  spill: (P, g, s, base, ctx) => {
    const y = base + 0.012
    const x0 = s.x - s.w / 2
    const x1 = s.x + s.w / 2
    const z0 = s.z - s.d / 2
    const z1 = s.z + s.d / 2
    const steps = Math.ceil(s.d / 0.5)
    for (let k = 0; k < steps; k++) {
      const za = z0 + (k / steps) * s.d
      const zb = z0 + ((k + 1) / steps) * s.d
      const wob = () => (ctx.rand() - 0.5) * 0.12
      quad(P, [x0 + wob(), y, za], [x0 + wob(), y, zb], [x1 + wob(), y, zb], [x1 + wob(), y, za], k % 3 === 1 ? '#b9d4e6' : '#a6c5dc', 0.03)
    }
  },
}

function pallet(P, s) {
  const along = s.w >= s.d ? 'x' : 'z'
  const top = byFace('#c49a63', '#8f6c45', { topFn: plankTop(along === 'x' ? 'x' : 'z', 0.2, ['#c49a63', '#b88e58', '#cfa56d']) })
  P.box(s.w, 0.06, s.d, { at: [s.x, s.h - 0.03, s.z], paint: top })
  const n = Math.max(2, Math.round((along === 'x' ? s.w : s.d) / 1.2))
  for (let k = 0; k <= n; k++) {
    const u = -0.5 + k / n
    const at = along === 'x' ? [s.x + u * (s.w - 0.2), (s.h - 0.06) / 2, s.z] : [s.x, (s.h - 0.06) / 2, s.z + u * (s.d - 0.2)]
    P.box(along === 'x' ? 0.14 : s.w * 0.8, s.h - 0.06, along === 'x' ? s.d * 0.8 : 0.14, { at, color: '#7f5f3d' })
  }
}

// ---- decorations: no footprint, just charm -----------------------------------------------
const FLOWERS = ['#ff6b8a', '#ffd166', '#ff9f5a', '#f2f2f2', '#ff85c0', '#7fd1ff']

const DECOR = {
  flowers: (P, g, d, ctx) => {
    for (let k = 0; k < (d.n ?? 5); k++) {
      const x = d.x + (ctx.rand() - 0.5) * 0.9
      const z = d.z + (ctx.rand() - 0.5) * 0.35
      const y = ctx.yAt(x, z)
      const h = 0.14 + ctx.rand() * 0.18
      P.cyl(0.008, 0.012, h, 3, { at: [x, y + h / 2, z], color: '#4f8f3f', vary: 0 })
      P.ico(0.05 + ctx.rand() * 0.02, 0, { at: [x, y + h, z], color: FLOWERS[Math.floor(ctx.rand() * FLOWERS.length)], vary: 0.06 })
      P.ico(0.02, 0, { at: [x, y + h + 0.03, z], color: '#ffe066', vary: 0 })
      P.cone(0.04, 0.09, 3, { at: [x + 0.03, y + 0.05, z], rot: [0, ctx.rand() * 3, 0.7], color: '#5c9c47' })
    }
  },
  tufts: (P, g, d, ctx) => {
    const grid = ctx.grid
    let placed = 0
    for (let k = 0; k < (d.n ?? 30) * 6 && placed < (d.n ?? 30); k++) {
      const x = grid.x0 + ctx.rand() * grid.width
      const z = grid.z0 + ctx.rand() * grid.depth
      const i = grid.index(x, z)
      if (!grid.standable(i) || Math.abs(grid.h[i]) > 1e-3) continue
      placed++
      for (let b = 0; b < 3; b++)
        P.cone(0.022, 0.1 + ctx.rand() * 0.08, 3, { at: [x + (b - 1) * 0.03, 0.05, z + (ctx.rand() - 0.5) * 0.04], rot: [(ctx.rand() - 0.5) * 0.5, 0, (b - 1) * 0.35], color: pick(['#5e9a45', '#6aa84f', '#78b558'], ctx.rand()), vary: 0.05 })
    }
  },
  stones: (P, g, d, ctx) => {
    for (const [x, z] of d.path) P.cyl(0.24, 0.26, 0.04, 7, { at: [x, 0.02, z], rot: [0, ctx.rand() * 3, 0], color: pick(['#b8b2a6', '#a9a397', '#c4beb2'], ctx.rand()), vary: 0.05 })
  },
  rock: (P, g, d, ctx) => P.ico(d.r ?? 0.22, 0, { at: [d.x, ctx.yAt(d.x, d.z) + 0.06, d.z], scale: [1.2, 0.7, 1], rot: [0, ctx.rand() * 3, 0], color: '#9a9ea6', vary: 0.12 }),
  hose: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    for (let k = 0; k < 3; k++) P.torus(0.2 - k * 0.04, 0.025, { at: [d.x, y + 0.03 + k * 0.03, d.z], rot: [Math.PI / 2, 0, 0], color: '#3f9b4f' })
    P.box(0.5, 0.025, 0.025, { at: [d.x - 0.45, y + 0.02, d.z - 0.25], rot: [0, 0.6, 0], color: '#3f9b4f' })
  },
  gnome: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.07, 0.09, 0.16, 6, { at: [d.x, y + 0.08, d.z], color: '#3d6fb6' })
    P.ico(0.055, 0, { at: [d.x, y + 0.2, d.z], color: '#f2c6a8' })
    P.cone(0.05, 0.1, 5, { at: [d.x, y + 0.17, d.z + 0.04], rot: [Math.PI, 0, 0], color: '#f4f1ea' })
    P.cone(0.065, 0.16, 6, { at: [d.x, y + 0.31, d.z], color: '#d8433a' })
  },
  pot: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.13, 0.1, 0.2, 7, { at: [d.x, y + 0.1, d.z], color: '#c2673f' })
    for (let k = 0; k < 4; k++) P.ico(0.09, 0, { at: [d.x + (ctx.rand() - 0.5) * 0.14, y + 0.27 + ctx.rand() * 0.08, d.z + (ctx.rand() - 0.5) * 0.14], color: '#5aa04a', vary: 0.1 })
  },
  antenna: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.02, 0.025, 1.4, 4, { at: [d.x, y + 0.7, d.z], color: '#8a9099' })
    for (const [h, w] of [[1.1, 0.6], [1.3, 0.45], [0.9, 0.5]]) P.box(w, 0.02, 0.02, { at: [d.x, y + h, d.z], color: '#8a9099' })
    g.ico(0.03, 0, { at: [d.x, y + 1.42, d.z], color: '#ff4d4d', vary: 0 })
  },
  vent: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.11, 0.11, 0.35, 7, { at: [d.x, y + 0.17, d.z], color: '#9aa1aa' })
    P.cone(0.18, 0.12, 7, { at: [d.x, y + 0.42, d.z], color: '#7c838c' })
  },
  clothesline: (P, g, d, ctx) => {
    const [ax, az] = d.from
    const [bx, bz] = d.to
    const ya = ctx.yAt(ax, az)
    const yb = ctx.yAt(bx, bz)
    const top = Math.max(ya, yb) + d.h
    P.cyl(0.035, 0.04, top - ya, 5, { at: [ax, (top + ya) / 2, az], color: '#6b5444' })
    P.cyl(0.035, 0.04, top - yb, 5, { at: [bx, (top + yb) / 2, bz], color: '#6b5444' })
    const len = Math.hypot(bx - ax, bz - az)
    P.box(len, 0.012, 0.012, { at: [(ax + bx) / 2, top - 0.02, (az + bz) / 2], rot: [0, -Math.atan2(bz - az, bx - ax), 0], color: '#e8e2d6' })
    // a few pegs and a forgotten sock
    for (let k = 1; k < 4; k++) {
      const t = k / 4
      P.box(0.02, 0.05, 0.015, { at: [ax + (bx - ax) * t, top - 0.04, az + (bz - az) * t], color: pick(['#ff6b6b', '#ffd166', '#6fa8ff'], ctx.rand()) })
    }
    P.box(0.08, 0.16, 0.02, { at: [ax + (bx - ax) * 0.8, top - 0.12, az + (bz - az) * 0.8], color: '#ff8fa3' })
  },
  umbrella: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.025, 0.025, 1.5, 5, { at: [d.x, y + 0.75, d.z], color: '#e8e2d6' })
    P.add(new THREE.ConeGeometry(0.75, 0.32, 8, 1, true), {
      at: [d.x, y + 1.55, d.z],
      paint: (p, n, out) => out.copy(colour(Math.floor(((Math.atan2(p.z - d.z, p.x - d.x) + Math.PI) / TAU) * 8 + 0.5) % 2 ? '#e8475b' : '#f6f1e7')),
    })
  },
  stringlights: (P, g, d, ctx) => {
    const [ax, ay, az] = d.from
    const [bx, by, bz] = d.to
    const n = d.n ?? 9
    let prev = null
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      const y = ay + (by - ay) * t - Math.sin(t * Math.PI) * (d.sag ?? 0.35)
      if (prev) {
        const len = Math.hypot(x - prev[0], y - prev[1], z - prev[2])
        const mid = [(x + prev[0]) / 2, (y + prev[1]) / 2, (z + prev[2]) / 2]
        const dir = new THREE.Vector3(x - prev[0], y - prev[1], z - prev[2]).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        const e = new THREE.Euler().setFromQuaternion(q)
        P.cyl(0.006, 0.006, len, 3, { at: mid, rot: [e.x, e.y, e.z], color: '#2b2b30', vary: 0 })
      }
      if (k > 0 && k < n) g.ico(0.035, 0, { at: [x, y - 0.04, z], color: pick(['#ffd27a', '#ff9f7a', '#fff1b8', '#9fe0ff'], ctx.rand()), vary: 0 })
      prev = [x, y, z]
    }
  },
  rug: (P, g, d) => {
    const y = 0.008
    for (let k = 0; k < 6; k++) {
      const z0 = d.z - d.d / 2 + (k / 6) * d.d
      const z1 = d.z - d.d / 2 + ((k + 1) / 6) * d.d
      quad(P, [d.x - d.w / 2, y, z0], [d.x - d.w / 2, y, z1], [d.x + d.w / 2, y, z1], [d.x + d.w / 2, y, z0], k % 2 ? '#c8574b' : '#e9c46a', 0.02)
    }
  },
  lamp: (P, g, d, ctx) => {
    const top = d.top ?? 2.6
    P.cyl(0.008, 0.008, top - d.y, 3, { at: [d.x, (top + d.y) / 2 + 0.15, d.z], color: '#2b2b30', vary: 0 })
    P.add(new THREE.ConeGeometry(0.28, 0.24, 8, 1, true), { at: [d.x, d.y + 0.12, d.z], color: '#2f6b5a', flip: false })
    P.add(new THREE.ConeGeometry(0.28, 0.24, 8, 1, true), { at: [d.x, d.y + 0.12, d.z], color: '#1d3f36', flip: true })
    g.ico(0.07, 0, { at: [d.x, d.y + 0.02, d.z], color: '#ffe7b0', vary: 0 })
    ctx.lights.push({ x: d.x, y: d.y - 0.1, z: d.z, color: d.color ?? '#ffc477', intensity: d.intensity ?? 7, distance: d.distance ?? 7 })
  },
  lantern: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.box(0.16, 0.03, 0.16, { at: [d.x, y + 0.015, d.z], color: '#2f343c' })
    P.box(0.16, 0.03, 0.16, { at: [d.x, y + 0.3, d.z], color: '#2f343c' })
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.02, 0.28, 0.02, { at: [d.x + sx * 0.07, y + 0.16, d.z + sz * 0.07], color: '#2f343c' })
    g.ico(0.06, 0, { at: [d.x, y + 0.16, d.z], color: '#ffd28a', vary: 0 })
    P.torus(0.05, 0.01, { at: [d.x, y + 0.36, d.z], color: '#2f343c' })
    ctx.lights.push({ x: d.x, y: y + 0.35, z: d.z, color: '#ffb865', intensity: d.intensity ?? 5, distance: d.distance ?? 5 })
  },
  jars: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    const cols = ['#e7a24a', '#d1d8de', '#c95f4a', '#9cc58a']
    for (let k = 0; k < (d.n ?? 3); k++) {
      const h = 0.14 + ctx.rand() * 0.1
      P.cyl(0.055, 0.055, h, 7, { at: [d.x + k * 0.15, y + h / 2, d.z], color: cols[k % cols.length] })
      P.cyl(0.058, 0.058, 0.03, 7, { at: [d.x + k * 0.15, y + h + 0.015, d.z], color: '#6e5a4a' })
    }
  },
  fruit: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.2, 0.12, 0.08, 8, { at: [d.x, y + 0.04, d.z], color: '#e8e2d6' })
    const cols = ['#f2a33a', '#d8433a', '#f2d13a', '#7fbf4f']
    for (let k = 0; k < 5; k++) P.ico(0.06, 0, { at: [d.x + (ctx.rand() - 0.5) * 0.2, y + 0.11 + (k > 3 ? 0.06 : 0), d.z + (ctx.rand() - 0.5) * 0.2], color: cols[k % 4] })
  },
  bowl: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.14, 0.1, 0.07, 9, { at: [d.x, y + 0.035, d.z], color: d.color ?? '#e05a4f' })
    for (let k = 0; k < 6; k++) P.octa(0.025, { at: [d.x + (ctx.rand() - 0.5) * 0.12, y + 0.075, d.z + (ctx.rand() - 0.5) * 0.12], color: '#8a5a33' })
  },
  laundry: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.32, 0.26, 0.4, 9, { at: [d.x, y + 0.2, d.z], color: '#f0ece4' })
    for (let k = 0; k < 5; k++) P.ico(0.14, 0, { at: [d.x + (ctx.rand() - 0.5) * 0.3, y + 0.4 + ctx.rand() * 0.06, d.z + (ctx.rand() - 0.5) * 0.3], scale: [1, 0.5, 1], color: pick(['#6fa8ff', '#ff8fa3', '#ffd166', '#9be08a'], ctx.rand()) })
  },
  crates: (P, g, d, ctx) => {
    for (let k = 0; k < (d.n ?? 3); k++) {
      const s = 0.4 + ctx.rand() * 0.15
      P.box(s, s, s, { at: [d.x + (k % 2) * 0.5 - 0.25, ctx.yAt(d.x, d.z) + s / 2 + Math.floor(k / 2) * 0.48, d.z + (ctx.rand() - 0.5) * 0.2], rot: [0, ctx.rand() * 0.6, 0], color: pick(['#a77b4f', '#946b43'], ctx.rand()) })
    }
  },
  bin: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.cyl(0.22, 0.19, 0.6, 9, { at: [d.x, y + 0.3, d.z], color: '#4f6b5a' })
    P.cyl(0.24, 0.24, 0.05, 9, { at: [d.x, y + 0.62, d.z], color: '#3d5547' })
  },
  shaft: (P, g, d, ctx) => {
    ctx.shafts.push(d)
    // a pale pool of light where it lands
    const y = ctx.yAt(d.x, d.z) + 0.01
    const n = 10
    const c = colour('#8fb6ff').clone().multiplyScalar(0.3)
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU
      const a1 = ((k + 1) / n) * TAU
      g.tri([d.x, y, d.z], [d.x + Math.cos(a1) * 0.55, y, d.z + Math.sin(a1) * 0.55], [d.x + Math.cos(a0) * 0.55, y, d.z + Math.sin(a0) * 0.55], c)
    }
  },
  sign: (P, g, d, ctx) => {
    const y = ctx.yAt(d.x, d.z)
    P.box(0.06, 0.7, 0.06, { at: [d.x, y + 0.35, d.z], color: '#7a5537' })
    P.box(0.6, 0.3, 0.04, { at: [d.x, y + 0.72, d.z + 0.03], rot: [0, 0, (ctx.rand() - 0.5) * 0.1], color: '#efe2c4' })
  },
}

// ---- the whole static level ------------------------------------------------------------
export function buildStatic(def, grid, theme, rand) {
  const P = new Poly(rand)
  const glow = new Poly(rand)
  const ctx = {
    grid,
    theme,
    rand,
    lights: [],
    shafts: [],
    glowColours: [],
    yAt: (x, z) => {
      const i = grid.index(x, z)
      if (i < 0) return 0
      return grid.standable(i) ? grid.h[i] : Math.max(grid.h[i], 0)
    },
  }
  buildGround(P, ctx)
  buildBase(P, ctx)
  for (const s of def.shapes) {
    const make = SHAPES[s.k]
    if (!make) continue
    make(P, glow, s, s.base ?? 0, ctx)
  }
  for (const d of def.decor ?? []) DECOR[d.k]?.(P, glow, d, ctx)

  const group = new THREE.Group()
  group.add(P.mesh(MAT.flat))
  if (!glow.empty) group.add(glow.mesh(MAT.glow, { cast: false, receive: false }))
  if (ctx.shafts.length) group.add(makeShafts(ctx.shafts, ctx))
  return { group, lights: ctx.lights }
}

// Light falling through a grate: brightest face-on and near the top, fading
// out at the edges and toward the floor, so it reads as a beam, not a tube.
const shaftMaterial = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color('#9cc2ff') }, strength: { value: 0.55 } },
  vertexShader: /* glsl */ `
    varying float vUp;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUp = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float strength;
    varying float vUp;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float facing = abs(dot(normalize(vNormal), normalize(vView)));
      float a = pow(facing, 2.2) * mix(0.15, 1.0, vUp) * strength;
      gl_FragColor = vec4(color * a, 1.0);
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
shaftMaterial.userData.shared = true

function makeShafts(list, ctx) {
  const group = new THREE.Group()
  for (const d of list) {
    const y = ctx.yAt(d.x, d.z)
    const h = d.h ?? 4
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.62, h, 12, 1, true), shaftMaterial)
    mesh.position.set(d.x, y + h / 2, d.z)
    mesh.renderOrder = 5
    group.add(mesh)
  }
  return group
}

// ---- meshes for things that move -----------------------------------------------------------
function meshOf(P, material = MAT.flat, cast = true) {
  const m = new THREE.Mesh(P.build(), material)
  m.castShadow = cast
  m.receiveShadow = true
  return m
}

// A cardboard box with its flaps open. `size` 1 holds one kitten, 2 holds two.
export function makeBoxMesh(size = 1, seed = 1) {
  const P = new Poly(makeRng(seed))
  const w = size > 1 ? 0.94 : 0.68
  const d = 0.6
  const h = size > 1 ? 0.34 : 0.32
  const t = 0.022
  const outside = '#c8955a'
  const inside = '#9e6f3e'
  const card = (p, n, out) => {
    // faces pointing toward the middle are the inside of the box
    const inward = n.x * p.x + n.z * p.z < 0
    out.copy(colour(inward ? inside : outside))
    if (n.y > 0.5) out.copy(colour('#b98549'))
  }
  P.box(w, t, d, { at: [0, t / 2, 0], color: inside })
  P.box(w, h, t, { at: [0, h / 2, d / 2 - t / 2], paint: card })
  P.box(w, h, t, { at: [0, h / 2, -d / 2 + t / 2], paint: card })
  P.box(t, h, d, { at: [w / 2 - t / 2, h / 2, 0], paint: card })
  P.box(t, h, d, { at: [-w / 2 + t / 2, h / 2, 0], paint: card })
  // flaps, flopped open at slightly different angles
  const flap = (fw, fd, at, rot) => P.box(fw, t * 0.8, fd, { at, rot, paint: card })
  flap(w, d * 0.48, [0, h + 0.1, d / 2 + 0.11], [1.0, 0, 0])
  flap(w, d * 0.48, [0, h + 0.09, -d / 2 - 0.1], [-1.15, 0, 0])
  flap(d * 0.48, d, [w / 2 + 0.1, h + 0.08, 0], [0, 0, -1.25])
  flap(d * 0.48, d, [-w / 2 - 0.1, h + 0.1, 0], [0, 0, 1.0])
  // packing tape
  P.box(w * 0.3, 0.004, 0.06, { at: [0.05, h + 0.115, d / 2 + 0.11], rot: [1.0, 0, 0], color: '#e9d9a6' })
  const group = new THREE.Group()
  group.add(meshOf(P))
  return { group, height: h, half: Math.max(w, d) / 2, w, d }
}

export function makeBasketMesh() {
  const P = new Poly(makeRng(5))
  const r1 = 0.66
  const r0 = 0.55
  const h = 0.34
  const weave = (p, n, out) => {
    const a = Math.atan2(p.z, p.x)
    const band = Math.floor((p.y + 1) / (h / 3))
    const k = (Math.floor(((a + Math.PI) / TAU) * 14) + band) & 1
    out.copy(colour(k ? '#d7a35c' : '#bf8a45'))
  }
  P.add(new THREE.CylinderGeometry(r1, r0, h, 14, 3, true), { at: [0, h / 2, 0], paint: weave, vary: 0.04 })
  P.add(new THREE.CylinderGeometry(r1 - 0.03, r0 - 0.03, h, 14, 1, true), { at: [0, h / 2, 0], color: '#9a6a34', flip: true })
  P.cyl(r0, r0, 0.04, 14, { at: [0, 0.02, 0], color: '#a97436' })
  P.torus(r1, 0.045, { at: [0, h, 0], rot: [Math.PI / 2, 0, 0], color: '#8f5f2c' })
  // cushion
  P.cyl(r0 - 0.04, r0 - 0.02, 0.1, 12, { at: [0, 0.08, 0], paint: (p, n, out) => out.copy(colour((Math.floor((p.x + 5) / 0.12) + Math.floor((p.z + 5) / 0.12)) & 1 ? '#e8707a' : '#f6d5d8')) })
  // a little flag that says home
  P.cyl(0.015, 0.015, 0.9, 4, { at: [r1 - 0.05, h + 0.45, -0.2], color: '#7a5537' })
  const flag = new Poly(makeRng(6))
  const heart = colour('#ff4d64').clone().multiplyScalar(1.15)
  const fx = r1 - 0.05
  const fy = h + 0.78
  flag.tri([fx, fy + 0.1, -0.2], [fx, fy - 0.12, -0.2], [fx + 0.36, fy - 0.01, -0.2], colour('#f6f1e7'))
  flag.tri([fx + 0.36, fy - 0.01, -0.2], [fx, fy - 0.12, -0.2], [fx, fy + 0.1, -0.2], colour('#f6f1e7'))
  flag.tri([fx + 0.08, fy + 0.02, -0.195], [fx + 0.15, fy - 0.06, -0.195], [fx + 0.22, fy + 0.02, -0.195], heart)
  flag.tri([fx + 0.22, fy + 0.02, -0.205], [fx + 0.15, fy - 0.06, -0.205], [fx + 0.08, fy + 0.02, -0.205], heart)
  const group = new THREE.Group()
  group.add(meshOf(P))
  const flagMesh = meshOf(flag, MAT.flat, false)
  group.add(flagMesh)
  // a soft glowing ring on the ground that says "here"
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.1, 40, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.6), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  ring.renderOrder = 3
  group.add(ring)
  return { group, ring, flag: flagMesh, radius: r1, height: h }
}

export function makeVacuumMesh() {
  const P = new Poly(makeRng(9))
  P.cyl(0.34, 0.35, 0.09, 18, { at: [0, 0.065, 0], paint: byFace('#3a3f47', '#2b2f35', { topFn: (p, n, out) => out.copy(colour(Math.hypot(p.x, p.z) < 0.2 ? '#4b525c' : '#3a3f47')) }) })
  P.torus(0.33, 0.025, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1], color: '#1d2025' })
  P.cyl(0.06, 0.06, 0.02, 8, { at: [0.12, 0.115, 0.18], color: '#5b636e' })
  const glow = new Poly(makeRng(10))
  glow.cyl(0.03, 0.03, 0.012, 8, { at: [0, 0.116, 0.24], color: '#53f3ff', vary: 0 })
  const brush = new Poly(makeRng(11))
  for (let k = 0; k < 3; k++) brush.box(0.16, 0.008, 0.015, { at: [0.08 * Math.cos((k / 3) * TAU), 0, 0.08 * Math.sin((k / 3) * TAU)], rot: [0, -(k / 3) * TAU, 0], color: '#c9a646' })
  const group = new THREE.Group()
  group.add(meshOf(P))
  const led = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3, 3, 3) }))
  group.add(led)
  const brushMesh = meshOf(brush, MAT.flat, false)
  brushMesh.position.set(0.24, 0.02, 0.22)
  group.add(brushMesh)
  return { group, brush: brushMesh, led }
}

export function makeFlutterMesh(kind = 'butterfly', seed = 3) {
  const rng = makeRng(seed)
  const cols = kind === 'moth' ? ['#d9cbb0', '#bfae8e', '#f2e6cc'] : rng.pick([['#ff8a3d', '#2b2523', '#ffd166'], ['#5fb8ff', '#1e2a44', '#bfe6ff'], ['#ffd23f', '#2b2523', '#fff4b8']])
  const body = new Poly(rng)
  body.cyl(0.012, 0.008, 0.12, 4, { at: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: '#2b2523' })
  const wing = (side) => {
    const W = new Poly(rng)
    const s = side
    const glowK = kind === 'moth' ? 1.4 : 1.15
    const a = colour(cols[0]).clone().multiplyScalar(glowK)
    const b = colour(cols[2]).clone().multiplyScalar(glowK)
    const e = colour(cols[1])
    W.tri([0, 0, 0.03], [s * 0.15, 0, 0.09], [s * 0.13, 0, -0.01], a)
    W.tri([0, 0, 0.03], [s * 0.13, 0, -0.01], [s * 0.15, 0, 0.09], a)
    W.tri([s * 0.1, 0, 0.065], [s * 0.15, 0, 0.09], [s * 0.13, 0, 0.04], e)
    W.tri([s * 0.1, 0, 0.065], [s * 0.13, 0, 0.04], [s * 0.15, 0, 0.09], e)
    W.tri([0, 0, 0], [s * 0.1, 0, -0.01], [s * 0.07, 0, -0.08], b)
    W.tri([0, 0, 0], [s * 0.07, 0, -0.08], [s * 0.1, 0, -0.01], b)
    const m = new THREE.Mesh(W.build(), MAT.glow)
    return m
  }
  const group = new THREE.Group()
  const bodyMesh = new THREE.Mesh(body.build(), MAT.flat)
  const wingL = wing(1)
  const wingR = wing(-1)
  group.add(bodyMesh, wingL, wingR)
  group.scale.setScalar(kind === 'moth' ? 1.3 : 1.5)
  return { group, wingL, wingR }
}

export function makeCupMesh() {
  const P = new Poly(makeRng(12))
  P.cyl(0.06, 0.052, 0.12, 8, { at: [0, 0.06, 0], paint: (p, n, out) => out.copy(colour(n.y > 0.5 ? '#3b2a20' : p.y > 0.085 ? '#ffffff' : '#e8475b')) })
  P.torus(0.035, 0.01, { at: [0.068, 0.06, 0], scale: [1, 1, 1], color: '#e8475b' })
  return meshOf(P)
}

export function makePedalMesh() {
  const P = new Poly(makeRng(13))
  P.box(0.4, 0.04, 0.4, { at: [0, 0.02, 0], color: '#d9dde2' })
  P.cyl(0.12, 0.13, 0.04, 10, { at: [0, 0.055, 0], color: '#e8475b' })
  const g = new THREE.Group()
  const base = meshOf(P)
  g.add(base)
  return g
}

export function makeGateMesh(len, h, axis = 'z') {
  const P = new Poly(makeRng(14))
  const bars = Math.round(len / 0.11)
  for (let k = 0; k <= bars; k++) P.box(0.03, h - 0.08, 0.03, { at: [0, (h - 0.08) / 2 + 0.04, (k / bars - 0.5) * len], color: '#f4f2ee' })
  P.box(0.05, 0.05, len, { at: [0, h, 0], color: '#f4f2ee' })
  P.box(0.05, 0.05, len, { at: [0, 0.04, 0], color: '#f4f2ee' })
  P.box(0.07, 0.12, 0.12, { at: [0, h - 0.1, len / 2 - 0.08], color: '#e8475b' })
  const panel = meshOf(P)
  // hinge at one end, so it can swing open
  const pivot = new THREE.Group()
  panel.position.z = len / 2
  pivot.add(panel)
  pivot.position.z = -len / 2
  const group = new THREE.Group()
  group.add(pivot)
  if (axis === 'x') group.rotation.y = Math.PI / 2
  return { group, pivot }
}

export function makeHideoutMesh(kind, r = 0.6, seed = 1) {
  const rng = makeRng(seed)
  const P = new Poly(rng)
  const group = new THREE.Group()
  let peek = new THREE.Vector3(0, 0.2, r * 0.6)
  switch (kind) {
    case 'bush': {
      const greens = ['#3f7f3a', '#4a8c41', '#56994a', '#3a7334']
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + rng() * 0.5
        const d = k === 0 ? 0 : r * 0.5
        P.ico(r * (k === 0 ? 0.75 : 0.55), 1, {
          at: [Math.cos(a) * d, r * 0.5 + (k === 0 ? 0.15 : 0), Math.sin(a) * d],
          paint: (p, n, out) => {
            out.copy(colour(greens[Math.floor(rng() * greens.length)]))
            out.multiplyScalar(0.7 + 0.35 * (n.y * 0.5 + 0.5))
          },
        })
      }
      for (let k = 0; k < 5; k++) P.ico(0.035, 0, { at: [(rng() - 0.5) * r * 1.4, r * (0.5 + rng() * 0.6), (rng() - 0.5) * r * 1.4 + r * 0.3], color: '#ff7aa2' })
      peek = new THREE.Vector3(0, 0.22, r * 0.75)
      break
    }
    case 'crate': {
      const s = r * 1.6
      const slat = (p, n, out) => out.copy(colour(Math.floor((p.y + 5) / 0.11) % 2 ? '#b48552' : '#a3774a'))
      P.box(s, s * 0.8, s, { at: [0, s * 0.4, 0], paint: slat })
      P.box(s * 0.6, s * 0.42, 0.02, { at: [0, s * 0.25, s / 2 + 0.005], color: '#1b1714' })
      peek = new THREE.Vector3(0, s * 0.25, s / 2 + 0.02)
      break
    }
    case 'pipe': {
      P.torus(r * 0.7, r * 0.18, { at: [0, r * 0.7, 0.05], color: '#6b5a4c' })
      P.cyl(r * 0.62, r * 0.62, 0.02, 12, { at: [0, r * 0.7, 0.0], rot: [Math.PI / 2, 0, 0], color: '#0d0e10' })
      P.cyl(r * 0.85, r * 0.85, 0.3, 12, { at: [0, r * 0.7, -0.12], rot: [Math.PI / 2, 0, 0], color: '#5b4c40' })
      peek = new THREE.Vector3(0, r * 0.66, 0.03)
      break
    }
    case 'cupboard': {
      P.box(0.46, 0.7, 0.03, { at: [0.23, 0.42, 0], color: '#5f87a3' })
      P.box(0.04, 0.12, 0.03, { at: [0.4, 0.55, 0.02], color: '#d9dde2' })
      peek = new THREE.Vector3(-0.05, 0.25, 0.02)
      break
    }
    case 'kennel': {
      const w = r * 1.7
      P.box(w, w * 0.6, w * 0.9, { at: [0, w * 0.3, 0], color: '#6f9bc0' })
      P.add(new THREE.ConeGeometry(w * 0.8, w * 0.4, 4), { at: [0, w * 0.8, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.75], color: '#3d556e' })
      P.box(w * 0.45, w * 0.4, 0.02, { at: [0, w * 0.2, w * 0.45 + 0.005], color: '#111216' })
      peek = new THREE.Vector3(0, w * 0.2, w * 0.45 + 0.02)
      break
    }
  }
  const body = meshOf(P)
  group.add(body)
  // two eyes that glint in the dark while someone is hiding inside
  const E = new Poly(rng)
  for (const sx of [-1, 1]) E.ico(0.022, 0, { at: [peek.x + sx * 0.05, peek.y, peek.z], scale: [1, 1.3, 0.4], color: '#d8ff7a', vary: 0 })
  const eyes = new THREE.Mesh(E.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }))
  eyes.visible = false
  group.add(eyes)
  return { group, body, eyes }
}

export function makeFishMesh(seed = 1) {
  const P = new Poly(makeRng(seed))
  P.octa(0.07, { scale: [0.55, 0.45, 1.2], at: [0, 0.035, 0], color: '#f08a4b' })
  P.cone(0.05, 0.06, 3, { at: [0, 0.035, -0.11], rot: [-Math.PI / 2, 0, 0], color: '#e0703a' })
  P.ico(0.012, 0, { at: [0.02, 0.05, 0.05], color: '#1b1b1f', vary: 0 })
  return meshOf(P)
}

// Water that can rise over the whole level: faceted, gently heaving.
export function makeFloodMesh(width, depth, hex = '#5d8fa8') {
  const geo = new THREE.PlaneGeometry(width + 0.6, depth + 0.6, Math.round(width * 1.6), Math.round(depth * 1.6))
  geo.rotateX(-Math.PI / 2)
  const base = geo.attributes.position.array.slice()
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex).multiplyScalar(0.12), transparent: true, opacity: 0.8, flatShading: true, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 2
  mesh.receiveShadow = true
  return {
    mesh,
    update(t, level) {
      const pos = geo.attributes.position.array
      for (let i = 0; i < pos.length; i += 3) {
        const x = base[i]
        const z = base[i + 2]
        pos[i + 1] = level + Math.sin(x * 1.7 + t * 1.3) * 0.022 + Math.sin(z * 2.3 - t * 1.1 + x * 0.4) * 0.018
      }
      geo.attributes.position.needsUpdate = true
      geo.computeVertexNormals()
    },
  }
}

// The drain channel's water: a strip that flows along x, with foam flecks.
export function makeChannelWater(x0, x1, z0, z1, y, rand) {
  const len = x1 - x0
  const geo = new THREE.PlaneGeometry(len, z1 - z0, Math.round(len * 2), 3)
  geo.rotateX(-Math.PI / 2)
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  const base = geo.attributes.position.array.slice()
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#2f6474'), emissive: new THREE.Color('#0d2a33'), transparent: true, opacity: 0.88, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  const foam = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.2, 1.3) }), 46)
  const flecks = Array.from({ length: 46 }, () => ({ u: rand(), z: z0 + 0.08 + rand() * (z1 - z0 - 0.16), s: 0.5 + rand() * 0.8, k: 0.5 + rand() }))
  const m = new THREE.Matrix4()
  const group = new THREE.Group()
  group.add(mesh, foam)
  return {
    group,
    update(t) {
      const pos = geo.attributes.position.array
      for (let i = 0; i < pos.length; i += 3) pos[i + 1] = y + Math.sin(base[i] * 2.1 - t * 3) * 0.02 + Math.sin(base[i + 2] * 5 + t * 2) * 0.01
      geo.attributes.position.needsUpdate = true
      geo.computeVertexNormals()
      flecks.forEach((f, k) => {
        const x = x0 + (((f.u + t * 0.09 * f.k) % 1) + 1) % 1 * len
        m.makeScale(f.s, 1, f.s).setPosition(x, y + 0.025, f.z)
        foam.setMatrixAt(k, m)
      })
      foam.instanceMatrix.needsUpdate = true
    },
  }
}
