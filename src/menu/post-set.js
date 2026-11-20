// The menu's set: a sisal rope post standing in an open cardboard box, a
// carpet cap, a red feather toy on a string with the settings tag tucked
// behind the feather, a sticky note on the box and a corkboard leaning
// against it (see corkboard.js). The words are clawed into the rope
// (scratch.js) on strips that follow the post's curve, unless lettering.js
// lists a scan. Paper is drawn by paper.js, the other surfaces by textures.js.
// Everything is in the set's own space: the post stands on the origin and +z
// faces the camera.
import * as THREE from 'three'
import { makeRng } from '../core/rng.js'
import { clamp, damp, easeInOut, easeOut, smooth } from '../core/mathx.js'
import { strings } from '../strings.js'
import { scratchWord, scratchTally } from './scratch.js'
import { LETTERING } from './lettering.js'
import { Board } from './corkboard.js'
import { canvas, sheet, write, wrap, draw, tick, cross, scribble, HAND, INK, KRAFT } from './paper.js'
import { mat, paper, canvasTexture, hitMesh } from './bits.js'
import { rope, carpet, cardboard, printUp, scribbles } from './textures.js'

export const POST = { r: 0.35, bottom: 0.03, top: 3.48, capR: 0.6, capH: 0.08 }
export const BOX = { w: 1.34, d: 1.12, h: 0.74, wall: 0.025 }
const NOTE = 0.52
const TAG = { w: 0.52, h: 0.37 }
const TAG_PX = { w: 560, h: 400, hole: 44 } // the tag's canvas; the string goes through the hole
// the scratches give off a little light of their own, so they read on the shaded side too
const WORD_GLOW = 0.3
const STRING = '#e9dcc0'
const FEATHER = '#ff2a2a' // laser red: the toy is something you can click
const COIL = 0.03 // how thick the rope is: eight coils to a texture tile

// the words: size (em, in world units), height, angle round the post, tilt
const WORDS = {
  play: { text: strings.menu.play, em: 0.25, y: 2.33, phi: -0.06, tilt: 0.06 },
  cards: { text: strings.menu.cards, em: 0.19, y: 1.88, phi: 0.13, tilt: -0.07 },
  help: { text: strings.menu.help, em: 0.19, y: 1.45, phi: -0.1, tilt: 0.05 },
}
const TALLY = { em: 0.2, y: 0.98, phi: -0.42 } // low on the rope, front left, below "how?"
const TITLE_Y = [3.2, 2.97, 2.74]
const TITLE_EM = [0.21, 0.21, 0.16]
const ROWS = ['sound', 'music', 'pretty']

const UP = new THREE.Vector3(0, 1, 0)
const _d = new THREE.Vector3()
const _top = new THREE.Vector3()
const _flip = new THREE.Quaternion()

// a strip of the post's surface, centred on angle phi (0 faces the camera) and height y
function strip(w, h, phi, y, r) {
  const len = w / r
  const geo = new THREE.CylinderGeometry(r, r, h, Math.max(6, Math.ceil(len / 0.07)), 1, true, phi - len / 2, len)
  geo.translate(0, y, 0)
  return geo
}

// a point on the post's surface and the way it faces
function onPost(phi, y, r = POST.r) {
  return { p: new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r), n: new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)) }
}

function wordMaterial(map) {
  return new THREE.MeshLambertMaterial({
    map, transparent: true, depthWrite: false, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: WORD_GLOW,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
}

// a thin rod from its base, stretched between two points each frame
function rod(color, radius = 0.0045) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 5, 1)
  geo.translate(0, 0.5, 0)
  const m = new THREE.Mesh(geo, mat(color))
  m.castShadow = true
  return m
}
function stretch(mesh, a, b) {
  _d.subVectors(b, a)
  const len = _d.length()
  mesh.position.copy(a)
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len))
  mesh.scale.set(1, Math.max(len, 1e-4), 1)
}

// a texture seen from behind: flipped, so it reads the right way round
function backTexture(c) {
  const t = canvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.repeat.x = -1
  return t
}

