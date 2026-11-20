// The corkboard leaning on the box: a polaroid pinned up for every kitten you
// have brought home, so the number of photos is the count. The first fifteen
// get a spot each; after that they overlap, messily. Choosing a photo brings
// it up close and turns it over: on the back is its adoption form.
import * as THREE from 'three'
import { makeRng } from '../core/rng.js'
import { clamp, damp, easeInOut, smooth } from '../core/mathx.js'
import { strings } from '../strings.js'
import { makeGenome, TRAITS, eyeLabel } from '../game/genome.js'
import { LEVELS } from '../world/levels.js'
import { canvas, sheet, ragged, write, wrap, tape, cork, HAND, MONO } from './paper.js'
import { mat, paper, PAPER_GLOW, canvasTexture, hitMesh } from './bits.js'

export const BOARD = { w: 1.0, h: 0.74, t: 0.035 }
const PW = 200 // a polaroid's canvas, in pixels
const PH = 266
export const PHOTO = { w: 0.17, h: 0.17 * (PH / PW) }
const FORM = { w: 480, h: 640 } // the back, drawn bigger: it is read up close
const UP = new THREE.Vector3(0, 1, 0)
const _flip = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _m = new THREE.Matrix4()

// A polaroid: thick white frame, the photo (dark until it develops), the
// name in marker underneath, a strip of tape holding it up.
function drawPolaroid(g, card, img, seed) {
  const rng = makeRng(seed)
  sheet(g, PW, PH, { seed, grain: 0.035, outline: ragged(rng, 12, 22, PW - 12, PH - 6, 0.7) })
  const px = 24
  const py = 34
  const ps = PW - 48
  if (img) g.drawImage(img, px, py, ps, ps)
  else {
    g.fillStyle = '#3a322a'
    g.fillRect(px, py, ps, ps)
  }
  g.strokeStyle = 'rgba(29, 26, 23, 0.18)'
  g.lineWidth = 1
  g.strokeRect(px, py, ps, ps)
  g.font = `34px ${HAND}`
  const size = Math.min(34, (34 * (PW - 30)) / Math.max(1, g.measureText(card.name).width))
  write(g, card.name, PW / 2, py + ps + 46, size, { seed, align: 'center' })
  tape(g, PW / 2 + rng.range(-18, 18), 24, 74, 20, rng.range(-0.25, 0.25), seed + 1)
}

// what the form on the back says
function facts(card) {
  const g = makeGenome(card.seed, card.trait)
  const trait = TRAITS[card.trait] ?? TRAITS.plain
  const level = LEVELS.find((l) => l.id === card.level)
  const when = card.at ? new Date(card.at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
  const f = strings.form
  return [
    [f.name, card.name],
    [f.coat, g.label],
    [f.eyes, eyeLabel(g)],
    [f.personality, trait.name.toLowerCase()],
    [f.loves, g.loves],
    [f.fears, g.fears],
    [f.talent, g.talent],
    [f.from, level ? level.name.toLowerCase() : ''],
    [f.adopted, when.toLowerCase()],
  ].filter(([, v]) => v)
}

// the back: a printed form, filled in by hand
function drawForm(g, card, seed) {
  const { w: W, h: H } = FORM
  const rng = makeRng(seed)
  sheet(g, W, H, { seed: seed + 5, grain: 0.04, outline: ragged(rng, 10, 10, W - 10, H - 10, 1) })
  const rows = facts(card).map(([label, value]) => [label, wrap(g, value, W - 84, `28px ${HAND}`).slice(0, 2)])
  // each row: the printed label, then the answer on one or two ruled lines;
  // whatever height is left over is shared out between the rows
  const LABEL_TO_ANSWER = 30
  const LINE = 28
  const tall = rows.reduce((s, [, lines]) => s + LABEL_TO_ANSWER + lines.length * LINE, 0)
  const gap = Math.max(2, (H - 52 - tall) / rows.length)
  let y = 38
  for (const [label, lines] of rows) {
    g.fillStyle = 'rgba(29, 26, 23, 0.7)'
    g.font = `500 16px ${MONO}`
    g.textBaseline = 'alphabetic'
    g.fillText(label, 36, y)
    lines.forEach((line, i) => {
      const base = y + LABEL_TO_ANSWER + i * LINE
      g.strokeStyle = 'rgba(29, 26, 23, 0.22)'
      g.lineWidth = 1.2
      g.beginPath()
      g.moveTo(36, base + 6)
      g.lineTo(W - 36, base + 6)
      g.stroke()
      write(g, line, 44, base, 28, { seed: seed + y + i })
    })
    y += LABEL_TO_ANSWER + lines.length * LINE + gap
  }
}

// a taped-up piece of paper with something written on it
function paperPlane(pw, ph, w, h, paint) {
  const { c, g } = canvas(pw, ph)
  const map = canvasTexture(c)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper(map, { transparent: true }))
  mesh.receiveShadow = true
  return {
    mesh,
    redraw() {
      paint(g, pw, ph)
      map.needsUpdate = true
    },
  }
}

