// One kitten: what it wants, how it moves, and how it looks while doing it.
//
// States: hidden (in a bush or pipe, meowing), idle, chase (the dot!), flee
// (the vacuum), stare (a butterfly), eat (greedy), sleep (sleepy), swim (the
// flood), box (sitting in a cardboard box, maybe riding it), basket (rescued).
// Short animated moves (hops, pounces, swats, shakes, yawns) run as actions on
// top of whichever state the kitten is in.
import * as THREE from 'three'
import { clamp, damp, dampAngle, angleTo, dist, smooth, lerp, Spring } from '../core/mathx.js'
import { makeRng } from '../core/rng.js'
import { STEP, JUMP_UP } from '../world/grid.js'
import { buildKitten, newPose, poseKitten } from './kitten-model.js'

export const KITTEN_SCALE = 1.3 // kittens read better a bit oversized for the diorama
const RADIUS = 0.14 // against walls
const SEP = 0.46 // personal space
const WALK = 1.15
const TROT = 2.0
const RUN = 3.05
const NOTICE = 6.5 // how far along the path a kitten notices the dot
const LOSE = 9.5
const ARRIVE = 0.42

const SPEED = { plain: 1, shy: 0.8, greedy: 1, chaotic: 1.28, sleepy: 0.82 }
const POSE_KEYS = [
  'sit', 'loaf', 'crouch', 'arch', 'swim', 'sleep', 'eat', 'groom', 'wiggle', 'swat', 'shake', 'meow',
  'earFlat', 'eyesClosed', 'tailUp', 'tailWag', 'tailCurl', 'tailPuff', 'tilt', 'air',
]

let nextId = 1

export class Kitten {
  constructor(genome, { shine = false } = {}) {
    this.id = nextId++
    this.g = genome
    this.trait = genome.trait
    this.name = genome.name
    this.rand = makeRng((genome.seed * 31 + 7) >>> 0)
    this.rig = buildKitten(genome, { shine })
    this.group = new THREE.Group()
    this.group.add(this.rig.mesh)
    this.scale = genome.size * KITTEN_SCALE
    this.group.scale.setScalar(this.scale)
    this.pose = newPose()
    this.target = newPose()
    this.squash = new Spring(0, 240, 13)
    this.sway = new Spring(0, 55, 6)

    this.x = 0
    this.y = 0
    this.z = 0
    this.floor = 0
    this.vx = 0
    this.vz = 0
    this.heading = this.rand.range(-Math.PI, Math.PI)
    this.turnRate = 0
    this.speedNow = 0
    this.air = null // a hop up or down a step
    this.action = null
    this.state = 'idle'
    this.stateT = 0
    this.t = this.rand.range(0, 10)

    this.goal = null
    this.waypoint = false
    this.speedWant = 0
    this.look = null
    this.mood = 'neutral'
    this.backing = false

    this.box = null
    this.seat = -1
    this.seatYaw = 0
    this.basket = null
    this.hideout = null
    this.food = null
    this.stareAt = null
    this.fleeFrom = null
    this.rescued = false
    this.emote = null

    this.attn = 0 // how long the dot has been on this kitten
    this.drowsy = 0
    this.wake = 0
    this.lostT = 0
    this.eating = 0
    this.pounceCD = this.rand.range(0.5, 2)
    this.swatCD = 0
    this.foodCD = 0
    this.stareImmune = 0
    this.wakeImmune = 0
    this.boxBan = new Map() // box -> seconds before it may climb back in
    this.idleMode = 'stand'
    this.idleT = this.rand.range(0.5, 2.5)
    this.lookAround = { x: 0, y: 0, z: 0, t: 0 }
    this.blinkT = this.rand.range(1, 4)
    this.blinkLeft = 0
    this.twitchT = this.rand.range(1, 5)
    this.twitch = [0, 0]
    this.meowT = this.rand.range(2, 6)
    this.stuckT = 0
  }

  get free() {
    return this.state !== 'hidden' && this.state !== 'box' && this.state !== 'basket' && !(this.action && this.action.into)
  }
  get visible() {
    return this.state !== 'hidden'
  }

  // ---- placing ---------------------------------------------------------------
  spawn(x, z, grid) {
    let i = grid.index(x, z)
    if (!grid.standable(i)) i = grid.nearestStandable(x, z, null, 2)
    if (i >= 0) {
      const inside = grid.index(x, z) === i
      this.x = inside ? x : grid.cx(i)
      this.z = inside ? z : grid.cz(i)
      this.floor = this.y = grid.h[i]
    } else {
      this.x = x
      this.z = z
    }
    this.place()
  }

  hide(hideout) {
    this.hideout = hideout
    hideout.occupant = this
    this.x = hideout.x
    this.z = hideout.z
    this.y = this.floor = hideout.y
    this.setState('hidden')
    this.group.visible = false
    this.meowT = this.rand.range(1.5, 4)
  }

  asleep() {
    this.setState('sleep')
    this.pose.loaf = this.pose.sleep = this.pose.eyesClosed = 1
    this.pose.tailCurl = 1
  }

  setState(s) {
    if (this.state === s) return
    this.state = s
    this.stateT = 0
    this.attn = 0
  }

  say(kind, seconds) {
    this.emote = { kind, until: this.t + seconds }
  }