// ---- the box ---------------------------------------------------------------
function buildBox(rng) {
  const { w, d, h, wall } = BOX
  const group = new THREE.Group()
  const kraft = (paint, seed, inside = false) => mat('#ffffff', { map: cardboard({ w: 512, h: Math.round((512 * h) / w), seed, inside, paint }) })
  const side = kraft(null, 11)
  const flapMat = kraft(null, 12)
  const meshes = []
  const panel = (sx, sy, sz, x, y, z, material = side) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = true
    group.add(m)
    meshes.push(m)
  }
  panel(w, wall, d, 0, wall / 2, 0, kraft(null, 13, true))
  panel(w, h, wall, 0, h / 2, d / 2 - wall / 2, kraft(printUp, 14)) // the front: "this side up"
  panel(w, h, wall, 0, h / 2, -d / 2 + wall / 2)
  panel(wall, h, d - wall * 2, -w / 2 + wall / 2, h / 2, 0)
  panel(wall, h, d - wall * 2, w / 2 - wall / 2, h / 2, 0, kraft(scribbles, 15)) // the right: old marker notes

  // flaps hinge on the top edges: the front one sticks out like a lip so it
  // never hides the post, the others stand up and fall open a little
  const tips = []
  const flap = (len, span, x, z, alongX, outward, angle) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, h, z)
    const m = new THREE.Mesh(alongX ? new THREE.BoxGeometry(span, len, wall) : new THREE.BoxGeometry(wall, len, span), flapMat)
    m.position.y = len / 2
    m.castShadow = m.receiveShadow = true
    pivot.add(m)
    if (alongX) pivot.rotation.x = outward * angle
    else pivot.rotation.z = -outward * angle
    group.add(pivot)
    meshes.push(m)
    pivot.updateMatrix()
    tips.push(new THREE.Vector3(0, len, 0).applyMatrix4(pivot.matrix))
  }
  flap(d * 0.5, w, 0, d / 2, true, 1, 1.72 + rng.range(-0.04, 0.04))
  flap(d * 0.5, w, 0, -d / 2, true, -1, 0.4 + rng.range(-0.06, 0.06))
  flap(w * 0.5, d, -w / 2, 0, false, -1, 0.55 + rng.range(-0.06, 0.06))
  flap(w * 0.5, d, w / 2, 0, false, 1, 0.8 + rng.range(-0.06, 0.06))
  return { group, meshes, tips }
}

