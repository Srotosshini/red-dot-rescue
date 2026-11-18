// Things in a level that move or react: cardboard boxes (some of them rides),
// the rescue basket, food, the robot vacuum, butterflies and moths, the cup on
// the counter and the gate it opens, hiding places, and the rising flood.
import * as THREE from 'three'
import { clamp, damp, dampAngle, angleTo, dist, smooth, Spring } from '../core/mathx.js'
import { F_WALL, F_WATER } from '../world/grid.js'
import {
  makeBoxMesh, makeBasketMesh, makeVacuumMesh, makeFlutterMesh, makeCupMesh, makePedalMesh,
  makeGateMesh, makeHideoutMesh, makeFishMesh, makeFloodMesh, makeChannelWater,
} from '../world/props.js'

// ---- boxes ---------------------------------------------------------------------------
export class Box {
  constructor(def, grid, seed = 1) {
    this.id = def.id
    this.size = def.size ?? 1
    this.capacity = this.size > 1 ? 2 : 1
    const m = makeBoxMesh(this.size, seed)
    this.group = m.group
    this.height = m.height
    this.half = m.half
    this.reach = this.half + 0.34
    this.occ = new Array(this.capacity).fill(null)
    this.seats = this.capacity > 1 ? [[-0.22, 0], [0.22, 0]] : [[0, 0]]
    this.wobble = new Spring(0, 220, 9)
    this.attn = 0
    this.lock = 0
    this.open = true
    this.carrier = null
    this.grid = grid
    this.float = !!def.float
    this.boat = !!def.boat
    this.speed = def.speed ?? 0.5
    this.pause = def.pause ?? 2
    this.wait = this.pause
    this.dir = 1
    this.u = 0
    this.yaw = def.yaw ?? 0
    const at = def.at ?? [0, 0]
    this.x = at[0]
    this.z = at.length > 2 ? at[2] : at[1]
    this.ground = at.length > 2 ? at[1] : grid.heightAt(this.x, this.z)
    this.y = this.ground
    this.floating = false
    this.bob = Math.random() * 10
    if (def.route) {
      this.route = def.route.map((p) => (p.length > 2 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], grid.heightAt(p[0], p[1]), p[1])))
      this.lengths = [0]
      for (let i = 1; i < this.route.length; i++) this.lengths.push(this.lengths[i - 1] + this.route[i].distanceTo(this.route[i - 1]))
      this.total = this.lengths[this.lengths.length - 1]
    }
    if (def.hang) {
      // the pulley box hangs from the line by two strings
      this.lineY = Math.max(...this.route.map((p) => p.y)) + def.hang
      this.strings = []
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 3).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#e8e2d6' }))
        s.position.set(sx * this.half * 0.55, this.height, 0)
        this.group.add(s)
        this.strings.push(s)
      }
    }
    this.place()
  }

  get hasRoom() {
    return this.occ.includes(null)
  }
  get count() {
    return this.occ.filter(Boolean).length
  }
  claim(k) {
    const s = this.occ.indexOf(null)
    if (s >= 0) {
      this.occ[s] = k
      this.lock = 1.2
      this.attn = 0
    }
    return s
  }
  release(k) {
    const s = this.occ.indexOf(k)
    if (s >= 0) this.occ[s] = null
  }
  bump() {
    this.wobble.kick(4)
  }
  seatPos(s) {
    const [sx, sz] = this.seats[s] ?? [0, 0]
    const c = Math.cos(this.yaw)
    const n = Math.sin(this.yaw)
    return { x: this.x + sx * c + sz * n, y: this.y + 0.025, z: this.z - sx * n + sz * c, yaw: this.yaw }
  }

  // point along the route, ping-ponging with a pause at each end
  advance(dt) {
    if (this.wait > 0) {
      this.wait -= dt
      return
    }
    this.u += this.dir * this.speed * dt
    if (this.u >= this.total) {
      this.u = this.total
      this.dir = -1
      this.wait = this.pause
    } else if (this.u <= 0) {
      this.u = 0
      this.dir = 1
      this.wait = this.pause
    }
    let i = 1
    while (i < this.lengths.length - 1 && this.lengths[i] < this.u) i++
    const a = this.route[i - 1]
    const b = this.route[i]
    const t = clamp((this.u - this.lengths[i - 1]) / Math.max(1e-6, this.lengths[i] - this.lengths[i - 1]), 0, 1)
    this.x = a.x + (b.x - a.x) * t
    this.z = a.z + (b.z - a.z) * t
    this.ground = a.y + (b.y - a.y) * t
  }

  update(dt, w) {
    this.lock -= dt
    if (this.carrier) {
      const v = this.carrier
      this.x = v.x
      this.z = v.z
      this.y = v.topY
      this.yaw = v.heading
    } else {
      const moving = this.route && (!this.float || this.floating)
      if (moving) this.advance(dt)
      if (this.float) {
        const lvl = w.waterLevel
        if (lvl > this.ground + 0.03) {
          if (!this.floating) w.emit('afloat', null, this)
          this.floating = true
          this.y = damp(this.y, Math.max(this.ground, lvl - 0.04) + Math.sin(w.t * 2 + this.bob) * 0.02, 6, dt)
          this.yaw += Math.sin(w.t * 0.7 + this.bob) * dt * 0.15
        } else this.y = damp(this.y, this.ground, 8, dt)
      } else if (this.boat) {
        this.y = this.ground + Math.sin(w.t * 2.2 + this.bob) * 0.02
      } else this.y = this.ground
    }
    this.place(w, dt)

    // hold the dot on a box to call a kitten out
    const d = w.dot
    const on = d.active && this.count > 0 && dist(d.x, d.z, this.x, this.z) < this.half + 0.22 && Math.abs(d.y - (this.y + this.height * 0.6)) < 0.9
    this.attn = on && this.lock <= 0 ? this.attn + dt * (1 + d.wiggle * 1.5) : Math.max(0, this.attn - dt * 2)
    if (this.attn > 0.45) {
      const target = this.exitSpot(w)
      if (target) {
        let best = null
        let bestD = Infinity
        this.occ.forEach((k, s) => {
          if (!k) return
          const p = this.seatPos(s)
          const dd = dist(p.x, p.z, d.x, d.z)
          if (dd < bestD) {
            bestD = dd
            best = k
          }
        })
        if (best) {
          best.leaveBox(w, target.x, target.y, target.z)
          this.wobble.kick(5)
        }
        this.attn = 0.15
      } else this.attn = 0.3
    }
  }

  // where a kitten leaving the box lands: toward the dot, or the open front
  exitSpot(w) {
    const g = this.grid
    const d = w.dot
    let ax = d.x - this.x
    let az = d.z - this.z
    let al = Math.hypot(ax, az)
    if (al < this.half + 0.1) {
      ax = 0
      az = 1
      al = 1
    }
    ax /= al
    az /= al
    for (const r of [this.half + 0.42, this.half + 0.7, this.half + 0.28, this.half + 1]) {
      const i = g.nearestStandable(this.x + ax * r, this.z + az * r, this.y, 0.35)
      if (i >= 0 && !g.wet(i)) return { x: g.cx(i), y: g.h[i], z: g.cz(i) }
    }
    return null
  }

  place(w, dt = 1 / 60) {
    const sq = this.wobble.update(0, dt)
    this.group.position.set(this.x, this.y, this.z)
    this.group.rotation.y = this.yaw + sq * 0.04
    this.group.scale.set(1 + sq * 0.03, 1 - sq * 0.05, 1 + sq * 0.03)
    if (this.strings) for (const s of this.strings) s.scale.y = Math.max(0.05, this.lineY - this.y - this.height)
  }
}

