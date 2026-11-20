// Paper things for the menu, drawn on canvases: sheets with ragged edges and
// a little grain, words in marker handwriting, ticks and crosses that can be
// watched being drawn (and scribbled out), strips of tape, and cork. Anything
// a person wrote is in the handwriting; anything printed, like the adoption
// form on the back of a photo, is in the typewriter mono.
import { makeRng } from '../core/rng.js'

export const HAND = '"Gochi Hand", "Segoe Print", "Bradley Hand", cursive'
export const MONO = '"IBM Plex Mono", Consolas, monospace'
export const INK = '#1d1a17' // marker black
export const PAPER = '#f3ece0'
export const KRAFT = '#b88a5a'
export const SISAL = '#c9a978'

// The fonts download the first time they are asked for; paper drawn before
// they arrive is drawn again once they have.
export const fontsReady =
  typeof document !== 'undefined' && document.fonts
    ? Promise.all([document.fonts.load(`48px ${HAND}`), document.fonts.load(`24px ${MONO}`)]).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false)

export function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d') }
}

// A sheet with a slightly ragged edge (outside it the canvas stays clear), a
// little grain and the odd fibre. `outline` replaces the rectangle, as points.
export function sheet(g, w, h, { color = PAPER, seed = 1, edge = 2.5, inset = 6, grain = 0.05, outline = null } = {}) {
  const rng = makeRng(seed)
  g.clearRect(0, 0, w, h)
  const pts = outline ?? ragged(rng, inset, inset, w - inset, h - inset, edge)
  g.beginPath()
  g.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts) g.lineTo(x, y)
  g.closePath()
  g.fillStyle = color
  g.fill()
  g.save()
  g.clip()
  const dots = Math.round(w * h * 0.003)
  for (let i = 0; i < dots; i++) {
    const a = rng.range(0.015, grain)
    g.fillStyle = rng() < 0.55 ? `rgba(40, 28, 16, ${a})` : `rgba(255, 252, 245, ${a})`
    g.fillRect(rng() * w, rng() * h, rng.range(1, 2.5), rng.range(1, 2.5))
  }
  g.strokeStyle = 'rgba(80, 60, 40, 0.09)'
  g.lineWidth = 1
  for (let i = 0; i < 16; i++) {
    const x = rng() * w
    const y = rng() * h
    const a = rng() * Math.PI
    const l = rng.range(6, 18)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  g.restore()
}

// the corners of a rectangle with every edge nudged in and out a little
export function ragged(rng, x0, y0, x1, y1, edge, step = 16) {
  const pts = []
  for (let x = x0; x < x1; x += step) pts.push([x, y0 + rng.range(-edge, edge)])
  for (let y = y0; y < y1; y += step) pts.push([x1 + rng.range(-edge, edge), y])
  for (let x = x1; x > x0; x -= step) pts.push([x, y1 + rng.range(-edge, edge)])
  for (let y = y1; y > y0; y -= step) pts.push([x0 + rng.range(-edge, edge), y])
  return pts
}

// Words in marker, each a little off the line and turned, as if written fast.
// Returns how wide the line came out.
export function write(g, text, x, y, size, { seed = 1, color = INK, align = 'left', font = HAND, wobble = 1 } = {}) {
  const rng = makeRng(seed)
  g.font = `${size}px ${font}`
  g.fillStyle = color
  g.textBaseline = 'alphabetic'
  const words = String(text).split(' ')
  const space = g.measureText(' ').width
  const widths = words.map((w) => g.measureText(w).width)
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  words.forEach((word, i) => {
    g.save()
    g.translate(cx + widths[i] / 2, y + rng.range(-1, 1) * size * 0.035 * wobble)
    g.rotate(rng.range(-0.04, 0.04) * wobble)
    g.fillText(word, -widths[i] / 2, 0)
    g.restore()
    cx += widths[i] + space
  })
  return total
}