  // ---- the frame --------------------------------------------------------------
  update(dt, w) {
    this.t += dt
    this.stateT += dt
    this.foodCD -= dt
    this.stareImmune -= dt
    this.wakeImmune -= dt
    this.swatCD -= dt
    for (const [box, t] of this.boxBan) {
      if (t - dt <= 0) this.boxBan.delete(box)
      else this.boxBan.set(box, t - dt)
    }
    if (this.emote && this.t > this.emote.until) this.emote = null

    // the dot resting on (or wiggling over) this kitten
    const d = w.dot
    const on = d.active && Math.abs(d.y - this.y) < 1 && dist(d.x, d.z, this.x, this.z) < 0.55
    this.attn = on ? this.attn + dt * (1 + d.wiggle * 2) : Math.max(0, this.attn - dt * 1.5)

    this.goal = null
    this.speedWant = 0
    this.look = null
    this.mood = 'neutral'
    this.backing = false
    this.waypoint = false

    if (this.action) this.runAction(dt, w)
    else {
      switch (this.state) {
        case 'hidden':
          this.hiddenUpdate(dt, w)
          break
        case 'box':
          this.boxUpdate(dt, w)
          break
        case 'basket':
          this.basketUpdate(dt, w)
          break
        case 'sleep':
          this.sleepUpdate(dt, w)
          break
        case 'swim':
          this.swimUpdate(dt, w)
          break
        default:
          this.freeUpdate(dt, w)
      }
    }
    if (this.state !== 'hidden') {
      this.animate(dt, w)
      this.place()
    }
  }

  place() {
    this.group.position.set(this.x, this.y, this.z)
    this.group.rotation.y = this.heading
  }

  // ---- hidden: meow until the dot comes close -----------------------------------
  hiddenUpdate(dt, w) {
    const h = this.hideout
    this.meowT -= dt
    if (this.meowT <= 0) {
      this.meowT = this.rand.range(3.2, 6)
      w.sound?.meow(h.x, h.y + 0.3, h.z, this.g.pitch, 'meow')
      h.rustle(0.7)
      w.emit('meow', this)
    }
    const d = w.dot
    if (!w.demo && d.active && dist(d.x, d.z, h.x, h.z) < h.revealR) this.reveal(w)
  }

  reveal(w) {
    const h = this.hideout
    const g = w.grid
    const d = w.dot
    // pop out on the side the dot is on
    let ax = d.x - h.x
    let az = d.z - h.z
    const al = Math.hypot(ax, az) || 1
    ax /= al
    az /= al
    let i = h.out
      ? g.nearestStandable(h.out[0], h.out[1], null, 1)
      : g.nearestStandable(h.x + ax * (h.r + 0.35), h.z + az * (h.r + 0.35), null, 1.2)
    if (i < 0) i = g.nearestStandable(h.x, h.z, null, 2)
    h.occupant = null
    h.rustle(1.4)
    this.hideout = null
    this.group.visible = true
    this.setState('idle')
    this.heading = Math.atan2(ax, az)
    const tx = i >= 0 ? g.cx(i) : h.x + ax
    const tz = i >= 0 ? g.cz(i) : h.z + az
    const ty = i >= 0 ? g.h[i] : h.y
    this.hopTo(() => ({ x: tx, y: ty, z: tz }), {
      dur: 0.45,
      peak: 0.35,
      then: () => {
        this.floor = ty
        this.setState('chase')
        this.say('!', 0.9)
      },
    })
    w.sound?.meow(h.x, h.y + 0.3, h.z, this.g.pitch, 'trill')
    w.emit('reveal', this)
  }

  // ---- in a box: sit, peek, maybe doze off ----------------------------------------
  boxUpdate(dt, w) {
    const s = this.box.seatPos(this.seat)
    this.x = s.x
    this.z = s.z
    this.y = s.y
    this.floor = s.y
    this.vx = this.vz = 0
    this.speedNow = 0
    this.heading = dampAngle(this.heading, s.yaw + this.seatYaw, 3, dt)
    const d = w.dot
    if (d.active && dist(d.x, d.z, this.x, this.z) < 5) this.look = d
    else this.idleLook(dt)
    // riding a boat: keep low, the footbridges are not very high
    if (this.box.boat) this.mood = 'boat'
    else this.mood = this.trait === 'sleepy' && this.stateT > 6 && !(d.active && dist(d.x, d.z, this.x, this.z) < 1.5) ? 'doze' : 'box'
  }

  leaveBox(w, tx, ty, tz) {
    const box = this.box
    box.release(this)
    this.boxBan.set(box, 5)
    this.box = null
    this.seat = -1
    this.setState('idle')
    this.wakeImmune = 4
    this.drowsy = 0
    this.hopTo(() => ({ x: tx, y: ty, z: tz }), {
      dur: 0.42,
      peak: 0.3,
      then: () => {
        this.floor = ty
        this.setState('chase')
      },
    })
    w.sound?.rustle(box.x, box.y, box.z)
    w.emit('unbox', this)
  }

  enterBox(box, w) {
    const seat = box.claim(this)
    if (seat < 0) return false
    this.box = box
    this.seat = seat
    this.seatYaw = this.rand.range(-0.6, 0.6)
    this.hopTo(() => box.seatPos(seat), {
      dur: 0.42,
      peak: 0.36,
      into: true,
      then: () => {
        this.setState('box')
        box.bump()
        this.say(this.trait === 'sleepy' ? 'z' : 'heart', 1)
      },
    })
    w.sound?.rustle(box.x, box.y, box.z)
    w.emit('box', this, box)
    return true
  }

  // ---- rescued ----------------------------------------------------------------------
  enterBasket(basket, w) {
    const seat = basket.claim(this)
    this.basket = basket
    this.seat = seat
    this.seatYaw = this.rand.range(-0.9, 0.9)
    this.hopTo(() => basket.seatPos(seat), {
      dur: 0.5,
      peak: 0.45,
      into: true,
      then: () => {
        this.setState('basket')
        this.rescued = true
        basket.bump()
        this.say('heart', 2.4)
        w.sound?.meow(this.x, this.y + 0.3, this.z, this.g.pitch, 'trill')
        w.emit('rescue', this)
      },
    })
  }

