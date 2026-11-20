// The main menu is a place, not a page: a scratching post in a cardboard box
// out in the backyard. The laser dot is the cursor, the options are words on
// the rope, and choosing one moves the camera or brings something up to it:
// the corkboard of adopted kittens (any photo can be brought up close and
// turned over), the sticky note with the rules on its back, or the settings
// tag on the feather toy. Keyboard, touch and screen readers reach every
// option too: the arrow keys move the dot from word to word, a first tap aims
// and a second tap on the same word chooses it, and a list of real buttons
// nobody sees mirrors the options for assistive tech.
import * as THREE from 'three'
import { strings } from '../strings.js'
import { MenuCamera } from './menu-camera.js'
import { PostSet } from './post-set.js'
import { PHOTO } from './corkboard.js'
import { PostKitten, WatchKitten } from './post-kitten.js'
import { Laser } from '../game/laser.js'
import { LEVELS } from '../world/levels.js'

// where the post stands in the backyard, and which way it faces
const SPOT = { x: -1.6, z: 2.4, yaw: 0.12 }
const LABEL = {
  play: strings.menu.play,
  cards: strings.menu.cards,
  help: strings.menu.help,
  settings: strings.a11y.settings,
  sound: strings.settings.sound,
  music: strings.settings.music,
  pretty: strings.settings.pretty,
  back: strings.a11y.back,
}
// what each view lets you point at, in keyboard order (the corkboard's photos are added as they come)
const TARGETS = { post: ['play', 'cards', 'help', 'settings'], tag: ['sound', 'music', 'pretty'], board: [], note: [], photo: [], dive: [] }
// the option that opened each view, for focus on the way back
const OPENER = { board: 'cards', note: 'help', tag: 'settings' }
const isPhoto = (id) => typeof id === 'string' && id.startsWith('photo:')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// is it showing, all the way up its parents? (invisible things still catch rays)
function shown(o) {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

const UP = new THREE.Vector3(0, 1, 0)
const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _p = new THREE.Vector3()
const _f = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _sq = new THREE.Quaternion()
const _dotW = new THREE.Vector3()
const _dotL = new THREE.Vector3()
const _eyeW = new THREE.Vector3()
const _catW = new THREE.Vector3()
const _say = new THREE.Vector3()
const PAPERY = new Set(['note', 'tag', 'photo']) // views that bring a bit of paper up
const DIVE_EYE = new THREE.Vector3(0.25, 1.25, 1.35) // where the camera trails the falling kitten from

export class Menu {
  constructor({ stage, sound, save, persist, ui, portraits, gameCamera, getGrid, onPlay, onToggle }) {
    this.stage = stage
    this.sound = sound
    this.save = save
    this.persist = persist ?? (() => {})
    this.ui = ui
    this.portraits = portraits
    this.gameCamera = gameCamera
    this.getGrid = getGrid
    this.onPlay = onPlay
    this.onToggle = onToggle
    this.cam = new MenuCamera()
    this.laser = new Laser()
    this.laser.setStrength(0.35, 0.8)
    this.laser.setGlow(0.4)
    this.laser.light.position.y = 0.14
    this.laser.snapDist = 0.6
    this.root = new THREE.Group()
    this.root.add(this.laser.group)
    this.set = null
    this.active = false
    this.view = 'post'
    this.t = 0
    this.pointer = { x: 0, y: 0, active: false, kind: 'mouse' }
    this.mode = 'idle' // pointer, keys or idle
    this.focus = null // chosen from the keyboard
    this.hover = null // under the dot
    this.armed = null // tapped once
    this.pressed = undefined
    this.hitN = new THREE.Vector3()
    this.noteTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
    this.photoTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
    this.openPhoto = null

    this.layer = ui.menuLayer
    this.layer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]')
      if (b) this.select(b.dataset.menu, true)
    })
    this.layer.addEventListener('focusin', (e) => {
      const b = e.target.closest('[data-menu]')
      if (b && this.targets().includes(b.dataset.menu)) this.setFocus(b.dataset.menu)
    })
  }

  // what can be pointed at right now, in keyboard order
  targets() {
    if (this.view === 'board') return this.set.board.photos.map((_, i) => `photo:${i}`)
    return TARGETS[this.view] ?? []
  }

  get reduced() {
    return this.cam.reduced
  }
  set reduced(on) {
    this.cam.reduced = on
  }

  // ---- in and out ---------------------------------------------------------------
  enter() {
    if (!this.set) {
      this.set = new PostSet()
      this.root.add(this.set.group)
      // one on the post, two on the grass; the same three every time
      this.cat = new PostKitten(87109, this.set)
      this.watchers = [
        new WatchKitten(285084, -1.0, 0.95, 0.55),
        new WatchKitten(237570, 0.42, 1.12, -0.5, { swats: true }),
      ]
      this.set.group.add(this.cat.group, this.cat.puff.mesh, ...this.watchers.map((w) => w.group))
      // its claws in the rope and its landings, heard from where it is
      this.cat.say = (kind, arg) => {
        const p = this.cat.worldCentre(_say)
        if (kind === 'scrape') this.sound.scrape(p.x, p.y, p.z, arg)
        if (kind === 'thud') this.sound.thud(p.x, p.y, p.z)
      }
    }
    this.cat.reset()
    for (const w of this.watchers) w.reset()
    const grid = this.getGrid()
    const y = grid ? grid.heightAt(SPOT.x, SPOT.z) : 0
    this.set.group.position.set(SPOT.x, Number.isFinite(y) ? y : 0, SPOT.z)
    this.set.group.rotation.y = SPOT.yaw
    this.root.updateMatrixWorld(true)
    this.views = Object.fromEntries(Object.entries(this.set.views).map(([k, v]) => [k, this.toWorld(v)]))
    this.stage.scene.add(this.root)
    this.stage.setCamera(this.cam.camera)
    this.stage.mood.tilt = 0
    this.stage.mood.dof = 1
    this.active = true
    this.view = 'post'
    this.mode = this.pointer.active && this.pointer.kind === 'mouse' ? 'pointer' : 'idle'
    this.focus = this.hover = this.armed = null
    this.pressed = undefined
    this.openPhoto = null
    this.set.reset()
    this.set.setCards(this.save.cards, this.portraits)
    this.set.setSettings(this.settings())
    // a tally mark for every rescue finished; a new one is clawed in, once
    const done = LEVELS.filter((L) => (this.save.levels[L.id]?.stars ?? 0) > 0).length
    if (this.set.setTally(done, this.save.seen.tally ?? 0, this.reduced)) {
      const p = this.set.group.localToWorld(this.set.tallyPoint())
      this.sound.scrape(p.x, p.y, p.z, 0.6)
    }
    if (this.save.seen.tally !== done) {
      this.save.seen.tally = done
      this.persist()
    }
    this.frameCamera(true)
    this.cam.update(0)
    this.renderA11y()
  }

  exit() {
    if (!this.active) return
    this.active = false
    this.stage.scene.remove(this.root)
    this.stage.setCamera(this.gameCamera)
    this.stage.mood.tilt = 1
    this.stage.mood.dof = 0
    this.layer.innerHTML = ''
    this.laser.set(null)
    this.laser.update(0)
  }

  setAspect(aspect) {
    this.cam.setAspect(aspect)
  }

  toWorld(view) {
    const m = this.set.group.matrixWorld
    if (view.pos) return { pos: view.pos.clone().applyMatrix4(m), look: view.look.clone().applyMatrix4(m) }
    return {
      look: view.look.clone().applyMatrix4(m),
      dir: view.dir.clone().transformDirection(m),
      points: view.points.map((p) => p.clone().applyMatrix4(m)),
      narrow: view.narrow?.map((p) => p.clone().applyMatrix4(m)),
      floor: view.floor,
      margin: view.margin,
    }
  }

  // ---- input ----------------------------------------------------------------------
  aim(x, y, kind) {
    this.pointer.x = (x / innerWidth) * 2 - 1
    this.pointer.y = -(y / innerHeight) * 2 + 1
    this.pointer.active = true
    this.pointer.kind = kind
    if (kind !== 'touch') this.mode = 'pointer'
  }

  press(x, y, kind) {
    if (!this.active || this.view === 'dive') return
    if (this.layer.contains(document.activeElement)) document.activeElement.blur()
    this.aim(x, y, kind)
    this.mode = 'pointer'
    const id = this.pick().id
    if (kind === 'touch') {
      // on the post, the first tap aims and a second tap on the same word chooses it
      if (this.view === 'post') {
        if (id && id === this.armed) this.choose(id)
        else this.armed = id
      } else this.choose(id)
      return
    }
    this.pressed = id
  }

  release(x, y, kind) {
    if (!this.active || kind === 'touch' || this.pressed === undefined) return
    const id = this.pick().id
    if (id === this.pressed) this.choose(id)
    this.pressed = undefined
  }

  leave() {
    if (this.pointer.kind !== 'mouse') return
    this.pointer.active = false
    if (this.mode === 'pointer') this.mode = 'idle'
  }

  // returns true when the key was used
  key(e) {
    if (!this.active) return false
    if (this.view === 'dive') return true
    const k = e.key
    if (k === 'Escape') {
      if (this.view === 'post') {
        // takes back a choice the kitten is still jumping for
        if (!this.cat.pending) return false
        this.cat.cancel()
        return true
      }
      this.back(true)
      return true
    }
    if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowDown' || k === 'ArrowRight') {
      this.step(k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1)
      return true
    }
    if (k === 'Enter' || k === ' ') {
      if (this.layer.contains(document.activeElement)) return false // the focused button clicks itself
      if (this.view === 'note' || this.view === 'photo') {
        this.back(true)
        return true
      }
      const id = this.mode === 'keys' ? this.focus : this.hover
      if (!id) return false
      this.select(id, true)
      return true
    }
    return false
  }

  step(dir) {
    const list = this.targets()
    if (!list.length) return
    const at = list.indexOf(this.focus)
    const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length
    this.setFocus(list[next])
    this.focusButton(list[next])
  }

  setFocus(id) {
    this.focus = id
    this.mode = 'keys'
    this.armed = null
  }

  focusButton(id) {
    this.layer.querySelector(`[data-menu="${id}"]`)?.focus({ preventScroll: true })
  }

  // a click or tap landed on `id` (or on nothing)
  choose(id) {
    // the note and a photo held up close go back on any click
    if (this.view === 'note' || this.view === 'photo') return this.back(false)
    if (!id) {
      if (this.view !== 'post') this.back(false)
      return
    }
    if (id === 'tag' || id === 'board') return
    this.select(id, false)
  }

  // ---- what the options do -----------------------------------------------------------
  // On the post, the kitten jumps onto the word first and the option happens
  // once its claws are in (about half a second); anything else can still be
  // clicked meanwhile, and Escape takes it back.
  select(id, keys = false) {
    if (!this.active || this.view === 'dive') return
    switch (id) {
      case 'play':
        return this.startDive()
      case 'cards':
      case 'help':
        if (this.view !== 'post') return
        this.armed = null
        return this.cat.pounce(id, () => this.go(id === 'cards' ? 'board' : 'note', keys), this.reduced)
      case 'settings':
        if (this.view !== 'post') return
        return this.cat.batToy(() => this.go('tag', keys))
      case 'sound':
      case 'music':
      case 'pretty':
        return this.toggle(id, keys)
      case 'back':
        return this.back(keys)
    }
    // a photo on the corkboard: up close, and turned over
    if (isPhoto(id) && this.view === 'board' && this.set.board.photo(id)) {
      this.openPhoto = id
      this.set.board.show(id)
      this.go('photo', keys)
    }
  }

  go(view, keys) {
    // paper coming up or going back rustles; a camera move clicks
    if (PAPERY.has(view) || PAPERY.has(this.view)) this.sound.paper()
    else this.sound.ui('click')
    this.view = view
    this.armed = null
    this.focus = null
    if (keys) this.mode = 'keys'
    else if (this.mode === 'keys') this.mode = 'idle'
    this.renderA11y(keys)
  }

  back(keys) {
    if (this.view === 'post' || this.view === 'dive') return
    // a photo goes back on the corkboard, and the corkboard stays up
    if (this.view === 'photo') {
      const id = this.openPhoto
      this.set.board.hide()
      this.go('board', false)
      if (keys && id) {
        this.setFocus(id)
        this.focusButton(id)
      }
      return
    }
    const from = this.view
    this.go('post', false)
    if (keys) {
      this.setFocus(OPENER[from])
      this.focusButton(OPENER[from])
    }
  }

  toggle(id, keys) {
    this.onToggle(id === 'pretty' ? 'fancy' : id)
    this.set.toggleMark(id, this.settings()[id])
    this.renderA11y()
    if (keys) {
      this.setFocus(id)
      this.focusButton(id)
    }
  }

  settings() {
    const s = this.save.settings
    return { sound: !!s.sound, music: !!s.music, pretty: s.quality !== 'low' }
  }

  startDive() {
    this.sound.ui('click')
    this.view = 'dive'
    this.diveT = 0
    this.curtained = false
    this.played = false
    this.cat.dive()
    this.renderA11y()
  }

  // ---- the frame ---------------------------------------------------------------------
  update(dt) {
    if (!this.active) return
    this.t += dt
    if (this.view === 'dive') this.diving(dt)
    const lean = this.pointer.active && this.mode === 'pointer'
    this.cam.pointer.x = lean ? this.pointer.x : 0
    this.cam.pointer.y = lean ? this.pointer.y : 0
    this.frameCamera(false)
    this.cam.update(dt)
    this.aimAt(this.set.noteSize, this.set.noteSize, this.noteTarget)
    this.aimAt(PHOTO.w, PHOTO.h, this.photoTarget)
    this.set.update(dt, this.t, { view: this.view, noteTarget: this.noteTarget, photoTarget: this.photoTarget, hover: this.hover, reduced: this.reduced })
    this.root.updateMatrixWorld(true)
    this.focusOn(dt)

    const { id, hit } = this.pick()
    const was = this.hover
    this.hover = this.mode === 'keys' ? this.focus : this.mode === 'pointer' && this.pointer.active ? id : null
    // the kitten says "mrrp" at a new option, not more than once every second and a half
    if (this.view === 'post' && this.hover && this.hover !== was && TARGETS.post.includes(this.hover) && this.t - (this.mrrpAt ?? -9) > 1.5) {
      this.mrrpAt = this.t
      const p = this.cat.worldCentre(_say)
      this.sound.mrrp(p.x, p.y, p.z, this.cat.g.pitch * (0.9 + Math.random() * 0.22))
    }
    let target = null
    if (this.mode === 'keys' && this.focus) target = this.anchorHit(this.focus)
    else if (this.mode === 'pointer' && this.pointer.active) target = hit
    else if (this.view === 'post' || this.view === 'dive') target = this.anchorHit('home') // resting in the title's o
    if (target) this.laser.haloSize = target.near ? 0.2 : 0.6
    // close up to paper, a dot that bright would wash the writing out
    const far = this.view === 'post' || this.view === 'dive'
    this.laser.baseLight = far ? 0.35 : 0.1
    this.laser.setGlow(far ? 0.4 : 0.22)
    this.laser.set(target)
    this.laser.update(dt)
    this.set.highlight(this.view === 'post' || this.view === 'tag' ? this.hover : null, dt)

    // the kittens: the one on the post goes where the dot is; the two on the
    // grass watch the dot, or the kitten up the post when there is no dot
    const L = this.laser
    const dotW = L.active ? _dotW.set(L.x, L.y, L.z) : null
    const dotL = dotW ? this.set.group.worldToLocal(_dotL.copy(dotW)) : null
    const eyeW = _eyeW.copy(this.cam.camera.position)
    this.cat.update(dt, { hover: this.view === 'post' ? this.hover : null, dotW, eyeW, toy: this.set.toy, reduced: this.reduced })
    const catW = this.cat.worldCentre(_catW)
    for (const w of this.watchers) w.update(dt, { dot: dotL, dotW, lookW: catW })

    if (this.sound.ctx) {
      const at = this.laser.active ? this.laser : this.set.group.position
      this.cam.camera.getWorldDirection(_f)
      const len = Math.hypot(_f.x, _f.z) || 1
      this.sound.listen(at.x, at.y, at.z, _f.x / len, _f.z / len)
    }
  }

  frameCamera(snap) {
    // the note comes to the camera; a photo comes off the board to it
    const v = this.view === 'note' ? 'post' : this.view === 'photo' ? 'board' : this.view
    if (v === 'dive') {
      // follow the kitten down into the box
      const look = this.cat.worldCentre(_catW)
      const eye = this.set.group.localToWorld(_p.copy(this.cat.group.position).add(DIVE_EYE))
      return this.cam.moveTo(eye, look, { rate: this.reduced ? 0 : 5 })
    }
    this.cam.frame(v, this.views[v], { rate: v === 'post' ? 2.6 : 3.2, snap })
  }

  // Depth of field: sharp on what the camera looks at, pulled in to the note
  // or a photo as it comes up close, so the post behind goes soft.
  focusOn(dt) {
    const eye = this.cam.camera.position
    let focus = eye.distanceTo(this.cam.look)
    const close = this.view === 'note' ? this.set.note : this.view === 'photo' ? this.set.board : null
    if (close) {
      const at = (close === this.set.note ? this.set.note.front : this.set.board.detail).getWorldPosition(_p)
      focus += (eye.distanceTo(at) - focus) * Math.min(1, Math.max(0, (close.p - 0.3) / 0.6))
    }
    const mood = this.stage.mood
    mood.focusDistance += (focus - mood.focusDistance) * (1 - Math.exp(-8 * dt))
  }

  // A spot in front of where the camera rests, near enough that something
  // w wide and h tall fills most of the frame: where the note and a photo fly to.
  aimAt(w, h, out) {
    this.cam.restingPose(_p, _q)
    const cam = this.cam.camera
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const d = Math.max(h / (0.62 * 2 * tanHalf), w / (0.86 * 2 * tanHalf * cam.aspect))
    _f.set(0, 0, -1).applyQuaternion(_q)
    _p.addScaledVector(_f, d)
    out.pos.copy(this.set.group.worldToLocal(_p))
    this.set.group.getWorldQuaternion(_sq)
    out.quat.copy(_sq.invert().multiply(_q))
  }

  diving(dt) {
    this.diveT += dt
    if (!this.curtained && this.diveT > (this.reduced ? 0 : 0.28)) {
      this.curtained = true
      this.ui.curtain(true)
    }
    if (!this.played && this.diveT > (this.reduced ? 0.3 : 0.62)) {
      this.played = true
      this.onPlay()
    }
  }

  // what the pointer is over, and where the dot lands
  pick() {
    _ndc.set(this.pointer.x, this.pointer.y)
    _ray.setFromCamera(_ndc, this.cam.camera)
    // hit shapes are invisible on purpose, so for those only their parents count
    const targets = this.set.hitsFor(this.view).filter((h) => shown(h.visible ? h : h.parent))
    const over = targets.length ? _ray.intersectObjects(targets, false) : []
    const id = over.length ? over[0].object.userData.id : null
    let hit = null
    const s = _ray.intersectObjects(this.set.surfaces.filter(shown), false)
    if (s.length) {
      const x = s[0]
      this.hitN.copy(x.face.normal).transformDirection(x.object.matrixWorld)
      if (this.hitN.dot(_ray.ray.direction) > 0) this.hitN.negate()
      hit = { x: x.point.x, y: x.point.y, z: x.point.z, n: this.hitN, t: x.distance, near: true }
    }
    const grid = this.getGrid()
    const g = grid?.raycast(_ray.ray.origin, _ray.ray.direction)
    if (g && (!hit || g.t < hit.t)) hit = { x: g.x, y: g.y, z: g.z, n: UP, t: g.t, near: false }
    return { id, hit }
  }

  anchorHit(id) {
    const a = this.set.anchor(id, this.t)
    if (!a) return null
    const p = this.set.group.localToWorld(a.p.clone())
    const n = a.n.clone().transformDirection(this.set.group.matrixWorld)
    return { x: p.x, y: p.y, z: p.z, n, near: true }
  }

  // ---- for screen readers and the Tab key ---------------------------------------
  renderA11y(focusFirst = false) {
    const v = this.view
    const items = []
    let text = ''
    if (v === 'post') items.push(...TARGETS.post)
    if (v === 'tag') items.push(...TARGETS.tag, 'back')
    if (v === 'board') {
      text = `<p>${strings.cards.title}</p>${this.save.cards.length ? '' : `<p>${strings.cards.empty}</p>`}`
      items.push(...this.targets(), 'back')
    }
    if (v === 'photo') {
      text = this.set.board
        .describe()
        .map(([label, value]) => `<p>${esc(label)}: ${esc(value)}</p>`)
        .join('')
      items.push('back')
    }
    if (v === 'note') {
      text = strings.help.map((line) => `<p>${line}</p>`).join('')
      items.push('back')
    }
    const s = this.settings()
    const label = (id) => (isPhoto(id) ? esc(this.set.board.photo(id)?.card.name ?? '') : LABEL[id])
    const button = (id) => `<button type="button" data-menu="${id}"${id in s ? ` aria-pressed="${s[id]}"` : ''}>${label(id)}</button>`
    this.layer.innerHTML = items.length ? `<nav aria-label="${strings.a11y.menu}">${text}${items.map(button).join('')}</nav>` : ''
    if (focusFirst && items.length) this.focusButton(items[0])
  }
}