// split text into lines no wider than `max`, in the given font
export function wrap(g, text, max, font) {
  g.font = font
  const lines = []
  let line = ''
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && g.measureText(next).width > max) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// A marker stroke along one or more runs of points, drawn as far as `t`
// (0 to 1) of its whole length, so it can be watched going on.
export function draw(g, runs, t = 1, { width = 8, color = INK } = {}) {
  const lengths = runs.map((run) => run.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - run[i][0], p[1] - run[i][1]), 0))
  let left = lengths.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t))
  g.strokeStyle = color
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const run of runs) {
    if (left <= 0) break
    g.beginPath()
    g.moveTo(run[0][0], run[0][1])
    for (let i = 1; i < run.length && left > 0; i++) {
      const [ax, ay] = run[i - 1]
      const [bx, by] = run[i]
      const seg = Math.hypot(bx - ax, by - ay)
      const k = Math.min(1, left / seg)
      g.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k)
      left -= seg
    }
    g.stroke()
  }
}

// a tick, a cross and a scribble, as runs of points around (x, y), size s
export function tick(x, y, s, rng) {
  const j = () => rng.range(-0.05, 0.05) * s
  return [[[x - s * 0.5 + j(), y + j()], [x - s * 0.1 + j(), y + s * 0.42 + j()], [x + s * 0.55 + j(), y - s * 0.6 + j()]]]
}
export function cross(x, y, s, rng) {
  const j = () => rng.range(-0.06, 0.06) * s
  return [
    [[x - s * 0.45 + j(), y - s * 0.45 + j()], [x + s * 0.45 + j(), y + s * 0.45 + j()]],
    [[x + s * 0.45 + j(), y - s * 0.48 + j()], [x - s * 0.42 + j(), y + s * 0.45 + j()]],
  ]
}
export function scribble(x, y, s, rng) {
  const run = []
  const n = 9
  for (let i = 0; i <= n; i++) {
    const side = i % 2 ? 1 : -1
    run.push([x + side * s * rng.range(0.5, 0.7), y - s * 0.55 + (i / n) * s * 1.1 + rng.range(-0.06, 0.06) * s])
  }
  return [run]
}

// A strip of see-through tape with torn ends, centred on (x, y).
export function tape(g, x, y, w, h, angle, seed = 1) {
  const rng = makeRng(seed)
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.beginPath()
  const teeth = 5
  g.moveTo(-w / 2, -h / 2)
  g.lineTo(w / 2, -h / 2)
  for (let i = 1; i <= teeth; i++) g.lineTo(w / 2 + (i % 2 ? rng.range(2, 5) : 0), -h / 2 + (h * i) / teeth)
  g.lineTo(-w / 2, h / 2)
  for (let i = teeth - 1; i >= 0; i--) g.lineTo(-w / 2 - (i % 2 ? rng.range(2, 5) : 0), -h / 2 + (h * i) / teeth)
  g.closePath()
  g.fillStyle = 'rgba(243, 236, 224, 0.62)'
  g.fill()
  g.strokeStyle = 'rgba(29, 26, 23, 0.12)'
  g.lineWidth = 1
  g.stroke()
  g.restore()
}

// Cork: warm brown, flecked lighter and darker, with the odd old pin hole.
export function cork(g, w, h, seed = 7) {
  const rng = makeRng(seed)
  g.fillStyle = KRAFT
  g.fillRect(0, 0, w, h)
  const flecks = Math.round(w * h * 0.02)
  for (let i = 0; i < flecks; i++) {
    const r = rng()
    g.fillStyle = r < 0.45 ? `rgba(92, 62, 34, ${rng.range(0.15, 0.4)})` : r < 0.85 ? `rgba(214, 178, 128, ${rng.range(0.15, 0.45)})` : `rgba(60, 40, 22, 0.5)`
    const s = rng.range(1, 3.2)
    g.fillRect(rng() * w, rng() * h, s, s * rng.range(0.6, 1.4))
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(40, 26, 14, 0.55)'
    g.beginPath()
    g.arc(rng() * w, rng() * h, rng.range(1.2, 2.2), 0, Math.PI * 2)
    g.fill()
  }
}