  basketUpdate(dt, w) {
    const s = this.basket.seatPos(this.seat)
    this.x = s.x
    this.z = s.z
    this.y = s.y
    this.floor = s.y
    this.speedNow = 0
    this.heading = dampAngle(this.heading, s.yaw + this.seatYaw, 2, dt)
    const d = w.dot
    if (d.active && dist(d.x, d.z, this.x, this.z) < 3) this.look = d
    else this.idleLook(dt)
    this.mood = (this.id + Math.floor(this.t / 7)) % 3 === 0 ? 'content' : 'basket'
  }

  // ---- sleeping --------------------------------------------------------------------
  sleepUpdate(dt, w) {
    this.speedNow = 0
    this.vx = this.vz = 0
    this.mood = 'sleep'
    // nobody sleeps through the water reaching their whiskers
    const i = w.grid.index(this.x, this.z)
    if (w.waterLevel > -Infinity && w.grid.flooded(i) && w.waterLevel > w.grid.h[i] + 0.04) {
      this.say('!', 0.8)
      this.wakeUp(w)
      return
    }
    if (!this.emote) this.say('z', 3)
    this.wake = this.attn > 0 ? this.wake + dt * (1 + w.dot.wiggle * 2.5) : Math.max(0, this.wake - dt * 0.4)
    if (this.wake > 0.75) this.wakeUp(w)
  }

  wakeUp(w) {
    this.wake = 0
    this.drowsy = 0
    this.wakeImmune = 5
    this.emote = null
    this.setState('idle')
    this.action = { kind: 'stretch', t: 0, dur: 0.9 }
    w.sound?.meow(this.x, this.y + 0.3, this.z, this.g.pitch * 0.92, 'mew')
    w.emit('wake', this)
  }

  // ---- swimming in the flood ------------------------------------------------------------
  swimUpdate(dt, w) {
    const g = w.grid
    const i = g.index(this.x, this.z)
    const level = w.waterLevel
    if (!g.flooded(i) || level < g.h[i] + 0.05) {
      if (g.standable(i)) {
        this.floor = g.h[i]
        this.setState('idle')
        this.action = { kind: 'shake', t: 0, dur: 0.75 }
        w.sound?.splash(this.x, this.y, this.z)
        return
      }
    }
    this.mood = 'swim'
    this.meowT -= dt
    if (this.meowT <= 0) {
      this.meowT = this.rand.range(2, 3.5)
      this.say('drop', 1.2)
      w.sound?.meow(this.x, level, this.z, this.g.pitch * 1.1, 'mew')
    }
    const j = w.dry ? g.bestStep(w.dry, i, { swim: true, waterLevel: level }) : -1
    if (j >= 0) {
      this.goal = { x: g.cx(j), z: g.cz(j) }
      this.waypoint = true
      this.speedWant = 0.75
    }
    this.steer(dt, w, true)
    this.y = damp(this.y, level - 0.02, 8, dt)
    this.floor = Math.max(g.h[Math.max(0, g.index(this.x, this.z))] ?? this.floor, level - 0.2)
  }