// ---- the rescue basket -------------------------------------------------------------------
export class Basket {
  constructor(def, grid) {
    const m = makeBasketMesh()
    this.group = m.group
    this.ring = m.ring
    this.flag = m.flag
    this.x = def.at[0]
    this.z = def.at[1]
    this.y = grid.heightAt(this.x, this.z)
    this.reach = 0.95
    this.count = 0
    this.wobble = new Spring(0, 200, 8)
    this.group.position.set(this.x, this.y, this.z)
    this.pulse = 0
  }
  claim() {
    return this.count++
  }
  bump() {
    this.wobble.kick(5)
    this.pulse = 1
  }
  seatPos(s) {
    // a kitten pile: a ring of four on the cushion, then layers on top
    const layer = s < 4 ? 0 : s < 8 ? 1 : s < 11 ? 2 : 3 + Math.floor((s - 11) / 3)
    const inLayer = s < 4 ? s : s < 8 ? s - 4 : s < 11 ? s - 8 : (s - 11) % 3
    const per = layer === 0 || layer === 1 ? 4 : 3
    const a = (inLayer / per) * Math.PI * 2 + layer * 0.8 + 0.4
    const r = layer === 0 ? 0.24 : layer === 1 ? 0.2 : 0.12
    return { x: this.x + Math.cos(a) * r, y: this.y + 0.12 + layer * 0.17, z: this.z + Math.sin(a) * r, yaw: Math.atan2(Math.cos(a), Math.sin(a)) * 0.3 }
  }
  update(dt, w) {
    const s = this.wobble.update(0, dt)
    this.group.scale.set(1 + s * 0.03, 1 - s * 0.04, 1 + s * 0.03)
    this.pulse = Math.max(0, this.pulse - dt * 1.5)
    const breathe = 0.5 + Math.sin(w.t * 2.4) * 0.5
    this.ring.material.opacity = (w.demo ? 0.2 : 0.32 + breathe * 0.25) + this.pulse * 0.5
    this.ring.scale.setScalar(1 + breathe * 0.04 + this.pulse * 0.25)
    this.flag.rotation.y = Math.sin(w.t * 3) * 0.04
  }
}