export class Board {
  constructor() {
    this.group = new THREE.Group()
    this.group.position.set(1.22, 0, 0.42)
    this.group.rotation.set(-0.2, -0.32, 0, 'YXZ')
    this.body = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h, BOARD.t), mat('#7a5634'))
    this.body.position.y = BOARD.h / 2
    this.body.castShadow = this.body.receiveShadow = true
    const c = canvas(512, 380)
    cork(c.g, 512, 380)
    this.cork = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w - 0.07, BOARD.h - 0.07), mat('#ffffff', { map: canvasTexture(c.c) }))
    this.cork.position.set(0, BOARD.h / 2, BOARD.t / 2 + 0.001)
    this.cork.receiveShadow = true
    this.group.add(this.body, this.cork)

    // the heading, on a strip of paper taped to the cork
    this.strip = paperPlane(512, 104, 0.46, 0.093, (g, w, h) => {
      sheet(g, w, h, { seed: 31, inset: 14, edge: 2 })
      write(g, strings.cards.title, w / 2, h * 0.68, 52, { seed: 32, align: 'center' })
      tape(g, 22, h / 2, 50, 30, 1.35, 33)
      tape(g, w - 22, h / 2, 50, 30, -1.4, 34)
    })
    this.strip.mesh.position.set(-0.17, BOARD.h - 0.075, BOARD.t / 2 + 0.003)
    this.strip.mesh.rotation.z = 0.035
    this.strip.mesh.renderOrder = 2
    // and for when nobody has come home yet
    this.empty = paperPlane(400, 220, 0.34, 0.187, (g, w, h) => {
      sheet(g, w, h, { seed: 41, inset: 10 })
      const lines = wrap(g, strings.cards.empty, w - 70, `44px ${HAND}`)
      lines.forEach((line, i) => write(g, line, w / 2, h / 2 + 14 + (i - (lines.length - 1) / 2) * 50, 44, { seed: 42 + i, align: 'center' }))
      tape(g, w / 2, 16, 90, 24, -0.08, 43)
    })
    this.empty.mesh.position.set(0.04, BOARD.h * 0.45, BOARD.t / 2 + 0.003)
    this.empty.mesh.rotation.z = -0.05
    this.empty.mesh.renderOrder = 2
    this.group.add(this.strip.mesh, this.empty.mesh)

    this.photos = []
    this.byKey = new Map()
    this.hit = hitMesh(new THREE.PlaneGeometry(BOARD.w * 1.04, BOARD.h * 1.04), 'board', 'board')
    this.hit.position.set(0, BOARD.h / 2, BOARD.t / 2 + 0.002)
    this.group.add(this.hit)

    // the photo being looked at up close: its front, and the form on its back
    // (flipped, so it reads the right way round from behind)
    this.detail = new THREE.Group()
    this.front = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO.w, PHOTO.h), paper(null, { transparent: true }))
    const f = canvas(FORM.w, FORM.h)
    this.formCtx = f.g
    this.formMap = canvasTexture(f.c)
    this.formMap.wrapS = THREE.RepeatWrapping
    this.formMap.repeat.x = -1
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO.w, PHOTO.h), paper(this.formMap, { transparent: true, side: THREE.BackSide }))
    this.detail.add(this.front, this.back)
    this.detail.visible = false
    this.open = null
    this.want = false
    this.p = 0
    this.group.updateMatrix()
    this.redraw()
  }

  redraw() {
    this.strip.redraw()
    this.empty.redraw()
    for (const p of this.photos) p.redraw()
    if (this.open) drawForm(this.formCtx, this.open.card, this.open.seed)
    this.formMap.needsUpdate = true
  }

  // pin up a photo per card; portraits arrive one a frame and develop in place
  setCards(cards, portraits) {
    const keep = new Set()
    const slots = makeRng(77).shuffle([...Array(15).keys()])
    this.photos = cards.map((card, i) => {
      const key = `${card.seed}:${card.trait}`
      keep.add(key)
      let p = this.byKey.get(key)
      if (!p) {
        p = this.makePhoto(card, portraits)
        this.byKey.set(key, p)
      }
      const rng = makeRng((card.seed ^ 0x51ed270b) >>> 0)
      let x
      let y
      if (i < 15) {
        const slot = slots[i]
        x = -0.36 + (slot % 5) * 0.18 + rng.range(-0.025, 0.025)
        y = 0.135 + Math.floor(slot / 5) * 0.19 + rng.range(-0.02, 0.02)
      } else {
        x = rng.range(-0.4, 0.4)
        y = rng.range(0.13, 0.5)
      }
      p.mesh.position.set(x, y, BOARD.t / 2 + 0.005 + i * 0.0012)
      p.mesh.rotation.z = rng.range(-0.2, 0.2)
      p.mesh.renderOrder = 3 + i
      p.mesh.userData = { id: `photo:${i}`, view: 'board' }
      p.mesh.updateMatrix()
      return p
    })
    for (const [key, p] of this.byKey) {
      if (keep.has(key)) continue
      p.mesh.removeFromParent()
      p.mesh.geometry.dispose()
      p.map.dispose()
      p.mesh.material.dispose()
      this.byKey.delete(key)
    }
    this.empty.mesh.visible = cards.length === 0
  }

  makePhoto(card, portraits) {
    const { c, g } = canvas(PW, PH)
    const map = canvasTexture(c)
    const material = paper(map, { transparent: true })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO.w, PHOTO.h), material)
    mesh.matrixAutoUpdate = false
    mesh.receiveShadow = true
    this.group.add(mesh)
    const p = { card, mesh, map, img: null, glow: 0, seed: (card.seed % 99991) + 17 }
    p.redraw = () => {
      drawPolaroid(g, card, p.img, p.seed)
      map.needsUpdate = true
    }
    p.redraw()
    portraits
      ?.get(card.seed, card.trait)
      .then((url) => {
        const img = new Image()
        img.onload = () => {
          p.img = img
          p.redraw()
        }
        img.src = url
      })
      .catch(() => {})
    return p
  }

  photo(id) {
    return typeof id === 'string' && id.startsWith('photo:') ? this.photos[Number(id.slice(6))] : null
  }

  // the middle of a photo and the way the board faces, in the set's space
  photoAnchor(id) {
    const p = this.photo(id)
    if (!p) return null
    return { p: p.mesh.position.clone().applyMatrix4(this.group.matrix), n: this.normal() }
  }

  // the pieces the dot can land on
  get surfaces() {
    return [this.body, this.cork, this.strip.mesh, this.empty.mesh, ...this.photos.map((p) => p.mesh), this.front, this.back]
  }

  get hits() {
    return [...this.photos.map((p) => p.mesh), this.hit]
  }

  // bring one up close (or put it back)
  show(id) {
    const p = this.photo(id)
    if (!p) return
    if (this.open && this.open !== p) this.open.mesh.visible = true
    this.open = p
    this.want = true
    this.front.material.map = this.front.material.emissiveMap = p.map
    this.front.material.needsUpdate = true
    drawForm(this.formCtx, p.card, p.seed)
    this.formMap.needsUpdate = true
  }

  hide() {
    this.want = false
  }

  // target: where in front of the camera it goes, in the set's space.
  // With motion reduced it is a quick swap rather than a flight.
  update(dt, target, hover, reduced) {
    for (const p of this.photos) {
      p.glow = damp(p.glow, p.mesh.userData.id === hover ? 1 : 0, 12, dt)
      p.mesh.material.emissiveIntensity = PAPER_GLOW + p.glow * 0.14
    }
    const p = this.open
    if (!p) return
    this.p = clamp(this.p + (this.want ? dt : -dt) / (reduced ? 0.12 : 0.5), 0, 1)
    const e = easeInOut(this.p)
    _m.multiplyMatrices(this.group.matrix, p.mesh.matrix).decompose(_pos, _quat, _scale)
    this.detail.position.lerpVectors(_pos, target.pos, e)
    if (!reduced) this.detail.position.addScaledVector(UP, Math.sin(Math.PI * e) * 0.06)
    this.detail.quaternion.slerpQuaternions(_quat, target.quat, e)
    _flip.setFromAxisAngle(UP, Math.PI * smooth(0.25, 0.85, this.p))
    this.detail.quaternion.multiply(_flip)
    this.detail.visible = this.p > 0.001
    p.mesh.visible = !this.detail.visible
    if (this.p === 0 && !this.want) this.open = null
  }

  // read out for screen readers
  describe() {
    return this.open ? facts(this.open.card) : []
  }

  // corners and middle of the board, in the set's space
  corners() {
    const pts = []
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]])
      pts.push(new THREE.Vector3(x * BOARD.w, y * BOARD.h, BOARD.t / 2).applyMatrix4(this.group.matrix))
    return pts
  }
  centre() {
    return new THREE.Vector3(0, BOARD.h / 2, BOARD.t / 2).applyMatrix4(this.group.matrix)
  }
  normal() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
  }
}
