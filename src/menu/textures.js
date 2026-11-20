// Surfaces for the menu's set, painted on canvases once: sisal rope wound
// round the post (with a normal map, so the coils catch the light), carpet
// for the cap, and corrugated kraft cardboard for the box, with its print and
// someone's marker scribbles.
import * as THREE from 'three'
import { makeRng } from '../core/rng.js'
import { canvas, write, draw, HAND, INK, KRAFT } from './paper.js'
import { strings } from '../strings.js'

const hex = (c) => new THREE.Color(c)
const mix = (a, b, t) => a + (b - a) * t
const frac = (x) => x - Math.floor(x)

function texture(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  return t
}

// Sisal rope: tight horizontal coils, each a little rounded, twisted from
// strands, with stray fibres. One tile holds eight coils and wraps both ways.
// Returns a colour map and a normal map for the same tile.
export function rope({ size = 512, coils = 8, seed = 3 } = {}) {
  const rng = makeRng(seed)
  const W = size
  const H = size
  const pitch = H / coils
  const height = new Float32Array(W * H)
  const fibre = new Float32Array(W * H)
  // loose fibres: short random scratches of lighter or darker strand
  for (let i = 0; i < W * H * 0.0009; i++) {
    const x = rng() * W
    const y = rng() * H
    const a = rng.range(-0.5, 0.5) + 0.5
    const len = rng.range(4, 12)
    const tone = rng.range(-1, 1)
    for (let s = 0; s < len; s++) {
      const px = Math.floor(x + Math.cos(a) * s + W) % W
      const py = Math.floor(y + Math.sin(a) * s + H) % H
      fibre[py * W + px] = tone
    }
  }
  // strands twisting round each coil: diagonal ridges, alternating per coil.
  // Along a row the ridges repeat every 32 pixels, so each row works out one
  // repeat and copies it across.
  const ridge = new Float32Array(32)
  for (let y = 0; y < H; y++) {
    const coil = Math.floor(y / pitch)
    const round = Math.pow(Math.sin(Math.PI * frac(y / pitch)), 0.55) // the coil's rounded back
    const shift = y * 1.5 * (coil % 2 ? 1 : -1) + coil * 5
    for (let j = 0; j < 32; j++) {
      const strand = Math.pow(Math.sin(Math.PI * frac((j * 0.5 + shift) / 16)), 0.6)
      ridge[j] = round * (0.72 + 0.28 * strand)
    }
    const row = y * W
    for (let x = 0; x < W; x++) height[row + x] = ridge[x % 32] + fibre[row + x] * 0.05
  }
  // grooves dark, crests light: the ramp from groove to crest is worked out
  // once as sRGB bytes and looked up per pixel. Darker than the pale fibre a
  // claw exposes, so the scratched words stand out.
  const deep = hex('#3e2c18')
  const base = hex('#8a6a42')
  const lit = hex('#b89a66')
  const STEPS = 1024
  const ramp = new Uint8ClampedArray(STEPS * 3)
  const srgb = (v) => Math.pow(v, 1 / 2.2) * 255
  for (let j = 0; j < STEPS; j++) {
    const t = j / (STEPS - 1)
    const [a, b, u] = t < 0.55 ? [deep, base, t / 0.55] : [base, lit, (t - 0.55) / 0.45]
    ramp[j * 3] = srgb(mix(a.r, b.r, u))
    ramp[j * 3 + 1] = srgb(mix(a.g, b.g, u))
    ramp[j * 3 + 2] = srgb(mix(a.b, b.b, u))
  }
  const c = canvas(W, H)
  const n = canvas(W, H)
  const ci = c.g.createImageData(W, H)
  const ni = n.g.createImageData(W, H)
  const cd = ci.data
  const nd = ni.data
  for (let y = 0; y < H; y++) {
    const row = y * W
    const above = ((y + H - 1) % H) * W
    const below = ((y + 1) % H) * W
    for (let x = 0; x < W; x++) {
      const i = row + x
      const k = i * 4
      // and a little grain
      const t = height[i] + (rng() - 0.5) * 0.06 + fibre[i] * 0.08
      const j = 3 * (t <= 0 ? 0 : t >= 1 ? STEPS - 1 : Math.round(t * (STEPS - 1)))
      cd[k] = ramp[j]
      cd[k + 1] = ramp[j + 1]
      cd[k + 2] = ramp[j + 2]
      cd[k + 3] = 255
      // normal from the height field (wrapping at the edges); canvas rows run
      // down, texture v runs up
      const left = x === 0 ? W - 1 : x - 1
      const right = x === W - 1 ? 0 : x + 1
      const nx = (height[row + left] - height[row + right]) * 3.2
      const ny = (height[below + x] - height[above + x]) * 3.2
      const s = 127.5 / Math.sqrt(nx * nx + ny * ny + 1)
      nd[k] = nx * s + 127.5
      nd[k + 1] = ny * s + 127.5
      nd[k + 2] = s + 127.5
      nd[k + 3] = 255
    }
  }
  c.g.putImageData(ci, 0, 0)
  n.g.putImageData(ni, 0, 0)
  return { map: texture(c.c), normalMap: texture(n.c, { srgb: false }) }
}