// ---- food -------------------------------------------------------------------------------------
export class Food {
  constructor(def, grid, seed) {
    this.mesh = makeFishMesh(seed)
    this.x = def.at[0]
    this.z = def.at[1]
    this.y = grid.heightAt(this.x, this.z)
    this.eaten = false
    this.t = Math.random() * 6
    this.mesh.position.set(this.x, this.y, this.z)
    this.mesh.rotation.y = Math.random() * 6
    this.group = this.mesh
  }
  eat() {
    this.eaten = true
  }
  update(dt) {
    this.t += dt
    if (this.eaten) {
      const s = Math.max(0, this.mesh.scale.x - dt * 4)
      this.mesh.scale.setScalar(s)
      this.mesh.visible = s > 0
      return
    }
    this.mesh.position.y = this.y + 0.02 + Math.abs(Math.sin(this.t * 3)) * 0.03
  }
}

// ---- the robot vacuum ------------------------------------------------------------------------
export class Vacuum {
  constructor(def, grid) {
    const m = makeVacuumMesh()
    this.group = m.group
    this.brush = m.brush
    this.led = m.led
    this.route = def.route.map(([x, z]) => new THREE.Vector3(x, grid.heightAt(x, z), z))
    this.i = def.startAt ?? 0
    const p = this.route[this.i]
    this.x = p.x
    this.z = p.z
    this.y = p.y
    const q = this.route[(this.i + 1) % this.route.length]
    this.heading = Math.atan2(q.x - p.x, q.z - p.z)
    this.speed = def.speed ?? 0.8
    this.wait = 0.5
    this.box = new Box({ id: 'vacuum', size: 1, at: [p.x, p.z] }, grid, 77)
    this.box.carrier = this
  }
  get topY() {
    return this.y + 0.125
  }
  update(dt, w) {
    const next = this.route[(this.i + 1) % this.route.length]
    const want = Math.atan2(next.x - this.x, next.z - this.z)
    const turn = angleTo(this.heading, want)
    if (this.wait > 0) this.wait -= dt
    else if (Math.abs(turn) > 0.04) this.heading += Math.sign(turn) * Math.min(Math.abs(turn), 2.4 * dt)
    else {
      const dx = next.x - this.x
      const dz = next.z - this.z
      const dl = Math.hypot(dx, dz)
      const step = this.speed * dt
      if (dl <= step) {
        this.x = next.x
        this.z = next.z
        this.i = (this.i + 1) % this.route.length
        this.wait = 0.7
      } else {
        this.x += (dx / dl) * step
        this.z += (dz / dl) * step
      }
    }
    this.group.position.set(this.x, this.y + Math.sin(w.t * 30) * 0.002, this.z)
    this.group.rotation.y = this.heading
    this.brush.rotation.y += dt * 18
    this.led.material.color.setScalar(2 + Math.sin(w.t * 4) * 1.2)
  }
}

