// One rescue at a time: builds the level, runs the storm clock, moves the
// dot, keeps the kittens' path-finding field fresh, and turns what happens
// into hints, sounds, results and adoption cards. On the title screen the
// same machinery runs a demo in the backyard with a dot that moves by itself.
import { strings } from '../strings.js'
import * as THREE from 'three'
import { clamp, damp, dist } from '../core/mathx.js'
import { makeRng, newSeed } from '../core/rng.js'
import { dispose } from '../core/lowpoly.js'
import { LEVELS, DEMO } from '../world/levels.js'
import { buildLevel } from '../world/level.js'
import { Weather } from '../world/weather.js'
import { makeGenome, TRAITS } from './genome.js'
import { Kitten } from './kitten.js'
import { Laser } from './laser.js'
import { Box, Basket, Food, Vacuum, Flutter, Gate, Cup, Hideout, Flood, Channel } from './objects.js'

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const move = touch ? strings.play.move.touch : strings.play.move.mouse

// tips, shown at most twice each; the trait ones come with the traits
const TIPS = { ...strings.play.tips, sleepy: TRAITS.sleepy.tip, shy: TRAITS.shy.tip, greedy: TRAITS.greedy.tip, chaotic: TRAITS.chaotic.tip }

const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _v = new THREE.Vector3()
const _p = { x: 0, y: 0, z: 0 }

export class Game {
  constructor({ stage, cam, sound, ui, save, saveNow }) {
    this.stage = stage
    this.cam = cam
    this.sound = sound
    this.ui = ui
    this.save = save
    this.saveNow = saveNow
    this.root = new THREE.Group()
    stage.scene.add(this.root)
    this.weather = new Weather(stage)
    this.laser = new Laser()
    this.pointer = { active: false, x: 0, y: 0, keyboard: false }
    this.keys = new Set()
    this.kdot = null
    this.state = 'none'
    this.level = null
    this.kittens = []
    this.t = 0
    this.onResults = null
    this.tipQueue = []
    this.tipClock = 99
  }