const bytes = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// A solid colour with thousands of tiny translucent flecks over it, blended
// straight into the pixels: far quicker than a fillRect (and a colour string)
// apiece. `flecks(put)` calls put(x, y, w, h, rgb, alpha) once per fleck, in
// order; a fleck's edges count for as much of a pixel as they cover.
function flecked(g, w, h, base, flecks) {
  const img = g.createImageData(w, h)
  const d = img.data
  // one pixel set by hand, then copied to the rest as whole 32-bit words
  ;[d[0], d[1], d[2]] = bytes(base)
  d[3] = 255
  const words = new Uint32Array(d.buffer)
  words.fill(words[0])
  flecks((x0, y0, fw, fh, rgb, a) => {
    const x1 = Math.min(w, x0 + fw)
    const y1 = Math.min(h, y0 + fh)
    for (let y = Math.floor(y0); y < y1; y++) {
      const cy = Math.min(y + 1, y1) - Math.max(y, y0)
      for (let x = Math.floor(x0); x < x1; x++) {
        const t = a * cy * (Math.min(x + 1, x1) - Math.max(x, x0))
        const k = (y * w + x) * 4
        d[k] += (rgb[0] - d[k]) * t
        d[k + 1] += (rgb[1] - d[k + 1]) * t
        d[k + 2] += (rgb[2] - d[k + 2]) * t
      }
    }
  })
  g.putImageData(img, 0, 0)
}

// Carpet for the cap: dense little loops of a darker kraft colour.
export function carpet({ size = 256, seed = 5 } = {}) {
  const rng = makeRng(seed)
  const { c, g } = canvas(size, size)
  const dark = [46, 31, 18]
  const light = [190, 150, 105]
  flecked(g, size, size, '#7d5c3c', (put) => {
    for (let i = 0; i < size * size * 0.18; i++) {
      const deep = rng() < 0.5
      const a = deep ? rng.range(0.2, 0.5) : rng.range(0.15, 0.45)
      put(rng() * size, rng() * size, rng.range(1, 2.2), rng.range(1, 2.2), deep ? dark : light, a)
    }
  })
  return texture(c)
}

// Corrugated kraft: faint ribs, paper grain, the edges a little darker where
// the box has been handled. `paint` draws on top (print, scribbles).
export function cardboard({ w = 512, h = 300, seed = 9, inside = false, paint = null } = {}) {
  const rng = makeRng(seed)
  const { c, g } = canvas(w, h)
  const rib = [60, 40, 20]
  const dark = [70, 46, 24]
  const light = [230, 200, 150]
  flecked(g, w, h, inside ? '#8a643e' : KRAFT, (put) => {
    for (let x = 0; x < w; x += 7) put(x, 0, 3, h, rib, 0.035 + rng() * 0.02)
    for (let i = 0; i < w * h * 0.012; i++) {
      const deep = rng() < 0.5
      const a = deep ? rng.range(0.05, 0.18) : rng.range(0.05, 0.16)
      put(rng() * w, rng() * h, rng.range(1, 2.5), rng.range(1, 2.5), deep ? dark : light, a)
    }
  })
  // handled edges
  const edge = g.createLinearGradient(0, 0, 0, h)
  edge.addColorStop(0, 'rgba(60, 38, 18, 0.18)')
  edge.addColorStop(0.08, 'rgba(60, 38, 18, 0)')
  edge.addColorStop(0.92, 'rgba(60, 38, 18, 0)')
  edge.addColorStop(1, 'rgba(60, 38, 18, 0.22)')
  g.fillStyle = edge
  g.fillRect(0, 0, w, h)
  paint?.(g, w, h, rng)
  return texture(c)
}

// The box's front: "this side up" and its arrows, printed in worn black along
// the top, above the sticky note (the calico sits in front of the other end).
export function printUp(g, w, h, rng) {
  g.save()
  g.globalAlpha = 0.8
  g.fillStyle = INK
  g.font = `600 ${Math.round(h * 0.075)}px "IBM Plex Mono", Consolas, monospace`
  g.textAlign = 'left'
  const x0 = w * 0.09
  const base = h * 0.135
  g.fillText(strings.box.up, x0, base)
  const end = x0 + g.measureText(strings.box.up).width
  // two arrows, pointing up
  for (const x of [end + 22, end + 50]) {
    g.beginPath()
    g.moveTo(x, base - h * 0.085)
    g.lineTo(x - 10, base - h * 0.03)
    g.lineTo(x - 4, base - h * 0.03)
    g.lineTo(x - 4, base + h * 0.01)
    g.lineTo(x + 4, base + h * 0.01)
    g.lineTo(x + 4, base - h * 0.03)
    g.lineTo(x + 10, base - h * 0.03)
    g.closePath()
    g.fill()
  }
  // worn print: flecks of cardboard showing through
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 220; i++) g.fillRect(x0 + rng() * (end + 70 - x0), base - h * 0.09 + rng() * h * 0.11, rng.range(1, 3), rng.range(1, 3))
  g.restore()
}

// The box's side: somebody's old marker notes, one crossed out, and a doodle.
export function scribbles(g, w, h, rng) {
  const word = strings.box.scribble
  write(g, word, w * 0.18, h * 0.34, h * 0.16, { seed: 91 })
  g.font = `${h * 0.16}px ${HAND}`
  const len = g.measureText(word).width
  draw(g, [[[w * 0.16, h * 0.3], [w * 0.18 + len + 6, h * 0.27]], [[w * 0.17, h * 0.25], [w * 0.18 + len + 4, h * 0.33]]], 1, { width: 4, color: INK })
  // a fish, the way a kitten would draw it if it could
  const fx = w * 0.62
  const fy = h * 0.62
  draw(
    g,
    [
      [[fx - 40, fy], [fx - 10, fy - 22], [fx + 30, fy - 4], [fx + 50, fy - 18], [fx + 46, fy + 4], [fx + 52, fy + 22], [fx + 30, fy + 6], [fx - 10, fy + 22], [fx - 40, fy]],
      [[fx - 22, fy - 4], [fx - 20, fy - 2]],
    ],
    1,
    { width: 4, color: INK },
  )
  write(g, '?', w * 0.82, h * 0.42, h * 0.14, { seed: 92 })
}