// ---- the settings tag, hung under the feather toy --------------------------
// A kraft luggage tag with a handwritten list. Changing a setting scribbles
// out its old mark and draws the new one beside it.
class Tag {
  constructor() {
    this.p = 0 // 0 tucked behind the feather, 1 hanging open
    this.psi = 0 // swing
    this.w = 0
    this.group = new THREE.Group() // origin: the hole the string goes through
    this.string = rod(STRING, 0.0035)
    const c = canvas(TAG_PX.w, TAG_PX.h)
    this.ctx = c.g
    this.texture = canvasTexture(c.c)
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(TAG.w, TAG.h), paper(this.texture, { transparent: true, side: THREE.DoubleSide }))
    this.paper.position.y = -TAG.h / 2 + (TAG_PX.hole / TAG_PX.h) * TAG.h // hung by its hole
    this.paper.castShadow = true
    this.group.add(this.paper)
    const toLocal = (px) => this.paper.position.y + ((TAG_PX.h / 2 - px) / TAG_PX.h) * TAG.h
    this.hits = [hitMesh(new THREE.PlaneGeometry(TAG.w, TAG.h), 'tag', 'tag')]
    this.hits[0].position.set(0, this.paper.position.y, 0.001)
    this.rows = {}
    this.marks = {}
    ROWS.forEach((id, i) => {
      const hit = hitMesh(new THREE.PlaneGeometry(TAG.w * 0.94, TAG.h * 0.22), id, 'tag')
      hit.position.set(0, toLocal(this.rowY(i)), 0.003)
      this.rows[id] = hit
      this.hits.push(hit)
      this.marks[id] = []
    })
    this.group.add(...this.hits)
    this.count = 0
    this.busy = false
  }

  rowY(i) {
    return 142 + i * 94
  }

  // the marks as they stand, drawn whole
  reset(settings) {
    for (const id of ROWS) this.marks[id] = [{ kind: settings[id] ? 'tick' : 'cross', slot: 0, draw: 1, out: 0, wait: 0, seed: ++this.count }]
    this.draw()
  }

  toggle(id, on) {
    const marks = this.marks[id]
    const last = marks[marks.length - 1]
    if (last) last.scrub = true
    // three to a row; after that the oldest gives way
    if (marks.length >= 3) {
      marks.shift()
      marks.forEach((m, i) => (m.slot = i))
    }
    marks.push({ kind: on ? 'tick' : 'cross', slot: marks.length, draw: 0, out: 0, wait: last ? 0.22 : 0, seed: ++this.count })
    this.busy = true
  }

  draw() {
    const g = this.ctx
    const { w: W, h: H } = TAG_PX
    const rng = makeRng(71)
    // a luggage tag: clipped top corners, edges a little rough
    const corners = [[66, 8], [W - 66, 8], [W - 8, 66], [W - 8, H - 8], [8, H - 8], [8, 66]]
    const outline = []
    corners.forEach(([x, y], i) => {
      const [nx, ny] = corners[(i + 1) % corners.length]
      const steps = Math.max(1, Math.round(Math.hypot(nx - x, ny - y) / 16))
      for (let s = 0; s < steps; s++) outline.push([x + ((nx - x) * s) / steps + rng.range(-1.6, 1.6), y + ((ny - y) * s) / steps + rng.range(-1.6, 1.6)])
    })
    sheet(g, W, H, { color: KRAFT, seed: 72, grain: 0.07, outline })
    // the card ring round the hole, and the hole itself
    g.fillStyle = '#9c7147'
    g.beginPath()
    g.arc(W / 2, TAG_PX.hole, 26, 0, Math.PI * 2)
    g.fill()
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.arc(W / 2, TAG_PX.hole, 11, 0, Math.PI * 2)
    g.fill()
    g.restore()
    ROWS.forEach((id, i) => {
      const y = this.rowY(i)
      // long labels shrink to keep clear of the marks
      const label = strings.settings[id]
      g.font = `58px ${HAND}`
      write(g, label, 48, y + 20, Math.min(58, (58 * 280) / g.measureText(label).width), { seed: 80 + i })
      for (const m of this.marks[id]) {
        const x = 384 + m.slot * 62
        const r = makeRng(m.seed * 7919)
        draw(g, m.kind === 'tick' ? tick(x, y, 44, r) : cross(x, y, 40, r), m.draw, { width: 7, color: INK })
        if (m.out > 0) draw(g, scribble(x, y, 44, r), m.out, { width: 5, color: INK })
      }
    })
    this.texture.needsUpdate = true
  }

  // the rest length when open, for framing
  static get openLen() {
    return 0.42
  }

  update(dt, open, from, reduced) {
    const was = this.p
    this.p = clamp(this.p + (open ? dt : -dt) / (reduced ? 0.12 : 0.45), 0, 1)
    if (open && !reduced && was < 0.08 && this.p >= 0.08) this.w += 1.7 // dropping gets it swinging
    const L = 0.03 + (Tag.openLen - 0.03) * easeOut(this.p)
    const steps = 3
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.w += (-(6 / Math.max(L, 0.1)) * Math.sin(this.psi) - (this.p > 0.95 ? 2.2 : 0.8) * this.w) * h
      this.psi += this.w * h
    }
    const top = _d.set(Math.sin(this.psi) * L, -Math.cos(this.psi) * L, 0).add(from)
    this.group.position.copy(top)
    stretch(this.string, from, this.group.position)
    this.group.rotation.z = this.psi
    this.group.scale.setScalar(Math.max(0.001, smooth(0, 0.35, this.p)))
    this.group.visible = this.string.visible = this.p > 0.002
    // a mark being scribbled out, then its replacement going on
    if (this.busy) {
      let still = false
      for (const id of ROWS) {
        for (const m of this.marks[id]) {
          if (m.scrub && m.out < 1) {
            m.out = Math.min(1, m.out + dt / 0.22)
            still = true
          } else if (m.wait > 0) {
            m.wait -= dt
            still = true
          } else if (m.draw < 1) {
            m.draw = Math.min(1, m.draw + dt / 0.24)
            still = true
          }
        }
      }
      this.busy = still
      this.draw()
    }
  }
}

