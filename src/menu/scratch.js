// Words scratched into rope by claws. Every letter is a few straight swipes
// (a claw cannot draw a curve), and every swipe leaves three or four parallel
// marks with ragged ends: pale where the fibre underneath shows, with a dark
// edge where the rope is torn. The marks are seeded from the word itself, so
// a word gets the same scratches on every visit.
import { makeRng } from '../core/rng.js'

export const FIBRE = '#e9d9b8' // the pale inside of a sisal strand
const TORN = 'rgba(24, 16, 9, 0.6)'

// Letters as swipes in a box one unit tall: x across, y up from the
// baseline. Lowercase stands 0.62 high, capitals and ascenders 1, and
// descenders drop to -0.3. Each entry is [advance, swipes]: a swipe is a run
// of points "x y, x y, ..." and swipes are split by "|".
const GLYPHS = {
  a: [0.5, '0.44 0.6, 0.46 0 | 0.44 0.5, 0.08 0.46, 0.05 0.1, 0.44 0.06'],
  b: [0.5, '0.06 1, 0.06 0 | 0.06 0.48, 0.42 0.56, 0.47 0.12, 0.06 0.02'],
  c: [0.46, '0.44 0.56, 0.08 0.52, 0.04 0.1, 0.44 0.03'],
  d: [0.5, '0.44 1, 0.46 0 | 0.44 0.5, 0.08 0.54, 0.04 0.1, 0.44 0.03'],
  e: [0.5, '0.05 0.3, 0.46 0.33, 0.4 0.58, 0.08 0.56, 0.04 0.12, 0.44 0.02'],
  f: [0.36, '0.18 0, 0.2 0.86, 0.36 0.98 | 0.02 0.6, 0.34 0.62'],
  g: [0.5, '0.44 0.6, 0.46 -0.18, 0.1 -0.3 | 0.44 0.52, 0.08 0.56, 0.04 0.18, 0.44 0.16'],
  h: [0.5, '0.06 1, 0.06 0 | 0.06 0.46, 0.42 0.6, 0.46 0'],
  i: [0.2, '0.1 0.6, 0.1 0 | 0.08 0.84, 0.13 0.94'],
  j: [0.3, '0.24 0.6, 0.24 -0.18, 0.02 -0.3 | 0.22 0.84, 0.27 0.94'],
  k: [0.48, '0.06 1, 0.06 0 | 0.44 0.62, 0.06 0.26 | 0.18 0.36, 0.47 0'],
  l: [0.2, '0.08 1, 0.12 0'],
  m: [0.72, '0.05 0.6, 0.05 0 | 0.05 0.46, 0.32 0.6, 0.36 0 | 0.36 0.46, 0.64 0.6, 0.68 0'],
  n: [0.5, '0.06 0.6, 0.06 0 | 0.06 0.46, 0.42 0.6, 0.46 0'],
  o: [0.5, '0.26 0.62, 0.04 0.36, 0.2 0, 0.46 0.28, 0.26 0.62'],
  p: [0.5, '0.06 0.6, 0.06 -0.3 | 0.06 0.52, 0.42 0.6, 0.47 0.14, 0.06 0.06'],
  q: [0.5, '0.44 0.6, 0.44 -0.3 | 0.44 0.52, 0.08 0.6, 0.03 0.14, 0.44 0.06'],
  r: [0.38, '0.06 0.6, 0.06 0 | 0.06 0.42, 0.36 0.62'],
  s: [0.46, '0.42 0.58, 0.06 0.54, 0.08 0.34, 0.4 0.28, 0.42 0.06, 0.03 0.03'],
  t: [0.38, '0.16 0.92, 0.18 0.04, 0.36 0.04 | 0.02 0.6, 0.36 0.62'],
  u: [0.5, '0.06 0.6, 0.07 0.06, 0.44 0.12 | 0.44 0.6, 0.46 0'],
  v: [0.5, '0.02 0.6, 0.25 0, 0.48 0.6'],
  w: [0.7, '0 0.6, 0.17 0, 0.35 0.46, 0.52 0, 0.7 0.6'],
  x: [0.5, '0.03 0.6, 0.47 0 | 0.47 0.6, 0.03 0'],
  y: [0.5, '0.03 0.6, 0.26 0.06 | 0.47 0.6, 0.12 -0.3'],
  z: [0.48, '0.04 0.6, 0.44 0.62, 0.04 0.02, 0.46 0'],
  A: [0.62, '0.02 0, 0.31 1, 0.6 0 | 0.14 0.38, 0.48 0.4'],
  B: [0.56, '0.06 1, 0.06 0 | 0.06 1, 0.44 0.94, 0.46 0.6, 0.06 0.52 | 0.06 0.52, 0.5 0.46, 0.52 0.08, 0.06 0'],
  C: [0.56, '0.52 0.92, 0.12 0.96, 0.04 0.1, 0.52 0.04'],
  D: [0.6, '0.06 1, 0.06 0 | 0.06 1, 0.42 0.94, 0.58 0.5, 0.44 0.06, 0.06 0'],
  E: [0.5, '0.48 1, 0.06 1, 0.06 0, 0.48 0 | 0.06 0.52, 0.4 0.52'],
  F: [0.48, '0.48 1, 0.06 1, 0.06 0 | 0.06 0.54, 0.4 0.54'],
  G: [0.6, '0.54 0.9, 0.12 0.96, 0.04 0.1, 0.52 0.04, 0.56 0.42, 0.3 0.44'],
  H: [0.6, '0.06 1, 0.06 0 | 0.54 1, 0.54 0 | 0.06 0.5, 0.54 0.52'],
  I: [0.24, '0.12 1, 0.12 0'],
  J: [0.44, '0.38 1, 0.38 0.1, 0.02 0.04'],
  K: [0.56, '0.06 1, 0.06 0 | 0.52 1, 0.06 0.42 | 0.2 0.54, 0.56 0'],
  L: [0.46, '0.06 1, 0.06 0, 0.46 0'],
  M: [0.76, '0.04 0, 0.08 1, 0.38 0.4, 0.68 1, 0.72 0'],
  N: [0.62, '0.06 0, 0.06 1, 0.56 0, 0.56 1'],
  O: [0.64, '0.32 1, 0.04 0.52, 0.3 0, 0.6 0.48, 0.32 1'],
  P: [0.54, '0.06 0, 0.06 1, 0.48 0.94, 0.5 0.56, 0.06 0.48'],
  Q: [0.64, '0.32 1, 0.04 0.52, 0.3 0, 0.6 0.48, 0.32 1 | 0.36 0.24, 0.64 -0.06'],
  R: [0.56, '0.06 0, 0.06 1, 0.48 0.94, 0.5 0.58, 0.06 0.5 | 0.22 0.52, 0.56 0'],
  S: [0.52, '0.48 0.94, 0.08 0.92, 0.06 0.56, 0.46 0.46, 0.48 0.08, 0.04 0.04'],
  T: [0.58, '0.02 1, 0.56 1 | 0.29 1, 0.29 0'],
  U: [0.6, '0.06 1, 0.08 0.06, 0.52 0.04, 0.54 1'],
  V: [0.6, '0.02 1, 0.3 0, 0.58 1'],
  W: [0.82, '0 1, 0.2 0, 0.41 0.6, 0.62 0, 0.82 1'],
  X: [0.58, '0.03 1, 0.55 0 | 0.55 1, 0.03 0'],
  Y: [0.58, '0.03 1, 0.29 0.5, 0.55 1 | 0.29 0.5, 0.29 0'],
  Z: [0.56, '0.04 1, 0.52 1, 0.04 0, 0.54 0'],
  0: [0.5, '0.25 1, 0.04 0.5, 0.25 0, 0.46 0.5, 0.25 1'],
  1: [0.36, '0.1 0.8, 0.28 1, 0.28 0'],
  2: [0.5, '0.06 0.86, 0.3 1, 0.46 0.8, 0.04 0, 0.48 0'],
  3: [0.48, '0.04 0.94, 0.44 0.96, 0.2 0.56, 0.46 0.4, 0.4 0.04, 0.02 0.06'],
  4: [0.52, '0.36 0, 0.36 1, 0.02 0.32, 0.5 0.32'],
  5: [0.48, '0.46 1, 0.08 1, 0.06 0.56, 0.42 0.52, 0.44 0.06, 0.02 0.04'],
  6: [0.48, '0.42 0.96, 0.08 0.6, 0.06 0.06, 0.44 0.06, 0.44 0.5, 0.08 0.5'],
  7: [0.48, '0.04 1, 0.48 1, 0.16 0'],
  8: [0.5, '0.25 1, 0.06 0.76, 0.44 0.3, 0.25 0, 0.06 0.3, 0.44 0.76, 0.25 1'],
  9: [0.48, '0.42 0.5, 0.06 0.5, 0.06 0.94, 0.44 0.94, 0.42 0.4, 0.1 0'],
  '?': [0.44, '0.06 0.82, 0.24 1, 0.42 0.82, 0.22 0.5, 0.22 0.28 | 0.2 0.08, 0.24 0'],
  '!': [0.2, '0.11 1, 0.1 0.3 | 0.09 0.08, 0.12 0'],
  '.': [0.2, '0.08 0.08, 0.12 0'],
  ',': [0.2, '0.12 0.08, 0.06 -0.14'],
  "'": [0.16, '0.08 1, 0.06 0.76'],
  '’': [0.16, '0.08 1, 0.06 0.76'],
  '-': [0.36, '0.04 0.32, 0.32 0.34'],
  ':': [0.2, '0.08 0.52, 0.12 0.44 | 0.08 0.08, 0.12 0'],
  ' ': [0.32, ''],
}
const parsed = {}
function glyph(ch) {
  if (parsed[ch]) return parsed[ch]
  const [adv, src] = GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS['?']
  const swipes = src ? src.split('|').map((run) => run.split(',').map((p) => p.trim().split(/\s+/).map(Number))) : []
  return (parsed[ch] = { adv, swipes })
}