  // ---- building a rescue -----------------------------------------------------------------
  // demo: kittens chase a dot that moves by itself (behind the level list).
  // menu: just the scenery and the weather, as the backdrop for the menu.
  load(id, { demo = false, menu = false } = {}) {
    this.unload()
    const index = Math.max(0, LEVELS.findIndex((l) => l.id === id))
    const def = LEVELS[index]
    this.def = def
    this.index = index
    this.demo = demo
    this.menu = menu
    const rand = (this.rand = makeRng(demo || menu ? 4242 : newSeed()))
    const level = (this.level = buildLevel(def, makeRng(index * 977 + 13)))
    const grid = (this.grid = level.grid)
    this.root.add(level.group)
    const centre = level.bounds.getCenter(new THREE.Vector3())
    this.stage.frameLight(centre, Math.hypot(def.size[0], def.size[1]) * 0.55 + 1)
    this.weather.setLevel(level, rand)
    // the cloud ring is made for looking down on the diorama. For the menu's
    // low camera it is pushed far out and up, into a bank of storm cloud on
    // the horizon; it only shows where depth of field softens it (sharp, it
    // reads as a wall of rocks)
    if (this.weather.clouds) this.weather.clouds.scale.set(menu ? 3.2 : 1, menu ? 1.9 : 1, menu ? 3.2 : 1)
    const dark = !!level.theme.dark

    const add = (o) => {
      this.root.add(o.group)
      return o
    }
    this.boxes = []
    this.byId = {}
    for (const b of menu ? [] : def.boxes ?? []) {
      const box = add(new Box(b, grid, rand.int(1, 9999)))
      this.boxes.push(box)
      this.byId[b.id] = box
    }
    this.vacuums = (menu ? [] : def.vacuums ?? []).map((v) => {
      const vac = add(new Vacuum(v, grid))
      add(vac.box)
      this.boxes.push(vac.box)
      return vac
    })
    this.basket = add(new Basket(def.basket, grid))
    this.foods = (def.foods ?? []).map((f, i) => add(new Food(f, grid, i + 1)))
    this.flutters = (def.flutters ?? []).map((f, i) => add(new Flutter(f, grid, i + 3)))
    this.gates = (def.gates ?? []).map((g) => add(new Gate(g, grid)))
    this.cups = (def.cups ?? []).map((c) => add(new Cup(c, grid, this.gates)))
    this.hideouts = (def.hideouts ?? []).map((h, i) => add(new Hideout(h, grid, i + 11, dark)))
    this.flood = def.flood ? add(new Flood(def.flood, level)) : null
    this.channels = level.shapes.filter((s) => s.k === 'channel').map((s) => add(new Channel(s, rand)))

    // kittens: new ones every attempt, so every rescue fills the album differently
    this.kittens = []
    const names = new Set()
    const slots = menu ? [] : demo ? DEMO.kittens.map((at, i) => ({ at, trait: ['plain', 'chaotic', 'plain', 'shy', 'plain', 'greedy', 'plain'][i] })) : def.kittens
    for (const slot of slots) {
      const g = makeGenome((rand() * 4294967296) >>> 0, slot.trait ?? 'plain', names)
      names.add(g.name)
      const k = new Kitten(g, { shine: dark })
      this.root.add(k.group)
      if (slot.hide != null && this.hideouts[slot.hide]) k.hide(this.hideouts[slot.hide])
      else if (slot.box && this.byId[slot.box]) {
        const box = this.byId[slot.box]
        const seat = box.claim(k)
        box.lock = 0
        k.box = box
        k.seat = seat
        const s = box.seatPos(seat)
        k.x = s.x
        k.z = s.z
        k.y = k.floor = s.y
        k.setState('box')
        k.place()
      } else {
        k.spawn(slot.at[0], slot.at[1], grid)
        if (slot.asleep) k.asleep()
      }
      this.kittens.push(k)
    }

    this.root.add(this.laser.group)
    this.laser.setStrength(level.theme.laser, dark ? 7.5 : 3.5)
    this.laser.set(null)
    this.laser.update(0)
    this.kdot = null
    this.field = new Float32Array(grid.n)
    this.dry = null
    this.fieldKey = -2
    this.fieldVersion = -1
    this.fieldT = 0
    this.time = def.time
    this.left = def.time
    this.storm = 0
    this.rescued = 0
    this.tipsShown = new Set()
    this.tipQueue = []
    this.tipClock = 99
    this.lastTick = 99
    this.ending = null
    this.nextId = null
    this.t = 0
    this.cam.tight = false
    this.cam.frame(level.bounds, { intro: !demo && !menu })
    this.state = menu ? 'menu' : demo ? 'demo' : 'intro'
    this.world = {
      t: 0,
      dt: 0,
      grid,
      dot: this.laser,
      field: this.field,
      fieldReady: false,
      dry: null,
      waterLevel: -Infinity,
      kittens: this.kittens,
      boxes: this.boxes,
      basket: this.basket,
      foods: this.foods,
      vacuums: this.vacuums,
      flutters: this.flutters,
      cups: this.cups,
      wind: this.weather.wind,
      storm: 0,
      demo,
      sound: this.sound,
      rand,
      emit: (type, k, obj) => this.onEvent(type, k, obj),
      shake: (a) => this.cam.shake(a),
    }
    this.ui.clearHint()
  }

  unload() {
    if (!this.level) return
    for (const k of this.kittens) k.dispose()
    this.kittens = []
    this.root.remove(this.laser.group)
    for (const child of [...this.root.children]) dispose(child)
    this.level = null
    this.ui.clearLabels()
  }