class Toy {
  constructor(anchor) {
    this.anchor = anchor
    this.L = 1.0
    this.th = -0.06 // swing sideways, toward the post is positive
    this.w = 0
    this.ph = 0 // swing toward the camera
    this.pw = 0
    this.maxTh = 0.2 // any further and the feather would hit the post
    this.end = new THREE.Vector3()
    this.bottom = new THREE.Vector3()
    this.group = new THREE.Group()
    this.string = rod(STRING)
    this.feather = new THREE.Group()
    this.material = mat(FEATHER, { emissive: FEATHER, emissiveIntensity: 0 })
    this.meshes = []
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group()
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 4), this.material)
      f.scale.z = 0.35
      f.position.y = -0.13
      f.castShadow = true
      pivot.rotation.z = (i - 1) * 0.32
      pivot.add(f)
      this.feather.add(pivot)
      this.meshes.push(f)
    }
    this.hit = hitMesh(new THREE.SphereGeometry(0.18, 10, 8), 'settings', 'post')
    this.hit.position.y = -0.12
    this.feather.add(this.hit)
    this.tag = new Tag()
    this.group.add(this.string, this.feather, this.tag.string, this.tag.group)
  }

  update(dt, t, open, reduced) {
    const g = 5.5 // a little slower than real gravity; it reads better
    const steps = 4
    const h = dt / steps
    const damping = open ? 2.4 : 0.4
    for (let i = 0; i < steps; i++) {
      const tt = t + i * h
      const breeze = Math.sin(tt * 0.83) * 0.05 + Math.sin(tt * 2.1 + 1.3) * 0.025
      this.w += (-(g / this.L) * Math.sin(this.th) - damping * this.w + breeze) * h
      this.th += this.w * h
      if (this.th > this.maxTh) {
        this.th = this.maxTh
        this.w = -Math.abs(this.w) * 0.45
      }
      this.pw += (-(g / this.L) * Math.sin(this.ph) - damping * 1.5 * this.pw + breeze * 0.5) * h
      this.ph += this.pw * h
    }
    const a = this.anchor
    this.end.set(a.x + this.L * Math.sin(this.th), a.y - this.L * Math.cos(this.th) * Math.cos(this.ph), a.z + this.L * Math.sin(this.ph))
    stretch(this.string, a, this.end)
    this.feather.position.copy(this.end)
    this.feather.rotation.set(-this.ph, 0, this.th)
    this.bottom.set(Math.sin(this.th) * 0.24, -Math.cos(this.th) * 0.24, 0).add(this.end)
    this.tag.update(dt, open, this.bottom, reduced)
  }

  poke(v) {
    this.w += v
  }
}