// ---- butterflies and moths ---------------------------------------------------------------------
export class Flutter {
  constructor(def, grid, seed) {
    const m = makeFlutterMesh(def.kind, seed)
    this.group = m.group
    this.wingL = m.wingL
    this.wingR = m.wingR
    this.kind = def.kind
    this.ax = def.at[0]
    this.az = def.at[1]
    this.base = grid.heightAt(this.ax, this.az)
    this.baseY = Number.isFinite(this.base) ? Math.max(0, this.base) + (def.y ?? 0.8) : def.y ?? 0.8
    this.radius = def.radius ?? 1.5
    this.roam = def.roam ?? 1
    this.t = seed * 1.7
    this.x = this.ax
    this.y = this.baseY
    this.z = this.az
    this.heading = 0
  }
  update(dt) {
    this.t += dt
    const t = this.t
    const moth = this.kind === 'moth'
    const nx = this.ax + Math.sin(t * (moth ? 2.1 : 0.53)) * this.roam + Math.sin(t * 1.9) * (moth ? 0.12 : 0.18)
    const nz = this.az + Math.sin(t * (moth ? 1.7 : 0.37) + 1) * this.roam * 0.75 + Math.cos(t * 2.3) * 0.1
    const ny = this.baseY + Math.sin(t * 2.6) * 0.13 + (moth ? Math.sin(t * 7) * 0.05 : 0)
    const dx = nx - this.x
    const dz = nz - this.z
    if (dx * dx + dz * dz > 1e-6) this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 6, dt)
    this.x = nx
    this.y = ny
    this.z = nz
    this.group.position.set(nx, ny, nz)
    this.group.rotation.y = this.heading
    const flap = 0.25 + Math.abs(Math.sin(t * (moth ? 22 : 15))) * 1.15
    this.wingL.rotation.z = flap
    this.wingR.rotation.z = -flap
  }
}

// ---- the cup, the pedal and the gate -----------------------------------------------------------
export class Gate {
  constructor(def, grid) {
    this.grid = grid
    this.cells = []
    grid.each(def, (i) => {
      this.cells.push(i)
      grid.setDyn(i, F_WALL, true)
      grid.top[i] = def.h
    })
    const along = def.d >= def.w ? 'z' : 'x'
    const m = makeGateMesh(along === 'z' ? def.d : def.w, def.h, along)
    this.group = m.group
    this.pivot = m.pivot
    this.group.position.set(def.x, grid.heightAt(def.x, def.z), def.z)
    this.opened = false
    this.swing = 0
  }
  open(w) {
    if (this.opened) return
    this.opened = true
    for (const i of this.cells) {
      this.grid.setDyn(i, F_WALL, false)
      this.grid.top[i] = this.grid.h[i]
    }
    w.sound?.gate(this.group.position.x, 0.4, this.group.position.z)
    w.emit('gate', null, this)
  }
  update(dt) {
    if (!this.opened) return
    this.swing = damp(this.swing, 1, 3.5, dt)
    this.pivot.rotation.y = -1.7 * this.swing + Math.sin(this.swing * 9) * 0.06 * (1 - this.swing)
  }
}

export class Cup {
  constructor(def, grid, gates) {
    this.mesh = makeCupMesh()
    this.group = new THREE.Group()
    this.group.add(this.mesh)
    this.grid = grid
    this.x = def.at[0]
    this.z = def.at[1]
    this.y = grid.heightAt(this.x, this.z)
    this.fall = new THREE.Vector2(def.fall[0], def.fall[1]).normalize()
    this.gate = def.gate != null ? gates[def.gate] : null
    this.state = 'sit'
    this.v = new THREE.Vector3()
    this.spin = new THREE.Vector3()
    if (def.pedal) {
      this.pedal = makePedalMesh()
      this.pedalAt = { x: def.pedal[0], z: def.pedal[1], y: grid.heightAt(def.pedal[0], def.pedal[1]) }
      this.pedal.position.set(this.pedalAt.x, this.pedalAt.y, this.pedalAt.z)
      this.group.add(this.pedal)
    }
    this.mesh.position.set(this.x, this.y, this.z)
    this.wobble = 0
    this.bounces = 0
  }
  knock(w) {
    if (this.state === 'fall' || this.state === 'done') return
    this.state = 'fall'
    this.v.set(this.fall.x * 1.25, 1.3, this.fall.y * 1.25)
    this.spin.set(this.fall.y * 9, 0, -this.fall.x * 9)
    w.sound?.knock(this.x, this.y, this.z)
    w.emit('knock', null, this)
  }
  update(dt, w) {
    this.wobble += dt
    if (this.state === 'sit' || this.state === 'aimed') {
      this.mesh.rotation.z = Math.sin(this.wobble * 2) * 0.03
      return
    }
    if (this.state !== 'fall') return
    this.v.y -= 9.8 * dt
    this.x += this.v.x * dt
    this.z += this.v.z * dt
    this.y += this.v.y * dt
    this.mesh.rotation.x += this.spin.x * dt
    this.mesh.rotation.z += this.spin.z * dt
    const floor = Math.max(0, this.grid.heightAt(this.x, this.z))
    if (this.y <= floor && this.v.y < 0) {
      this.y = floor
      if (this.bounces === 0) {
        w.sound?.clang(this.x, this.y, this.z)
        w.shake?.(0.05)
        if (this.pedalAt && dist(this.x, this.z, this.pedalAt.x, this.pedalAt.z) < 0.55) {
          this.pedal.scale.y = 0.4
          this.gate?.open(w)
        }
        w.emit('landed', null, this)
      }
      this.bounces++
      this.v.y = -this.v.y * 0.3
      this.v.x *= 0.5
      this.v.z *= 0.5
      this.spin.multiplyScalar(0.5)
      if (this.bounces > 2) {
        this.state = 'done'
        this.mesh.rotation.set(0, this.mesh.rotation.y, Math.PI / 2)
        this.y = floor + 0.06
      }
    }
    this.mesh.position.set(this.x, this.y, this.z)
  }
}