  start() {
    if (this.state !== 'intro') return
    this.state = 'playing'
    this.cam.tight = true
    this.tip('start')
  }
  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.laser.set(null)
    this.laser.update(0)
  }
  resume() {
    if (this.state === 'paused') this.state = 'playing'
  }

  // ---- the frame ----------------------------------------------------------------------------
  update(dt) {
    if (!this.level) return
    if (this.state === 'paused' || this.state === 'results') {
      this.cam.update(dt, { t: this.t })
      if (this.state === 'results') this.tickWorld(dt * 0.5, false)
      return
    }
    this.t += dt
    const playing = this.state === 'playing'
    if (playing) {
      this.left -= dt
      if (this.left <= 0) {
        this.left = 0
        this.finish(false)
      }
      const s = Math.ceil(this.left)
      if (s <= 10 && s !== this.lastTick && s > 0) {
        this.lastTick = s
        this.sound.ui('tick')
      }
      if (this.left < 30) this.tip('storm')
    }
    this.storm = this.state === 'demo' || this.state === 'menu' ? 0.12 : clamp(1 - this.left / this.time, 0, 1)
    if (this.weather.clouds) this.weather.clouds.visible = this.state !== 'menu' || this.stage.quality === 'high'
    if (this.state === 'ending' && !this.ending.win) this.storm = 1
    this.updateDot(dt)
    this.tickWorld(dt, true)
    if (this.state === 'demo') this.cam.goal.yaw = this.cam.base.yaw + Math.sin(this.t * 0.07) * 0.32
    this.cam.update(dt, { focus: this.laser.active ? this.laser : null, t: this.t })
    if (this.state === 'ending') {
      this.ending.t += dt
      if (this.ending.t > 2.8) this.showResults()
    }
    if (playing) this.situationTips(dt)
    this.updateAudio(dt)
  }

  tickWorld(dt, live) {
    const w = this.world
    w.t = this.t
    w.dt = dt
    w.storm = this.storm
    const active = this.state === 'playing' || this.state === 'demo' || this.state === 'menu'
    if (this.weather.update(dt, { storm: this.storm, t: this.t, rand: this.rand, active }) && live) {
      const power = 0.45 + this.storm * 0.55
      this.sound.thunder(0.25 + this.rand() * 1.1, power)
      this.cam.shake(0.025 * power)
      if (this.state === 'playing') for (const k of this.kittens) if (this.rand() < 0.4) k.startle(w)
    }
    if (this.flood) {
      if (this.flood.update(dt, w, this.state === 'demo' ? 0 : this.storm)) this.updateDry()
      w.waterLevel = this.flood.level > -0.08 ? this.flood.level : -Infinity
      if (this.flood.level > 0.02) this.tip('flood')
    }
    this.updateField(dt)
    for (const v of this.vacuums) v.update(dt, w)
    for (const b of this.boxes) b.update(dt, w)
    this.basket.update(dt, w)
    for (const f of this.foods) f.update(dt)
    for (const f of this.flutters) f.update(dt)
    for (const g of this.gates) g.update(dt)
    for (const c of this.cups) c.update(dt, w)
    for (const h of this.hideouts) h.update(dt, w)
    for (const c of this.channels) c.update(dt, w)
    for (const k of this.kittens) k.update(dt, w)
  }

  // ---- the dot -------------------------------------------------------------------------------------
  updateDot(dt) {
    let hit = null
    if (this.state === 'demo') {
      if (this.pointer.active) hit = this.pick()
      else {
        // a dot with a mind of its own
        const [W, D] = this.def.size
        const t = this.t
        const x = Math.sin(t * 0.33) * W * 0.3 + Math.sin(t * 1.3) * 0.7
        const z = Math.sin(t * 0.47 + 1.3) * D * 0.26 + Math.cos(t * 0.9) * 0.5
        const i = this.grid.index(x, z)
        if (i >= 0 && Number.isFinite(this.grid.top[i])) hit = { x, y: this.grid.top[i], z }
      }
    } else if (this.state === 'playing') {
      if (this.keys.size || (this.pointer.keyboard && this.kdot)) hit = this.keyboardDot(dt)
      else if (this.pointer.active) hit = this.pick()
    }
    this.laser.set(hit)
    this.laser.update(dt)
  }

  pick() {
    _ndc.set(this.pointer.x, this.pointer.y)
    _ray.setFromCamera(_ndc, this.cam.camera)
    const o = _ray.ray.origin
    const d = _ray.ray.direction
    let best = this.grid.raycast(o, d)
    const disc = (x, y, z, r) => {
      if (Math.abs(d.y) < 1e-4) return
      const t = (y - o.y) / d.y
      if (t <= 0) return
      const px = o.x + d.x * t
      const pz = o.z + d.z * t
      if ((px - x) ** 2 + (pz - z) ** 2 > r * r) return
      if (!best || t < best.t) best = { x: px, y, z: pz, t }
    }
    // boxes and the basket stand up off the grid
    for (const b of this.boxes) disc(b.x, b.y + b.height * 0.7, b.z, b.half)
    disc(this.basket.x, this.basket.y + 0.28, this.basket.z, 0.62)
    return best
  }

  keyboardDot(dt) {
    const g = this.grid
    if (!this.kdot) {
      const [sx, sz] = this.def.start
      const at = this.laser.active ? this.laser : { x: sx, z: sz }
      this.kdot = { x: at.x, z: at.z }
    }
    const f = this.cam.forward(_v)
    let mx = 0
    let mz = 0
    const k = this.keys
    if (k.has('up')) {
      mx += f.x
      mz += f.z
    }
    if (k.has('down')) {
      mx -= f.x
      mz -= f.z
    }
    if (k.has('right')) {
      mx -= f.z
      mz += f.x
    }
    if (k.has('left')) {
      mx += f.z
      mz -= f.x
    }
    const len = Math.hypot(mx, mz)
    if (len > 0) {
      const sp = (k.has('fast') ? 6 : 3.4) * dt
      const nx = clamp(this.kdot.x + (mx / len) * sp, g.x0 + 0.1, -g.x0 - 0.1)
      const nz = clamp(this.kdot.z + (mz / len) * sp, g.z0 + 0.1, -g.z0 - 0.1)
      const i = g.index(nx, nz)
      if (i >= 0 && Number.isFinite(g.top[i])) {
        this.kdot.x = nx
        this.kdot.z = nz
      }
    }
    const i = g.index(this.kdot.x, this.kdot.z)
    return i >= 0 && Number.isFinite(g.top[i]) ? { x: this.kdot.x, y: g.top[i], z: this.kdot.z } : null
  }

  // Path lengths from every cell to the dot, rebuilt when the dot changes cell.
  updateField(dt) {
    const g = this.grid
    const d = this.laser
    this.fieldT -= dt
    if (!d.active) {
      this.world.fieldReady = false
      this.fieldKey = -2
      return
    }
    const key = g.index(d.x, d.z) * 8 + Math.round(d.y * 3)
    if ((key === this.fieldKey && g.version === this.fieldVersion) || this.fieldT > 0) return
    this.fieldT = 0.07
    this.fieldKey = key
    this.fieldVersion = g.version
    const seeds = []
    const low = []
    g.each({ x: d.x, z: d.z, r: 1 }, (i, x, z) => {
      if (!g.standable(i)) return
      const dh = g.h[i] - d.y
      const c = Math.hypot(x - d.x, z - d.z)
      if (Math.abs(dh) <= 0.3) seeds.push({ i, cost: c })
      else if (dh < 0 && dh > -2.5) low.push({ i, cost: c + 0.3 })
    })
    const use = seeds.length ? seeds : low
    g.flow(use, this.field)
    this.world.fieldReady = use.length > 0
  }

  // Distance to dry land, for kittens caught in the flood.
  updateDry() {
    const g = this.grid
    if (!this.dry) this.dry = new Float32Array(g.n)
    const seeds = []
    const C = g.cols
    for (let i = 0; i < g.n; i++) {
      if (!g.standable(i)) continue
      const c = i % C
      if ((c > 0 && g.flooded(i - 1)) || (c < C - 1 && g.flooded(i + 1)) || (i >= C && g.flooded(i - C)) || (i + C < g.n && g.flooded(i + C))) seeds.push({ i, cost: 0 })
    }
    g.flow(seeds, this.dry, { swim: true, waterLevel: this.flood.level })
    this.world.dry = this.dry
  }

  // ---- what happened -----------------------------------------------------------------------------
  onEvent(type, k, obj) {
    switch (type) {
      case 'rescue': {
        this.rescued++
        this.sound.ui('rescue')
        this.laser.ping()
        const p = this.screen(k.x, k.y + 0.7, k.z)
        if (p) {
          this.ui.floatText(strings.play.home(k.name), p.x, p.y)
          this.ui.burst(p.x, p.y, 9)
        }
        this.ui.announce(strings.play.safe(k.name, this.rescued, this.kittens.length))
        if (this.state === 'playing' && this.rescued >= this.kittens.length) this.finish(true)
        else if (this.state === 'playing' && this.rescued === this.def.need && this.rescued < this.kittens.length) this.queueHint(strings.play.enough)
        break
      }
      case 'reveal':
        this.laser.ping()
        this.tip('found')
        break
      case 'meow': {
        const h = k.hideout
        const p = this.screen(h.x, h.y + 0.9, h.z)
        if (p && this.state !== 'demo') this.ui.ring(p.x, p.y)
        if (this.state === 'playing' && this.t > 5) this.tip('hidden')
        break
      }
      case 'box':
        if (this.state === 'playing') this.tip(obj.route ? 'ride' : obj.carrier ? 'vacuumRide' : 'box')
        break
      case 'unbox':
      case 'wake':
        this.laser.ping()
        break
      case 'sleep':
        this.tip('sleepy')
        break
      case 'scared':
        this.tip('vacuum')
        break
      case 'stare':
        this.tip(k.stareAt?.kind === 'moth' ? 'moth' : 'butterfly')
        break
      case 'food':
        this.tip('greedy')
        break
      case 'notice':
        if (this.state !== 'playing') break
        this.tip('lead')
        if (k.trait === 'shy') this.tip('shy')
        if (k.trait === 'chaotic') this.tip('chaotic')
        break
      case 'swat':
        this.tip('swat')
        break
      case 'gate':
        this.queueHint(strings.play.gate, true)
        this.sound.ui('start')
        break
      case 'swim':
        this.tip('swim')
        break
      case 'afloat':
        this.tip('boats')
        break
    }
  }

  tip(id) {
    if (this.demo || this.menu || this.tipsShown.has(id)) return
    this.tipsShown.add(id)
    const seen = this.save.seen[id] ?? 0
    if (id !== 'start' && id !== 'storm' && seen >= 2) return
    const text = id === 'start' ? strings.play.start[this.def.id]?.(move) : TIPS[id]
    if (!text) return
    this.save.seen[id] = seen + 1
    this.queueHint(text)
  }

  queueHint(text, now = false) {
    if (now) this.tipQueue.unshift(text)
    else this.tipQueue.push(text)
  }

  situationTips(dt) {
    this.tipClock += dt
    if (this.tipQueue.length && this.tipClock > 4.2) {
      this.ui.hint(this.tipQueue.shift(), 5600)
      this.tipClock = 0
    }
    const d = this.laser
    if (!d.active) return
    const i = this.grid.index(d.x, d.z)
    if (this.grid.wet(i) && !this.grid.flooded(i)) this.tip('puddle')
    if (this.weather.wind.warn) this.tip('wind')
    for (const c of this.cups) {
      if (c.state === 'sit' && c.pedalAt && dist(d.x, d.z, c.pedalAt.x, c.pedalAt.z) < 1.8) this.tip('cup')
    }
    for (const v of this.vacuums) if (dist(d.x, d.z, v.x, v.z) < 1.4) this.tip('vacuum')
  }

  finish(allHome) {
    if (this.state !== 'playing') return
    this.state = 'ending'
    this.ending = { t: 0, win: allHome }
    this.laser.set(null)
    this.ui.clearHint()
    if (allHome) {
      this.sound.ui('win')
      const p = this.screen(this.basket.x, this.basket.y + 0.6, this.basket.z)
      if (p) this.ui.burst(p.x, p.y, 16)
      this.cam.goal.zoom = 0.88
    } else {
      this.weather.strike(this.rand)
      this.sound.thunder(0.05, 1)
      this.cam.shake(0.06)
      this.sound.ui(this.rescued >= this.def.need ? 'win' : 'lose')
      for (const k of this.kittens) k.startle(this.world)
    }
  }

  showResults() {
    this.state = 'results'
    const def = this.def
    const total = this.kittens.length
    const rescued = this.rescued
    const passed = rescued >= def.need
    const extra = total - def.need
    const stars = rescued >= total ? 3 : passed ? (rescued >= def.need + Math.ceil(extra / 2) ? 2 : 1) : 0
    const next = LEVELS[this.index + 1]
    const wasLocked = next ? (this.save.levels[def.id]?.stars ?? 0) === 0 : false
    const rec = this.save.levels[def.id] ?? { stars: 0, best: 0 }
    rec.stars = Math.max(rec.stars, stars)
    rec.best = Math.max(rec.best, rescued)
    this.save.levels[def.id] = rec
    const cards = this.kittens
      .filter((k) => k.rescued)
      .map((k) => ({ seed: k.g.seed, trait: k.trait, name: k.name, label: k.g.label, level: def.id, at: Date.now() }))
    for (const c of cards) if (!this.save.cards.some((s) => s.seed === c.seed && s.trait === c.trait)) this.save.cards.push(c)
    this.saveNow()
    this.nextId = passed && next ? next.id : null
    this.cam.goal.zoom = 1
    this.onResults?.({
      all: rescued >= total,
      passed,
      stars,
      rescued,
      total,
      need: def.need,
      left: this.left,
      cards,
      next: this.nextId,
      unlocked: passed && !!next && wasLocked,
    })
  }

  // ---- presentation ---------------------------------------------------------------------------------
  screen(x, y, z) {
    const { width, height } = this.stage.size
    _v.set(x, y, z)
    return this.cam.toScreen(_v, width, height, _p) ? { x: _p.x, y: _p.y } : null
  }

  frameUI(dt) {
    if (!this.level || this.state === 'menu') return
    const items = []
    for (const k of this.kittens) {
      if (!k.emote || !k.visible) continue
      const p = this.screen(k.x, k.y + 0.64 * k.scale, k.z)
      if (p) items.push({ id: k.id, x: p.x, y: p.y, kind: k.emote.kind })
    }
    let tag = null
    const d = this.laser
    if (d.active && (this.state === 'playing' || this.state === 'demo')) {
      let best = null
      let bd = 0.7
      for (const k of this.kittens) {
        if (!k.visible || k.state === 'basket') continue
        const dd = dist(k.x, k.z, d.x, d.z)
        if (dd < bd) {
          bd = dd
          best = k
        }
      }
      if (best) {
        const p = this.screen(best.x, best.y + 0.64 * best.scale, best.z)
        if (p) tag = { x: p.x, y: p.y, name: best.name, trait: best.trait }
      }
    }
    this.ui.labels(items, tag)

    if (this.state === 'playing' || this.state === 'paused' || this.state === 'ending') {
      const wind = this.weather.wind
      let windAngle = 0
      if (wind.warn || wind.gusting) {
        const a = this.screen(this.basket.x, 0, this.basket.z)
        const b = this.screen(this.basket.x + wind.x, 0, this.basket.z + wind.z)
        if (a && b) windAngle = Math.atan2(b.y - a.y, b.x - a.x)
      }
      this.ui.hud({ rescued: this.rescued, total: this.kittens.length, need: this.def.need, left: this.left, storm: this.storm, wind, windAngle })
    }

    // keep the sharp band of the tilt-shift on whatever matters
    let fy = 0.5
    if (d.active) {
      _v.set(d.x, d.y, d.z).project(this.cam.camera)
      fy = _v.y * 0.5 + 0.5
    } else {
      _v.copy(this.cam.look).project(this.cam.camera)
      fy = _v.y * 0.5 + 0.5
    }
    this.stage.mood.focus = damp(this.stage.mood.focus, clamp(fy, 0.15, 0.85), 3, dt)
  }

  updateAudio(dt) {
    const s = this.sound
    if (!s.ctx) return
    const d = this.laser
    const f = this.cam.forward(_v)
    if (d.active) s.listen(d.x, d.y, d.z, f.x, f.z)
    else s.listen(this.cam.look.x, 0, this.cam.look.z, f.x, f.z)
    const th = this.level.theme
    const ambient = this.state !== 'results'
    s.setAmbience({
      rain: ambient ? (th.indoor ? 0.2 + this.storm * 0.4 : this.weather.rainAmount) : 0.1,
      wind: ambient ? Math.min(1, this.weather.wind.force / 4 + (this.weather.wind.warn ? 0.2 : 0) + (th.indoor ? 0 : this.storm * 0.18)) : 0,
      purr: this.kittens.length ? Math.min(1, this.rescued / this.kittens.length) * (this.state === 'demo' ? 0 : 1) : 0,
      purrAt: { x: this.basket.x, y: this.basket.y + 0.3, z: this.basket.z },
      vacuum: this.vacuums[0] ?? null,
      drips: !!th.dark,
      dt,
    })
    s.music(this.state === 'playing' || this.state === 'ending' ? (this.storm > 0.78 ? 'tense' : 'play') : this.state === 'paused' ? 'off' : 'title')
  }
}