// ---- the sticky note: tagline on the front, the rules on the back ---------
// Stuck on by its top edge, with the bottom curling away from the box. "how?"
// peels it off from the bottom up, then it flies to the camera and turns over.
class Note {
  constructor() {
    this.group = new THREE.Group() // origin: the middle of the top edge, where the glue is
    this.hinge = new THREE.Group()
    this.group.add(this.hinge)
    const geo = new THREE.PlaneGeometry(NOTE, NOTE, 1, 10)
    geo.translate(0, -NOTE / 2, 0)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const down = -pos.getY(i) / NOTE // 0 at the glue, 1 at the bottom
      if (down > 0.62) pos.setZ(i, ((down - 0.62) / 0.38) ** 2 * 0.04)
    }
    geo.computeVertexNormals()
    const f = canvas(512, 512)
    const b = canvas(512, 512)
    this.frontCtx = f.g
    this.backCtx = b.g
    this.frontMap = canvasTexture(f.c)
    this.backMap = backTexture(b.c)
    this.front = new THREE.Mesh(geo, paper(this.frontMap, { transparent: true }))
    this.back = new THREE.Mesh(geo, paper(this.backMap, { transparent: true, side: THREE.BackSide }))
    this.front.receiveShadow = true
    this.hinge.add(this.front, this.back)
    this.home = {
      pos: new THREE.Vector3(-0.3, 0.06 + NOTE, BOX.d / 2 + 0.004),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.07)),
    }
    this.p = 0
    this.draw()
    this.reset()
  }

  draw() {
    const g = this.frontCtx
    sheet(g, 512, 512, { seed: 51, inset: 8, edge: 2 })
    g.fillStyle = 'rgba(29, 26, 23, 0.035)' // the band of glue along the top
    g.fillRect(8, 8, 496, 72)
    const tag = wrap(g, strings.tagline, 420, `70px ${HAND}`)
    tag.forEach((line, i) => write(g, line, 46 + i * 5, 286 + (i - (tag.length - 1) / 2) * 84, 70, { seed: 60 + i }))
    this.frontMap.needsUpdate = true

    const k = this.backCtx
    sheet(k, 512, 512, { seed: 52, inset: 8, edge: 2 })
    const rules = strings.help.flatMap((line) => wrap(k, line, 420, `54px ${HAND}`))
    rules.forEach((line, i) => write(k, line, 44 + (i % 2) * 6, 262 + (i - (rules.length - 1) / 2) * 66, 54, { seed: 70 + i }))
    this.backMap.needsUpdate = true
  }

  reset() {
    this.p = 0
    this.hinge.rotation.x = 0
    this.group.position.copy(this.home.pos)
    this.group.quaternion.copy(this.home.quat)
  }

  // target: { pos, quat } in the set's space, where the camera wants its middle.
  // With motion reduced it skips the peel and the swoop: a quick swap instead.
  update(dt, open, target, reduced) {
    if (!open && this.p === 0) return
    this.p = clamp(this.p + (open ? dt : -dt) / (reduced ? 0.15 : 0.7), 0, 1)
    // peel up from the bottom, then flatten out in flight
    this.hinge.rotation.x = reduced ? 0 : -0.95 * smooth(0, 0.22, this.p) * (1 - smooth(0.3, 0.75, this.p))
    const e = easeInOut(smooth(reduced ? 0 : 0.15, 1, this.p))
    _top.set(0, NOTE / 2, 0).applyQuaternion(target.quat).add(target.pos)
    this.group.position.lerpVectors(this.home.pos, _top, e)
    if (!reduced) this.group.position.y += Math.sin(Math.PI * e) * 0.18
    this.group.quaternion.slerpQuaternions(this.home.quat, target.quat, e)
    // turned over on the way, so the rules on the back face the camera
    _flip.setFromAxisAngle(UP, Math.PI * smooth(0.3, 0.9, this.p))
    this.group.quaternion.multiply(_flip)
  }
}

// ---- the whole set ------------------------------------------------------------
export class PostSet {
  constructor() {
    const rng = makeRng(2026)
    this.group = new THREE.Group()
    this.fixed = [] // surfaces the dot can land on that never change

    const box = buildBox(rng)
    this.group.add(box.group)
    this.fixed.push(...box.meshes)

    // the rope: a tile of eight coils, repeated round the post (a whole number
    // of times, so it meets itself) and up it
    const sisal = rope()
    const tile = COIL * 8
    for (const t of [sisal.map, sisal.normalMap]) t.repeat.set(Math.round((2 * Math.PI * POST.r) / tile), (POST.top - POST.bottom) / tile)
    this.post = new THREE.Mesh(
      new THREE.CylinderGeometry(POST.r, POST.r, POST.top - POST.bottom, 48, 1, true),
      mat('#ffffff', { map: sisal.map, normalMap: sisal.normalMap }),
    )
    this.post.position.y = (POST.top + POST.bottom) / 2
    this.post.castShadow = this.post.receiveShadow = true
    const pile = carpet()
    pile.repeat.set(3, 1)
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(POST.capR, POST.capR, POST.capH, 48), mat('#ffffff', { map: pile }))
    this.cap.position.y = POST.top + POST.capH / 2
    this.cap.castShadow = this.cap.receiveShadow = true
    this.group.add(this.post, this.cap)
    this.fixed.push(this.post, this.cap)