// a number from the text, so the same word always gets the same marks
function seedOf(text, salt = 0) {
  let h = 2166136261 ^ salt
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619)
  return h >>> 0
}

const MARGIN = 0.24 // room round the letters for spread claws and loose fibres, in em
const TOP = 1 // ascenders and capitals
const BOTTOM = -0.3 // descenders
const TRACK = 0.13 // between letters, so neighbouring claw marks don't run together

// Scratch a word onto a transparent canvas.
//   size: pixels per em; tilt: the whole word turned, in radians (anticlockwise);
//   hole: the index of a letter to leave as a torn hole instead (the dot in "Dot").
// Returns the canvas, its size in em, and the hole's middle in em from the
// canvas middle (x right, y up), or null.
export function scratchWord(text, { size = 192, tilt = 0, hole = -1, seed = 0 } = {}) {
  const rng = makeRng(seedOf(text, seed))
  const chars = [...text]
  // lay the letters out along a line, each a little off true
  let x = 0
  const placed = chars.map((ch, i) => {
    const g = glyph(ch)
    const at = { ch, g, x, dy: rng.range(-0.025, 0.025), turn: rng.range(-0.05, 0.05), scale: rng.range(0.97, 1.04), hole: i === hole }
    x += g.adv * at.scale + TRACK
    return at
  })
  const width = Math.max(0.2, x - TRACK)
  const height = TOP - BOTTOM
  const w = width + MARGIN * 2
  const h = height + MARGIN * 2
  const cos = Math.abs(Math.cos(tilt))
  const sin = Math.abs(Math.sin(tilt))
  const W = w * cos + h * sin
  const H = w * sin + h * cos

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * size)
  canvas.height = Math.ceil(H * size)
  const g = canvas.getContext('2d')
  g.translate(canvas.width / 2, canvas.height / 2)
  g.rotate(-tilt)
  g.scale(size, size)
  // from here on: em units, the word's middle at 0,0 and y down
  const ox = -width / 2
  const base = height / 2 + BOTTOM // the baseline, measured down from the middle
  const toCanvas = (at, px, py) => {
    const c = Math.cos(at.turn)
    const s = Math.sin(at.turn)
    const lx = (px - at.g.adv / 2) * at.scale
    const ly = (py - 0.31) * at.scale
    return [ox + at.x + (at.g.adv * at.scale) / 2 + lx * c - ly * s, base - (0.31 + at.dy + lx * s + ly * c)]
  }

  let holeAt = null
  for (const at of placed) {
    if (at.hole) {
      const [cx, cy] = toCanvas(at, at.g.adv / 2, 0.31)
      tornHole(g, rng, cx, cy, 0.3 * at.scale)
      // back to unturned em, y up, from the canvas middle
      const c = Math.cos(tilt)
      const s = Math.sin(tilt)
      holeAt = { x: cx * c + cy * s, y: -(-cx * s + cy * c) }
      continue
    }
    for (const run of at.g.swipes) {
      for (let k = 1; k < run.length; k++) {
        const a = toCanvas(at, run[k - 1][0] + rng.range(-0.02, 0.02), run[k - 1][1] + rng.range(-0.02, 0.02))
        const b = toCanvas(at, run[k][0] + rng.range(-0.02, 0.02), run[k][1] + rng.range(-0.02, 0.02))
        swipe(g, rng, a, b)
      }
    }
  }
  return { canvas, w: canvas.width / size, h: canvas.height / size, holeAt }
}