  // ---- loose on the level ---------------------------------------------------------------
  freeUpdate(dt, w) {
    const g = w.grid
    const d = w.dot
    const i = g.index(this.x, this.z)

    if (w.waterLevel > -Infinity && g.flooded(i) && w.waterLevel > g.h[i] + 0.05) {
      this.setState('swim')
      this.meowT = 0.3
      w.emit('swim', this)
      return
    }

    // the vacuum is terrifying, unless the dot is sitting on top of it
    for (const v of w.vacuums) {
      const dv = dist(this.x, this.z, v.x, v.z)
      if (dv > 1.6) continue
      const lured = this.state === 'chase' && d.active && v.box && dist(d.x, d.z, v.box.x, v.box.z) < 0.6
      if (lured) continue
      if (this.state !== 'flee') {
        this.setState('flee')
        this.say('!', 1.1)
        this.squash.kick(-2)
        w.sound?.hiss(this.x, this.y, this.z)
        w.emit('scared', this)
      }
      this.fleeFrom = v
    }
    if (this.state === 'flee') {
      const src = this.fleeFrom
      const dx = this.x - src.x
      const dz = this.z - src.z
      const dd = Math.hypot(dx, dz) || 1
      if (this.stateT > 1.3 && dd > 2) this.setState('idle')
      else {
        this.goal = { x: this.x + (dx / dd) * 2, z: this.z + (dz / dd) * 2 }
        this.speedWant = RUN * 1.05
        this.waypoint = true
        this.look = src
        this.mood = 'scared'
        this.steer(dt, w)
        return
      }
    }

    // a butterfly or a moth: everything stops
    if (this.state === 'stare') {
      const f = this.stareAt
      if (!f || dist(f.x, f.z, this.x, this.z) > f.radius + 0.6 || this.attn > 0.5) {
        this.setState('idle')
        this.stareImmune = 4
        if (this.attn > 0.5) this.say('!', 0.6)
      } else {
        this.look = f
        this.mood = 'hunt'
        this.steer(dt, w)
        return
      }
    } else if (this.stareImmune <= 0 && !w.demo) {
      for (const f of w.flutters) {
        if (dist(f.x, f.z, this.x, this.z) < f.radius && Math.abs(f.y - this.y) < 2.5) {
          this.setState('stare')
          this.stareAt = f
          this.say('eye', 1.6)
          w.emit('stare', this)
          this.steer(dt, w)
          return
        }
      }
    }

    // boxes are irresistible
    if (this.state !== 'eat') {
      for (const box of w.boxes) {
        if (!box.hasRoom || this.boxBan.has(box) || !box.open) continue
        if (dist(box.x, box.z, this.x, this.z) < box.reach && Math.abs(box.y - this.floor) <= JUMP_UP + 0.05) {
          if (this.enterBox(box, w)) return
        }
      }
    }

    // anything balanced on an edge has to go
    for (const cup of w.cups) {
      if (cup.state !== 'sit') continue
      if (dist(cup.x, cup.z, this.x, this.z) < 0.5 && Math.abs(cup.y - this.floor) < 0.2) {
        this.heading = Math.atan2(cup.x - this.x, cup.z - this.z)
        this.action = { kind: 'swat', t: 0, dur: 0.55, cup }
        cup.state = 'aimed'
        this.say('spark', 0.8)
        w.emit('swat', this, cup)
        return
      }
    }

    // the basket
    const bk = w.basket
    if (bk && !w.demo) {
      const db = dist(bk.x, bk.z, this.x, this.z)
      if (db < bk.reach && Math.abs(bk.y - this.floor) <= JUMP_UP) {
        this.enterBasket(bk, w)
        return
      }
      // shy kittens feel safe near it; greedy ones smell the bowl
      const lure = this.trait === 'shy' ? 2.3 : this.trait === 'greedy' ? 2.7 : 0
      if (db < lure && this.reachable(g, bk.x, bk.z)) {
        this.goal = bk
        this.speedWant = WALK
        this.look = bk
        this.mood = 'happy'
        this.steer(dt, w)
        return
      }
    }

    // greedy: food beats everything else
    if (this.trait === 'greedy' && this.state !== 'eat' && this.foodCD <= 0) {
      let best = null
      let bestD = 3.2
      for (const f of w.foods) {
        if (f.eaten) continue
        const df = dist(f.x, f.z, this.x, this.z)
        if (df < bestD && Math.abs(f.y - this.floor) < 0.9 && this.reachable(g, f.x, f.z)) {
          best = f
          bestD = df
        }
      }
      if (best) {
        this.setState('eat')
        this.food = best
        this.eating = 0
        this.say('fish', 1.6)
        w.emit('food', this)
      }
    }
    if (this.state === 'eat') {
      const f = this.food
      if (!f || f.eaten) this.setState('idle')
      else {
        const df = dist(f.x, f.z, this.x, this.z)
        this.look = f
        if (df > 0.3) {
          this.goal = f
          this.speedWant = TROT * SPEED.greedy
          if (this.stateT > 6) {
            this.foodCD = 8
            this.setState('idle')
          }
        } else {
          this.mood = 'eat'
          this.eating += dt
          if (this.eating > 2.2) {
            f.eat()
            this.say('heart', 1.3)
            this.setState('idle')
            w.emit('ate', this)
          }
        }
        this.steer(dt, w)
        return
      }
    }

    // sleepy: nods off when the dot stops being interesting
    if (this.trait === 'sleepy' && !w.demo) {
      const dull = !d.active || d.still > 1.3 || this.state !== 'chase'
      this.drowsy = clamp(this.drowsy + (dull ? dt : -dt * 1.6), 0, 4)
      if (this.drowsy > 2.6 && this.wakeImmune <= 0) {
        this.action = { kind: 'yawn', t: 0, dur: 1.2 }
        this.speedNow = 0
        return
      }
    }

    // the dot
    const fi = w.fieldReady && i >= 0 ? w.field[i] : Infinity
    const dd = d.active ? dist(d.x, d.z, this.x, this.z) : Infinity
    if (this.state === 'chase') {
      if (!d.active) {
        this.lostT += dt
        if (this.lostT > 1) {
          this.setState('idle')
          this.say('?', 1.2)
          this.lostT = 0
        }
      } else if (fi > LOSE) this.setState('idle')
      else this.lostT = 0
    } else if (d.active && fi <= NOTICE) {
      this.setState('chase')
      this.lostT = 0
      this.squash.kick(-1.2)
      w.emit('notice', this)
    }
    if (this.state === 'chase') {
      this.chase(dt, w, fi, dd)
      return
    }

    this.idle(dt, w)
  }

  // Can it get there walking and hopping in a straight line?
  reachable(g, x1, z1) {
    const len = Math.hypot(x1 - this.x, z1 - this.z)
    const n = Math.max(1, Math.ceil(len / 0.12))
    let floor = this.floor
    for (let s = 1; s <= n; s++) {
      const t = s / n
      const i = g.index(this.x + (x1 - this.x) * t, this.z + (z1 - this.z) * t)
      if (s === n && i >= 0) return true // the target itself may sit on something (a bowl, a basket)
      if (!g.canStand(i, floor)) return false
      floor = g.h[i]
    }
    return true
  }