    // the words, and the generous shapes that catch the pointer around them
    this.words = {}
    this.wordAt = {} // where each word sits on the post, for the kitten
    this.hits = []
    this.anchors = {}
    for (const [id, spec] of Object.entries(WORDS)) {
      const s = scratchWord(spec.text, { tilt: spec.tilt })
      const w = s.w * spec.em
      const h = s.h * spec.em
      this.wordAt[id] = { phi: spec.phi, y: spec.y, half: w / 2 / POST.r }
      const material = wordMaterial(canvasTexture(s.canvas))
      const mesh = new THREE.Mesh(strip(w, h, spec.phi, spec.y, POST.r + 0.003), material)
      mesh.renderOrder = 2
      this.group.add(mesh)
      this.words[id] = { mesh, material, glow: 0 }
      const hit = hitMesh(strip(w + 0.1, h + 0.04, spec.phi, spec.y, POST.r + 0.03), id, 'post')
      this.group.add(hit)
      this.hits.push(hit)
      this.anchors[id] = onPost(spec.phi, spec.y)
    }

    // the title: three lines, with "Dot"'s o clawed right through; the dot rests in the hole
    this.title = []
    const lines = strings.title.split(' ')
    for (let i = 0; i < lines.length; i++) {
      const em = TITLE_EM[i] ?? 0.16
      const y = TITLE_Y[i] ?? 2.6
      const hole = i === 1 ? lines[i].indexOf('o') : -1
      const s = scratchWord(lines[i], { tilt: i === 0 ? 0.04 : i === 2 ? -0.03 : 0, hole })
      const mesh = new THREE.Mesh(strip(s.w * em, s.h * em, 0, y, POST.r + 0.003), wordMaterial(canvasTexture(s.canvas)))
      mesh.renderOrder = 2
      this.group.add(mesh)
      this.title.push(mesh)
      if (s.holeAt) this.anchors.home = onPost((s.holeAt.x * em) / POST.r, y + s.holeAt.y * em)
    }
    this.anchors.home ??= onPost(0, TITLE_Y[1])
    for (const [id, scan] of Object.entries(LETTERING)) if (scan) this.useScan(id, scan)

    // tally marks low on the rope, one clawed in for every rescue finished
    this.tally = { mesh: null, count: -1, from: 0, p: 1 }

    // the feather toy hangs from the cap's edge, out to the left
    this.toy = new Toy(new THREE.Vector3(-0.54, POST.top, 0.24))
    this.group.add(this.toy.group)
    this.hits.push(this.toy.hit, ...this.toy.tag.hits)
    this.fixed.push(...this.toy.meshes, this.toy.tag.paper)

    this.note = new Note()
    this.group.add(this.note.group)
    this.fixed.push(this.note.front, this.note.back)

    this.board = new Board()
    this.group.add(this.board.group, this.board.detail)