// Tally marks, one clawed stroke per finished rescue: four down, then the
// fifth across them. `last` (0 to 1) draws the newest stroke only part of the
// way, so it can be watched being clawed in. Returns the canvas and its size
// in em.
export function scratchTally(count, { size = 192, last = 1, seed = 11 } = {}) {
  const rng = makeRng(seed)
  const W = 1.55
  const H = 1.35
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * size)
  canvas.height = Math.ceil(H * size)
  const g = canvas.getContext('2d')
  g.scale(size, size)
  const strokes = []
  for (let i = 0; i < count; i++) {
    const group = Math.floor(i / 5)
    const k = i % 5
    const x = 0.24 + group * 1.3 + k * 0.27
    const j = () => rng.range(-0.03, 0.03)
    if (k < 4) strokes.push([[x + j(), 0.18 + j()], [x + 0.07 + j(), 1.12 + j()]])
    else strokes.push([[0.08 + group * 1.3 + j(), 0.45 + j()], [1.2 + group * 1.3 + j(), 0.9 + j()]])
  }
  strokes.forEach(([a, b], i) => {
    const t = i === strokes.length - 1 ? Math.max(0, Math.min(1, last)) : 1
    if (t > 0.02) swipe(g, rng, a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  })
  return { canvas, w: W, h: H }
}