  chase(dt, w, fi, dd) {
    const d = w.dot
    const sp = SPEED[this.trait]
    this.look = d
    this.mood = 'happy'
    const pace = (f) => (f < 1.1 ? WALK : f < 2.4 ? lerp(WALK, TROT, (f - 1.1) / 1.3) : lerp(TROT, RUN, clamp((f - 2.4) / 1.5, 0, 1)))

    if (this.trait === 'shy') {
      const keep = 2
      this.mood = 'shy'
      if (dd < 1.35) {
        const ax = this.x - d.x
        const az = this.z - d.z
        const al = Math.hypot(ax, az) || 1
        this.goal = { x: this.x + (ax / al) * 1.5, z: this.z + (az / al) * 1.5 }
        this.waypoint = true
        this.speedWant = WALK * 0.9
        this.backing = true
        if (!this.emote) this.say('sweat', 0.9)
      } else if (fi > keep + 0.5) {
        this.followDot(w)
        this.speedWant = pace(fi - keep) * sp
      }
      this.steer(dt, w)
      return
    }

    if (this.trait === 'chaotic') {
      this.pounceCD -= dt
      if (dd > 0.7 && dd < 2.5 && this.pounceCD <= 0) {
        this.pounceCD = this.rand.range(1.4, 3.2)
        this.startPounce(w, d.x, d.z, this.rand.range(0.5, 1.0))
        return
      }
      this.followDot(w, dd < 1.2 ? 0.9 : 0.4)
      this.speedWant = Math.max(TROT, pace(fi)) * sp
      this.steer(dt, w)
      return
    }

    let closer = 0
    for (const o of w.kittens) if (o !== this && o.state === 'chase' && dist(o.x, o.z, d.x, d.z) < dd) closer++
    const arrive = Math.min(1.3, ARRIVE + closer * 0.16)
    if (dd < arrive || (fi < 0.35 && dd < 1.3)) {
      // got it (or as close as it can get): watch it, bat at it
      this.mood = 'play'
      if (dd < arrive && dd < 0.75 && this.swatCD <= 0 && d.still < 0.6) {
        this.swatCD = this.rand.range(0.9, 2.2)
        this.action = { kind: 'swat', t: 0, dur: 0.5 }
      }
      this.steer(dt, w)
      return
    }
    this.followDot(w)
    this.speedWant = pace(fi) * sp
    this.steer(dt, w)
  }

  // Pick the next point to head for: the dot itself when the way is clear,
  // otherwise a few cells along the distance field.
  followDot(w, overshoot = 0) {
    const g = w.grid
    const d = w.dot
    const i = g.index(this.x, this.z)
    const dd = dist(d.x, d.z, this.x, this.z)
    if (dd < 4.5 && Math.abs(d.y - this.floor) < STEP + 0.05 && g.lineClear(this.x, this.z, d.x, d.z, this.floor)) {
      let tx = d.x
      let tz = d.z
      if (overshoot) {
        const ux = (d.x - this.x) / (dd || 1)
        const uz = (d.z - this.z) / (dd || 1)
        tx += ux * overshoot
        tz += uz * overshoot
        this.waypoint = true
      }
      this.goal = { x: tx, z: tz }
      return
    }
    if (!w.fieldReady || i < 0) return
    let j = i
    let best = i
    for (let s = 0; s < 4; s++) {
      const n = g.bestStep(w.field, j)
      if (n < 0) break
      j = n
      if (s === 0 || g.lineClear(this.x, this.z, g.cx(j), g.cz(j), this.floor)) best = j
      else break
    }
    if (best === i) return
    this.goal = { x: g.cx(best), z: g.cz(best) }
    this.waypoint = true
  }

  startPounce(w, x, z, overshoot) {
    const ux = x - this.x
    const uz = z - this.z
    const ul = Math.hypot(ux, uz) || 1
    this.action = {
      kind: 'pounce',
      t: 0,
      crouch: 0.38,
      dur: 0.38 + 0.42,
      tx: x + (ux / ul) * overshoot,
      tz: z + (uz / ul) * overshoot,
      landed: null,
    }
    this.vx = this.vz = 0
    this.say('spark', 1)
  }

  idle(dt, w) {
    const g = w.grid
    const d = w.dot
    this.idleT -= dt
    if (this.idleT <= 0) {
      const r = this.rand()
      const sleepy = this.trait === 'sleepy'
      const options = [
        ['stand', 2],
        ['sit', 2.4],
        ['loaf', sleepy ? 2.5 : 1],
        ['groom', 1.2],
        ['wander', sleepy ? 0.6 : 3],
        ['zoom', this.trait === 'chaotic' ? 1.8 : 0],
      ]
      const total = options.reduce((s, o) => s + o[1], 0)
      let pick = r * total
      for (const [mode, weight] of options) if ((pick -= weight) <= 0) {
        this.idleMode = mode
        break
      }
      this.idleT = this.rand.range(1.8, 4.5)
      this.wanderTo = null
      if (this.idleMode === 'wander' || this.idleMode === 'zoom') {
        const reach = this.idleMode === 'zoom' ? 3 : 1.6
        for (let k = 0; k < 6; k++) {
          const a = this.rand.range(-Math.PI, Math.PI)
          const tx = this.x + Math.sin(a) * reach * this.rand.range(0.5, 1)
          const tz = this.z + Math.cos(a) * reach * this.rand.range(0.5, 1)
          if (g.lineClear(this.x, this.z, tx, tz, this.floor)) {
            this.wanderTo = { x: tx, z: tz }
            break
          }
        }
        if (!this.wanderTo) this.idleMode = 'sit'
      }
    }
    if (this.wanderTo) {
      this.goal = this.wanderTo
      this.speedWant = this.idleMode === 'zoom' ? RUN * 1.1 : WALK * 0.55
      if (dist(this.wanderTo.x, this.wanderTo.z, this.x, this.z) < 0.15) {
        this.wanderTo = null
        this.idleT = Math.min(this.idleT, 0.4)
        this.idleMode = 'stand'
      }
    }
    // a lonely meow now and then
    this.meowT -= dt
    if (this.meowT <= 0) {
      this.meowT = this.rand.range(9, 18)
      if (!w.demo || this.rand() < 0.3) {
        w.sound?.meow(this.x, this.y + 0.3, this.z, this.g.pitch, 'meow')
        this.action = this.action ?? { kind: 'meow', t: 0, dur: 0.6 }
      }
    }
    if (d.active && dist(d.x, d.z, this.x, this.z) < 9) this.look = d
    else this.idleLook(dt)
    this.mood = this.idleMode
    this.steer(dt, w)
  }