// ---- hiding places -------------------------------------------------------------------------
export class Hideout {
  constructor(def, grid, seed, dark) {
    const m = makeHideoutMesh(def.kind, def.r, seed)
    this.group = m.group
    this.body = m.body
    this.eyes = m.eyes
    this.kind = def.kind
    this.r = def.r
    this.x = def.at[0]
    this.z = def.at[1]
    this.out = def.out ?? null
    const h = grid.heightAt(this.x, this.z)
    this.y = Number.isFinite(h) && h > -1 ? h : 0
    if (def.kind === 'pipe' || def.kind === 'cupboard') this.y = this.out ? Math.max(0, grid.heightAt(this.out[0], this.out[1])) : 0
    this.revealR = this.r + 0.6
    this.occupant = null
    this.wobble = new Spring(0, 160, 7)
    this.dark = dark
    this.blink = 0
    this.group.position.set(this.x, this.y, this.z)
  }
  rustle(k = 1) {
    this.wobble.kick(k * 7)
  }
  update(dt, w) {
    const s = this.wobble.update(0, dt)
    this.body.rotation.z = s * 0.025
    this.body.scale.set(1 + Math.abs(s) * 0.012, 1 - s * 0.01, 1 + Math.abs(s) * 0.012)
    // someone's eyes in the dark opening
    const peeks = this.kind !== 'bush' && this.occupant
    this.blink -= dt
    if (this.blink < -3) this.blink = 0.15 + Math.random() * 0.1
    this.eyes.visible = !!peeks && this.blink <= 0 && (this.dark || this.kind !== 'cupboard')
    void w
  }
}

// ---- the flood --------------------------------------------------------------------------------
export class Flood {
  constructor(def, level) {
    const [W, D] = level.def.size
    this.def = def
    this.water = makeFloodMesh(W, D, level.theme.flood ?? '#5d8fa8')
    this.group = this.water.mesh
    this.level = def.from
    this.flagged = -Infinity
    this.grid = level.grid
    this.group.visible = false
  }
  // progress: 0 at the start of the level, 1 when the storm arrives
  update(dt, w, progress) {
    const d = this.def
    this.level = d.from + (d.to - d.from) * smooth(d.start, d.end, progress)
    this.group.visible = this.level > -0.08
    if (this.group.visible) this.water.update(w.t, this.level)
    if (Math.abs(this.level - this.flagged) < 0.01) return false
    this.flagged = this.level
    const g = this.grid
    let changed = false
    for (let i = 0; i < g.n; i++) {
      if (g.flags[i] & F_WALL) continue
      const under = Number.isFinite(g.top[i]) && g.h[i] < this.level - 0.03
      if (under !== ((g.dyn[i] & F_WATER) !== 0)) {
        g.setDyn(i, F_WATER, under)
        changed = true
      }
    }
    return changed
  }
}

// The drain's flowing channel: only a picture, the grid already refuses it.
export class Channel {
  constructor(shape, rand) {
    this.water = makeChannelWater(shape.x - shape.w / 2, shape.x + shape.w / 2, shape.z - shape.d / 2 + 0.02, shape.z + shape.d / 2 - 0.02, shape.h + 0.17, rand)
    this.group = this.water.group
  }
  update(dt, w) {
    this.water.update(w.t)
  }
}