// One swipe of a paw: three or four claws side by side, the middle ones
// reaching a little further, each starting and stopping at its own point.
function swipe(g, rng, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) return
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  // wide marks with thin gaps: a solid stroke from across the yard, separate claws up close
  const n = len < 0.16 ? 2 : rng() < 0.85 ? 3 : 4
  const gap = rng.range(0.05, 0.06)
  for (let i = 0; i < n; i++) {
    const side = i - (n - 1) / 2
    const reach = 1 - Math.abs(side) / n // the middle claws go furthest
    const off = side * gap + rng.range(-0.005, 0.005)
    const s0 = rng.range(-0.02, 0.04) - reach * 0.015
    const s1 = rng.range(-0.015, 0.05) - reach * 0.02
    mark(
      g,
      rng,
      ax + nx * off + ux * s0,
      ay + ny * off + uy * s0,
      bx + nx * off - ux * s1,
      by + ny * off - uy * s1,
      rng.range(0.03, 0.04),
    )
  }
}

// One claw mark: thin where the claw went in, widest just after, tapering and
// fraying where it dragged out. A dark torn edge sits under the pale fibre.
function mark(g, rng, x0, y0, x1, y1, w) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  if (len < 1e-4) return
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const nx = -uy
  const ny = ux
  const steps = Math.max(4, Math.ceil(len / 0.035))
  const left = []
  const right = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const taper = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.35)
    const half = (w / 2) * (0.3 + 0.7 * taper)
    const wob = (rng() - 0.5) * w * 0.4
    const px = x0 + (x1 - x0) * t + nx * wob
    const py = y0 + (y1 - y0) * t + ny * wob
    left.push([px + nx * half, py + ny * half])
    right.push([px - nx * half, py - ny * half])
  }
  const shape = (dx, dy) => {
    g.beginPath()
    g.moveTo(left[0][0] + dx, left[0][1] + dy)
    for (const [px, py] of left) g.lineTo(px + dx, py + dy)
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0] + dx, right[i][1] + dy)
    g.closePath()
    g.fill()
  }
  g.fillStyle = TORN
  shape(w * 0.35, w * 0.45)
  g.fillStyle = FIBRE
  shape(0, 0)
  // loose fibres pulled out at the end of the drag
  g.strokeStyle = FIBRE
  g.lineCap = 'round'
  const loose = 1 + Math.floor(rng() * 3)
  for (let f = 0; f < loose; f++) {
    const a = rng.range(-0.7, 0.7)
    const c = Math.cos(a)
    const s = Math.sin(a)
    const fl = w * rng.range(1.2, 3.2)
    g.lineWidth = w * rng.range(0.15, 0.3)
    g.beginPath()
    g.moveTo(x1 - ux * w, y1 - uy * w)
    g.lineTo(x1 + (ux * c - uy * s) * fl, y1 + (uy * c + ux * s) * fl)
    g.stroke()
  }
}

