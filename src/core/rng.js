// Seeded randomness. A level, and every kitten in it, is built from a seed, so
// an adoption card can be drawn again later from nothing but its number.

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// rng() gives 0..1; the extras cover what the game keeps needing.
export function makeRng(seed) {
  const next = mulberry32(seed)
  const rng = () => next()
  rng.range = (a, b) => a + (b - a) * next()
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * next()) // both ends included
  rng.pick = (list) => list[Math.floor(next() * list.length)]
  rng.chance = (p) => next() < p
  rng.sign = () => (next() < 0.5 ? -1 : 1)
  rng.shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
  }
  return rng
}

export const newSeed = () => (Math.random() * 4294967296) >>> 0

// A whole-number grid point to 0..1.
export function hash3(x, y, z, seed = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 144665)) | 0
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Smooth value noise, 0..1. Used for coat patches and wobbly ground.
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const mix = (a, b, t) => a + (b - a) * t
  const x00 = mix(hash3(xi, yi, zi, seed), hash3(xi + 1, yi, zi, seed), u)
  const x10 = mix(hash3(xi, yi + 1, zi, seed), hash3(xi + 1, yi + 1, zi, seed), u)
  const x01 = mix(hash3(xi, yi, zi + 1, seed), hash3(xi + 1, yi, zi + 1, seed), u)
  const x11 = mix(hash3(xi, yi + 1, zi + 1, seed), hash3(xi + 1, yi + 1, zi + 1, seed), u)
  return mix(mix(x00, x10, v), mix(x01, x11, v), w)
}