  idleLook(dt) {
    const L = this.lookAround
    L.t -= dt
    if (L.t <= 0) {
      L.t = this.rand.range(1.2, 3.5)
      const a = this.heading + this.rand.range(-1.2, 1.2)
      L.x = this.x + Math.sin(a) * 2
      L.z = this.z + Math.cos(a) * 2
      L.y = this.y + this.rand.range(-0.3, 0.8)
    }
    this.look = L
  }

  startle(w) {
    if (!this.free || this.state === 'sleep') return
    this.say('!', 0.8)
    this.squash.kick(-2.5)
    if (this.trait === 'shy' && this.state !== 'flee') {
      this.setState('flee')
      this.fleeFrom = { x: this.x + this.rand.range(-1, 1), z: this.z + this.rand.range(-1, 1) }
    }
  }

  // ---- moves ---------------------------------------------------------------------------
  hopTo(target, { dur = 0.42, peak = 0.32, then = null, into = false } = {}) {
    this.action = { kind: 'hop', t: 0, dur, peak, x0: this.x, y0: this.y, z0: this.z, target, then, into }
    this.vx = this.vz = 0
    this.air = null
    this.squash.kick(-1.6)
  }

  runAction(dt, w) {
    const a = this.action
    a.t += dt
    const k = clamp(a.t / a.dur, 0, 1)
    this.speedNow = 0
    switch (a.kind) {
      case 'hop': {
        const tg = a.target()
        const e = k * k * (3 - 2 * k)
        this.x = lerp(a.x0, tg.x, e)
        this.z = lerp(a.z0, tg.z, e)
        this.y = lerp(a.y0, tg.y, k) + a.peak * 4 * k * (1 - k) + Math.max(0, tg.y - a.y0) * 0.3 * Math.sin(k * Math.PI)
        const dx = tg.x - a.x0
        const dz = tg.z - a.z0
        if (dx * dx + dz * dz > 0.001) this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 14, dt)
        if (k >= 1) {
          this.action = null
          this.squash.kick(2.2)
          a.then?.()
        }
        break
      }
      case 'pounce': {
        if (a.t < a.crouch) {
          this.heading = dampAngle(this.heading, Math.atan2(a.tx - this.x, a.tz - this.z), 12, dt)
          break
        }
        if (!a.landed) {
          a.landed = this.landingSpot(w.grid, a.tx, a.tz)
          a.x0 = this.x
          a.z0 = this.z
          a.y0 = this.y
          this.squash.kick(-2.4)
          w.sound?.pounce(this.x, this.y, this.z)
        }
        const j = clamp((a.t - a.crouch) / (a.dur - a.crouch), 0, 1)
        const e = j * (2 - j)
        this.x = lerp(a.x0, a.landed.x, e)
        this.z = lerp(a.z0, a.landed.z, e)
        this.y = lerp(a.y0, a.landed.y, j) + 0.3 * 4 * j * (1 - j)
        if (j >= 1) {
          this.floor = a.landed.y
          this.action = null
          this.squash.kick(2.6)
        }
        break
      }
      case 'swat':
        if (a.cup && !a.hit && a.t > 0.22) {
          a.hit = true
          a.cup.knock(w)
        }
        if (k >= 1) this.action = null
        break
      case 'yawn':
        if (k >= 1) {
          this.action = null
          this.setState('sleep')
          w.sound?.meow(this.x, this.y + 0.25, this.z, this.g.pitch * 0.8, 'mew')
          w.emit('sleep', this)
        }
        break
      default: // stretch, shake, meow
        if (k >= 1) this.action = null
    }
    // swats can still be nudged by the crowd; everything else is committed
    if (a.kind === 'swat' || a.kind === 'meow' || a.kind === 'stretch') this.steer(dt, w)
  }

  // the furthest point along a pounce it can actually land on
  landingSpot(g, tx, tz) {
    const n = Math.ceil(dist(tx, tz, this.x, this.z) / 0.1)
    let best = { x: this.x, y: this.floor, z: this.z }
    let floor = this.floor
    for (let s = 1; s <= n; s++) {
      const t = s / n
      const x = lerp(this.x, tx, t)
      const z = lerp(this.z, tz, t)
      const i = g.index(x, z)
      if (!g.canStand(i, floor) || Math.abs(g.h[i] - floor) > 0.45) break
      floor = g.h[i]
      // keep clear of walls so the landing does not end up inside one
      if (g.canStand(g.index(x + RADIUS, z), floor) && g.canStand(g.index(x - RADIUS, z), floor) &&
          g.canStand(g.index(x, z + RADIUS), floor) && g.canStand(g.index(x, z - RADIUS), floor))
        best = { x, y: floor, z }
    }
    return best
  }

  // ---- moving ------------------------------------------------------------------------------
  steer(dt, w, swim = false) {
    const g = w.grid
    let wx = 0
    let wz = 0
    if (this.goal) {
      const dx = this.goal.x - this.x
      const dz = this.goal.z - this.z
      const dl = Math.hypot(dx, dz)
      if (dl > 0.03) {
        const s = this.speedWant * (this.waypoint ? 1 : clamp(dl / 0.45, 0.2, 1))
        wx = (dx / dl) * s
        wz = (dz / dl) * s
      }
    }
    // personal space
    for (const o of w.kittens) {
      if (o === this || !o.free || o.state === 'hidden') continue
      const dx = this.x - o.x
      const dz = this.z - o.z
      const d2 = dx * dx + dz * dz
      if (d2 > SEP * SEP || Math.abs(o.floor - this.floor) > 0.35) continue
      const dl = Math.sqrt(d2) || 0.01
      const push = ((SEP - dl) / SEP) * (this.trait === 'chaotic' ? 3.4 : 2.4)
      wx += ((dx || this.rand() - 0.5) / dl) * push
      wz += ((dz || this.rand() - 0.5) / dl) * push
    }
    const acc = this.state === 'flee' ? 14 : 9
    this.vx = damp(this.vx, wx, acc, dt)
    this.vz = damp(this.vz, wz, acc, dt)
    // gusts push anything out in the open
    const i0 = g.index(this.x, this.z)
    if (w.wind.force > 0 && !swim && !g.sheltered(i0) && this.state !== 'sleep') {
      this.vx += w.wind.x * w.wind.force * dt
      this.vz += w.wind.z * w.wind.force * dt
    }
    const px = this.x
    const pz = this.z
    this.x += this.vx * dt
    this.z += this.vz * dt
    this.collide(g, swim, w.waterLevel)
    const moved = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-4)
    this.speedNow = damp(this.speedNow, moved, 12, dt)
    // pressing into a wall: let velocity go so it does not slide forever
    if (moved < Math.hypot(this.vx, this.vz) * 0.5) {
      this.vx *= 0.8
      this.vz *= 0.8
    }
    if (!swim) this.updateFloor(dt, g)

    const before = this.heading
    const sp = Math.hypot(this.vx, this.vz)
    if (this.backing && this.look) this.heading = dampAngle(this.heading, Math.atan2(this.look.x - this.x, this.look.z - this.z), 6, dt)
    else if (sp > 0.12) this.heading = dampAngle(this.heading, Math.atan2(this.vx, this.vz), swim ? 4 : 10, dt)
    else if (this.look) {
      // standing still: turn the body when the head cannot reach
      const want = Math.atan2(this.look.x - this.x, this.look.z - this.z)
      if (Math.abs(angleTo(this.heading, want)) > 1.1) this.heading = dampAngle(this.heading, want, 3, dt)
    }
    this.turnRate = angleTo(before, this.heading) / Math.max(dt, 1e-4)
  }

  collide(g, swim, waterLevel) {
    const r = RADIUS
    const ok = (i) => (swim ? !g.solid(i) && (g.wet(i) || g.h[i] - Math.max(waterLevel, this.floor) <= JUMP_UP) : g.canStand(i, this.floor))
    for (let iter = 0; iter < 2; iter++) {
      const c0 = g.col(this.x - r)
      const c1 = g.col(this.x + r)
      const r0 = g.row(this.z - r)
      const r1 = g.row(this.z + r)
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          const outside = cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows
          if (!outside && ok(rr * g.cols + cc)) continue
          const minx = g.x0 + cc * g.cell
          const minz = g.z0 + rr * g.cell
          const px = clamp(this.x, minx, minx + g.cell)
          const pz = clamp(this.z, minz, minz + g.cell)
          const dx = this.x - px
          const dz = this.z - pz
          const d2 = dx * dx + dz * dz
          if (d2 >= r * r) continue
          if (d2 > 1e-10) {
            const dl = Math.sqrt(d2)
            this.x += (dx / dl) * (r - dl)
            this.z += (dz / dl) * (r - dl)
          } else {
            const left = this.x - minx
            const right = minx + g.cell - this.x
            const near = this.z - minz
            const far = minz + g.cell - this.z
            const m = Math.min(left, right, near, far)
            if (m === left) this.x = minx - r
            else if (m === right) this.x = minx + g.cell + r
            else if (m === near) this.z = minz - r
            else this.z = minz + g.cell + r
          }
        }
      }
    }
    const i = g.index(this.x, this.z)
    if (i < 0 || !ok(i)) {
      this.stuckT += 1
      const j = g.nearestStandable(this.x, this.z, swim ? null : this.floor, 1.5)
      if (j >= 0) {
        this.x = g.cx(j)
        this.z = g.cz(j)
      }
    } else this.stuckT = 0
  }

  updateFloor(dt, g) {
    const i = g.index(this.x, this.z)
    if (i < 0) return
    const h = g.h[i]
    if (!this.air && Math.abs(h - this.floor) > STEP) {
      const up = Math.max(0, h - this.y)
      this.air = { t: 0, dur: 0.24 + Math.abs(h - this.floor) * 0.2, y0: this.y, y1: h, peak: up * 0.35 + 0.12 }
      this.squash.kick(-1.5)
    }
    this.floor = h
    if (this.air) {
      const a = this.air
      a.t += dt
      const k = clamp(a.t / a.dur, 0, 1)
      a.y1 = h
      this.y = lerp(a.y0, a.y1, k) + a.peak * 4 * k * (1 - k)
      if (k >= 1) {
        this.air = null
        this.squash.kick(1.8)
      }
    } else this.y = damp(this.y, h, 18, dt)
  }

  // ---- looking the part ---------------------------------------------------------------------
  animate(dt, w) {
    const a = this.pose
    const T = this.target
    for (const k of POSE_KEYS) T[k] = 0
    T.tailUp = 0.45
    T.tailWag = 0.16
    const act = this.action
    const st = this.state
    const mood = this.mood

    switch (mood) {
      case 'happy':
      case 'play':
        T.tailUp = 1
        T.tailWag = mood === 'play' ? 0.5 : 0.25
        T.crouch = mood === 'play' ? 0.25 : 0
        break
      case 'shy':
        T.crouch = 0.55
        T.tailUp = 0.05
        T.earFlat = 0.45
        break
      case 'scared':
        T.arch = this.stateT < 0.5 ? 1 : 0.2
        T.tailPuff = 1
        T.earFlat = 1
        break
      case 'hunt':
        T.crouch = 0.8
        T.wiggle = 0.25
        T.tailUp = 0.15
        T.tailWag = 0.6
        break
      case 'eat':
        T.eat = 1
        T.crouch = 0.3
        T.tailUp = 0.8
        break
      case 'sit':
        T.sit = 1
        break
      case 'loaf':
        T.loaf = 1
        T.eyesClosed = 0.45
        break
      case 'groom':
        T.sit = 1
        T.groom = (Math.sin(this.t * 7) * 0.5 + 0.5) * 0.9 + 0.1
        T.eyesClosed = 0.5
        break
      case 'box':
        T.sit = 0.7
        T.tailCurl = 1
        break
      case 'boat':
        T.loaf = 1
        T.tailCurl = 1
        T.earFlat = 0.3
        break
      case 'doze':
        T.loaf = 1
        T.sleep = 0.7
        T.eyesClosed = 1
        break
      case 'basket':
        T.sit = 1
        T.tailCurl = 1
        T.tailUp = 0.6
        break
      case 'content':
        T.loaf = 1
        T.eyesClosed = 0.85
        T.tailCurl = 1
        break
      case 'sleep':
        T.loaf = 1
        T.sleep = 1
        T.eyesClosed = 1
        T.tailCurl = 1
        break
      case 'swim':
        T.swim = 1
        T.earFlat = 0.8
        break
    }
    if (w.wind.force > 0.5 && this.free && !w.grid.sheltered(w.grid.index(this.x, this.z))) {
      T.crouch = Math.max(T.crouch, 0.5)
      T.earFlat = Math.max(T.earFlat, 0.7)
    }
    if (act) {
      const k = clamp(act.t / act.dur, 0, 1)
      switch (act.kind) {
        case 'hop':
          T.air = Math.sin(k * Math.PI)
          T.sit = 0
          T.loaf = 0
          break
        case 'pounce':
          if (act.t < act.crouch) {
            T.crouch = 1
            T.wiggle = 1
            T.tailUp = 0.1
            T.tailWag = 0.8
          } else T.air = 1
          break
        case 'swat':
          T.swat = Math.sin(k * Math.PI)
          T.tailUp = 0.9
          T.tailWag = 0.6
          break
        case 'shake':
          T.shake = Math.sin(k * Math.PI)
          T.earFlat = 0.6
          break
        case 'yawn':
          T.meow = Math.sin(k * Math.PI) * 1.4
          T.eyesClosed = 0.8
          T.sit = 0.7
          break
        case 'stretch':
          T.crouch = k < 0.6 ? 1 : 0
          T.tailUp = 1
          break
        case 'meow':
          T.meow = Math.sin(k * Math.PI)
          break
      }
    }

    // blinks and ear twitches
    this.blinkT -= dt
    if (this.blinkT <= 0) {
      this.blinkT = this.rand.range(1.8, 5)
      this.blinkLeft = 0.13
    }
    this.blinkLeft -= dt
    this.twitchT -= dt
    if (this.twitchT <= 0) {
      this.twitchT = this.rand.range(1.5, 6)
      this.twitch[this.rand() < 0.5 ? 0 : 1] = 0.16
    }
    this.twitch[0] -= dt
    this.twitch[1] -= dt

    const rate = act?.kind === 'pounce' || act?.kind === 'hop' ? 16 : 7
    for (const k of POSE_KEYS) a[k] = damp(a[k], T[k], k === 'air' || k === 'swat' || k === 'shake' ? 22 : rate, dt)
    a.blink = this.blinkLeft > 0 ? 1 : 0
    a.twitchL = damp(a.twitchL, this.twitch[0] > 0 ? 1 : 0, 30, dt)
    a.twitchR = damp(a.twitchR, this.twitch[1] > 0 ? 1 : 0, 30, dt)
    const sp = this.speedNow
    a.stride = damp(a.stride, clamp(sp / 2.1, 0, 1), 10, dt)
    a.run = damp(a.run, smooth(1.8, 2.7, sp), 6, dt)
    a.phase += dt * (5 + 8.5 * sp) * (st === 'swim' ? 0.5 : 1)
    a.time = this.t
    a.breath += dt * (st === 'sleep' ? 1.6 : 3.2)
    a.squash = this.squash.update(0, dt)
    a.tailSway = this.sway.update(clamp(-this.turnRate * 0.16, -0.9, 0.9), dt)

    // look at whatever caught its eye
    let yaw = 0
    let pitch = 0.05
    let tilt = 0
    if (this.look) {
      const s = this.scale
      const dx = this.look.x - this.x
      const dz = this.look.z - this.z
      const dl = Math.hypot(dx, dz)
      const ly = this.look.y ?? this.y
      yaw = dl > 0.05 ? angleTo(this.heading, Math.atan2(dx, dz)) : 0
      pitch = -Math.atan2(ly - (this.y + 0.38 * s), Math.max(dl, 0.15))
      // the curious head tilt when the dot is close and still
      if (this.state === 'chase' && w.dot.still > 0.4 && dl < 1.5) tilt = Math.sin(this.id * 1.7) > 0 ? 0.32 : -0.32
    }
    a.lookYaw = damp(a.lookYaw, clamp(yaw, -1.15, 1.15), 9, dt)
    a.lookPitch = damp(a.lookPitch, clamp(pitch, -0.7, 0.75), 9, dt)
    a.tilt = damp(a.tilt, tilt + T.tilt, 5, dt)
    poseKitten(this.rig, a)
  }

  dispose() {
    this.rig.mesh.geometry.dispose()
    this.rig.eyesMesh.geometry.dispose()
    this.rig.mesh.skeleton.dispose()
    this.group.removeFromParent()
  }
}