// Where the rope has been clawed right through: a dark pit ringed with torn,
// pale fibres sticking out every which way. The dot sits in it.
function tornHole(g, rng, cx, cy, r) {
  const pit = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.05)
  pit.addColorStop(0, 'rgba(14, 9, 5, 0.78)')
  pit.addColorStop(0.7, 'rgba(20, 13, 7, 0.55)')
  pit.addColorStop(1, 'rgba(20, 13, 7, 0)')
  g.fillStyle = pit
  g.beginPath()
  g.arc(cx, cy, r * 1.05, 0, Math.PI * 2)
  g.fill()
  g.lineCap = 'round'
  const strands = 34
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2 + rng.range(-0.08, 0.08)
    const r0 = r * rng.range(0.62, 0.9)
    const r1 = r * rng.range(1.02, 1.5)
    const bend = rng.range(-0.25, 0.25)
    const c0 = Math.cos(a)
    const s0 = Math.sin(a)
    const c1 = Math.cos(a + bend)
    const s1 = Math.sin(a + bend)
    g.strokeStyle = TORN
    g.lineWidth = rng.range(0.012, 0.022)
    g.beginPath()
    g.moveTo(cx + c0 * r0 + 0.006, cy + s0 * r0 + 0.008)
    g.lineTo(cx + c1 * r1 + 0.006, cy + s1 * r1 + 0.008)
    g.stroke()
    g.strokeStyle = FIBRE
    g.beginPath()
    g.moveTo(cx + c0 * r0, cy + s0 * r0)
    g.lineTo(cx + c1 * r1, cy + s1 * r1)
    g.stroke()
  }
}