    // camera views, in the set's space
    const toyRest = this.toy.anchor.clone().add(new THREE.Vector3(0, -this.toy.L - 0.26, 0))
    const tagTop = toyRest.clone().add(new THREE.Vector3(0, -Tag.openLen, 0))
    const tagMid = tagTop.clone().add(new THREE.Vector3(0, -TAG.h / 2 + (TAG_PX.hole / TAG_PX.h) * TAG.h, 0))
    const kittens = [new THREE.Vector3(-1.0, 0, 0.95), new THREE.Vector3(-1.0, 0.45, 0.95)]
    // what has to be in shot on any screen; a wide one also takes in the corkboard and the kittens on the grass
    const core = [
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => new THREE.Vector3((x * BOX.w) / 2, 0, (z * BOX.d) / 2)),
      ...box.tips,
      ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => new THREE.Vector3(x * POST.capR, POST.top + POST.capH, z * POST.capR)),
      // room for the kitten hanging off the rim, on the right or (batting the toy) the left
      new THREE.Vector3(0.85, POST.top + 0.2, 0.4),
      new THREE.Vector3(0.85, POST.top - 0.7, 0.4),
      new THREE.Vector3(-0.72, POST.top + 0.2, 0.6),
      this.toy.anchor.clone(),
      toyRest,
      // the calico sitting in front of the box
      new THREE.Vector3(0.42, 0, 1.2),
      new THREE.Vector3(0.42, 0.55, 1.2),
    ]
    const half = TAG.w / 2
    this.views = {
      post: {
        look: new THREE.Vector3(0.1, 1.9, 0),
        dir: new THREE.Vector3(0, -0.15, 1).normalize(),
        points: [...core, ...this.board.corners(), ...kittens],
        narrow: core,
        floor: true,
        margin: { x: 0.92, y: 0.9 },
      },
      board: {
        look: this.board.centre(),
        dir: this.board.normal().add(new THREE.Vector3(0, 0.06, 0)).normalize(),
        points: this.board.corners(),
        margin: { x: 0.84, y: 0.8 },
      },
      tag: {
        look: tagMid,
        dir: new THREE.Vector3(0.1, 0.03, 1).normalize(),
        points: [
          tagMid.clone().add(new THREE.Vector3(-half, TAG.h / 2 + 0.04, 0)),
          tagMid.clone().add(new THREE.Vector3(half, TAG.h / 2 + 0.04, 0)),
          tagMid.clone().add(new THREE.Vector3(-half, -TAG.h / 2, 0)),
          tagMid.clone().add(new THREE.Vector3(half, -TAG.h / 2, 0)),
        ],
        // on a wide screen the height decides; on a phone it can take most of the width
        margin: { x: 0.82, y: 0.58 },
      },
    }
    this.noteSize = NOTE
  }

  // everything the dot can land on (the corkboard's photos come and go)
  get surfaces() {
    return [...this.fixed, ...this.board.surfaces]
  }

  hitsFor(view) {
    if (view === 'board') return this.board.hits
    return this.hits.filter((h) => h.userData.view === view)
  }

  // Swap a scratched word for a hand-made scan (see lettering.js) once it loads.
  useScan(id, scan) {
    const src = typeof scan === 'string' ? scan : scan.src
    new THREE.TextureLoader().load(src, (map) => {
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = 8
      const aspect = map.image.width / map.image.height
      if (id === 'title') {
        // one image over all three lines, the dot where the scan says
        const top = TITLE_Y[0] + TITLE_EM[0] * 0.65
        const bottom = TITLE_Y[2] - TITLE_EM[2] * 0.4
        const h = top - bottom
        const y = (top + bottom) / 2
        const w = h * aspect
        for (const m of this.title) m.removeFromParent()
        const mesh = new THREE.Mesh(strip(w, h, 0, y, POST.r + 0.003), wordMaterial(map))
        mesh.renderOrder = 2
        this.group.add(mesh)
        this.title = [mesh]
        const [u, v] = scan.dot ?? [0.5, 0.5]
        this.anchors.home = onPost(((u - 0.5) * w) / POST.r, y + (0.5 - v) * h)
        return
      }
      const spec = WORDS[id]
      const word = this.words[id]
      if (!spec || !word) return
      const h = spec.em * 1.3 // as tall as the scratched letters, ascenders to descenders
      const w = h * aspect
      word.mesh.geometry.dispose()
      word.mesh.geometry = strip(w, h, spec.phi, spec.y, POST.r + 0.003)
      word.material.map?.dispose()
      word.material.map = word.material.emissiveMap = map
      word.material.needsUpdate = true
      const hit = this.hits.find((m) => m.userData.id === id)
      hit.geometry.dispose()
      hit.geometry = strip(w + 0.1, h + 0.04, spec.phi, spec.y, POST.r + 0.03)
      this.wordAt[id].half = w / 2 / POST.r
    })
  }

  // where the dot sits for an option chosen from the keyboard: { p, n } in the set's space
  anchor(id, t = 0) {
    if (this.anchors[id]) {
      const a = this.anchors[id]
      if (id !== 'home') return a
      return { p: a.p.clone().setY(a.p.y + Math.sin(t * 2.1) * 0.012), n: a.n }
    }
    if (id === 'settings') {
      const f = this.toy.feather
      return { p: f.position.clone().add(new THREE.Vector3(0, -0.12, 0.06)), n: new THREE.Vector3(0, 0, 1) }
    }
    const photo = this.board.photoAnchor(id)
    if (photo) return photo
    const row = this.toy.tag.rows[id]
    if (row) {
      this.group.updateMatrixWorld(true)
      const p = row.getWorldPosition(new THREE.Vector3())
      return { p: this.group.worldToLocal(p), n: new THREE.Vector3(0, 0, 1) }
    }
    return null
  }

  setCards(cards, portraits) {
    this.board.setCards(cards, portraits)
  }

  // One tally mark per finished rescue. Marks newer than `seen` (the count
  // last shown) are clawed in while you watch; returns true if one will be.
  setTally(count, seen, reduced) {
    const T = this.tally
    T.count = count
    T.p = count > seen && !reduced ? 0 : 1
    this.drawTally()
    return T.p < 1
  }

  drawTally() {
    const T = this.tally
    if (T.count <= 0) {
      if (T.mesh) T.mesh.visible = false
      return
    }
    const s = scratchTally(T.count, { last: easeOut(T.p) })
    const em = TALLY.em
    if (!T.mesh) {
      T.map = canvasTexture(s.canvas)
      T.mesh = new THREE.Mesh(strip(s.w * em, s.h * em, TALLY.phi, TALLY.y, POST.r + 0.003), wordMaterial(T.map))
      T.mesh.renderOrder = 2
      this.group.add(T.mesh)
    } else {
      T.map.image = s.canvas
      T.map.needsUpdate = true
    }
    T.mesh.visible = true
  }

  // the middle of the tally, in the set's space (for the scrape it makes)
  tallyPoint() {
    return onPost(TALLY.phi, TALLY.y).p
  }

  // the tag's marks, drawn whole
  setSettings(settings) {
    this.toy.tag.reset(settings)
  }

  // one setting changed: scribble out its mark and draw the new one
  toggleMark(id, on) {
    this.toy.tag.toggle(id, on)
  }

  // once the handwriting font has arrived
  redrawPaper() {
    this.toy.tag.draw()
    this.note.draw()
    this.board.redraw()
  }

  reset() {
    this.note.reset()
    this.toy.tag.p = 0
    this.board.want = false
    this.board.p = 0
    if (this.board.open) this.board.open.mesh.visible = true
    this.board.open = null
    this.board.detail.visible = false
  }

  // view: which part of the menu is up; noteTarget and photoTarget: where the
  // note and a chosen photo fly to; hover: what the dot is on
  update(dt, t, { view, noteTarget, photoTarget, hover, reduced }) {
    this.toy.update(dt, t, view === 'tag', reduced)
    this.note.update(dt, view === 'note', noteTarget, reduced)
    this.board.update(dt, photoTarget, view === 'board' ? hover : null, reduced)
    // a new tally mark being clawed in
    const T = this.tally
    if (T.p < 1 && T.count > 0) {
      T.p = Math.min(1, T.p + dt / 0.6)
      this.drawTally()
    }
  }

  highlight(id, dt) {
    for (const [key, w] of Object.entries(this.words)) {
      w.glow = damp(w.glow, key === id ? 1 : 0, 12, dt)
      w.material.emissiveIntensity = WORD_GLOW + w.glow * 0.35
    }
    this.toy.material.emissiveIntensity = damp(this.toy.material.emissiveIntensity, id === 'settings' ? 0.18 : 0, 12, dt)
  }
}
