// The menu's kittens. One hangs off the top of the scratching post: it climbs
// down to whichever word the dot is on, drops onto a word when you choose it,
// slips and scrabbles back up when left alone, and bats the feather toy. Two
// more sit on the grass and watch the dot. They use the game's kitten model
// and poses, but not its brain: that one walks on a level's grid, and nothing
// here stands on the grid.
//
// The post kitten lives on the post's surface: an angle round it (phi, 0 faces
// the camera), a height (y, the middle of its body) and how much it is hanging
// from the rim rather than clinging to the rope (hang).
import * as THREE from 'three'
import { buildKitten, newPose, poseKitten, aimHead, kittenMaterial } from '../game/kitten-model.js'
import { makeGenome } from '../game/genome.js'
import { makeRng } from '../core/rng.js'
import { clamp, damp, lerp, smooth, easeInOut, Spring } from '../core/mathx.js'
import { POST } from './post-set.js'

const SCALE = 1.2
const HANG_Y = POST.top - 0.24 * SCALE // the middle of the body, with the paws curled over the rim
const HANG_OUT = 0.05 // hanging sits a little off the rope, so the arms clear the rim
const HOME = 1.42 // hanging off the cap's right-hand edge, side on to the camera
const BAT = -0.86 // hanging off the left, next to the feather toy's string
const G = 24 // falls a bit faster than real gravity; it reads better
const UP = new THREE.Vector3(0, 1, 0)
const NOSE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()

// a point on the rope's surface, in the set's space
const onPost = (phi, y, out = new THREE.Vector3()) => out.set(Math.sin(phi) * POST.r, y, Math.cos(phi) * POST.r)

function kitten(seed) {
  const g = makeGenome(seed, 'plain')
  const rig = buildKitten(g)
  const group = new THREE.Group()
  group.add(rig.mesh)
  return { g, rig, group }
}

// blinks and ear twitches, at random but not too often
class Fidgets {
  constructor(rand) {
    this.rand = rand
    this.blinkIn = rand.range(1, 4)
    this.blinkT = 0
    this.twitchIn = rand.range(2, 6)
    this.ears = [0, 0]
  }
  update(dt, pose, { wide = false } = {}) {
    this.blinkIn -= dt
    if (this.blinkIn <= 0 && !wide) {
      this.blinkT = 0.13
      this.blinkIn = this.rand.range(2, 5)
    }
    this.blinkT -= dt
    pose.blink = this.blinkT > 0 ? 1 : 0
    this.twitchIn -= dt
    if (this.twitchIn <= 0) {
      this.ears[this.rand() < 0.5 ? 0 : 1] = 0.16
      this.twitchIn = this.rand.range(3, 7)
    }
    this.ears[0] -= dt
    this.ears[1] -= dt
    pose.twitchL = damp(pose.twitchL, this.ears[0] > 0 ? 1 : 0, 30, dt)
    pose.twitchR = damp(pose.twitchR, this.ears[1] > 0 ? 1 : 0, 30, dt)
  }
}

// bits of rope fibre knocked loose by claws
class Puff {
  constructor(n = 20) {
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.022), new THREE.MeshLambertMaterial({ color: '#c9a978' }), n)
    this.mesh.frustumCulled = false
    this.bits = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, spin: 0, a: 0 }))
    this.rand = makeRng(9)
    this.m = new THREE.Matrix4()
    this.q = new THREE.Quaternion()
    this.s = new THREE.Vector3()
    this.e = new THREE.Euler()
    this.update(0)
  }

  // at: a point on the post's surface (the set's space); bits fly outward from it
  emit(at, n = 9) {
    const r = this.rand
    _w.set(at.x, 0, at.z).normalize()
    let made = 0
    for (const b of this.bits) {
      if (b.life > 0) continue
      b.p.copy(at)
      b.v.copy(_w).multiplyScalar(r.range(0.35, 0.95))
      b.v.x += r.range(-0.45, 0.45)
      b.v.y += r.range(0.05, 0.75)
      b.v.z += r.range(-0.45, 0.45)
      b.life = r.range(0.35, 0.6)
      b.spin = r.range(-12, 12)
      b.a = r.range(0, 6)
      if (++made >= n) break
    }
  }

  update(dt) {
    this.bits.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt
        b.v.y -= 3.2 * dt
        b.p.addScaledVector(b.v, dt)
        b.a += b.spin * dt
      }
      const s = clamp(b.life / 0.2, 0, 1)
      this.q.setFromEuler(this.e.set(b.a, b.a * 0.7, 0))
      this.m.compose(b.p, this.q, this.s.setScalar(s))
      this.mesh.setMatrixAt(i, this.m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

export class PostKitten {
  constructor(seed, set) {
    const { g, rig, group } = kitten(seed)
    this.g = g
    this.rig = rig
    this.group = group
    // its own copy of the material, so it alone can fade out (reduced motion)
    this.material = kittenMaterial.clone()
    rig.mesh.material = this.material
    group.scale.setScalar(SCALE)
    this.set = set
    this.rand = makeRng((seed ^ 0x5bd1e995) >>> 0)
    this.pose = newPose()
    this.squash = new Spring(0, 240, 13)
    this.sway = new Spring(0, 30, 3.2)
    this.fidgets = new Fidgets(this.rand)
    this.puff = new Puff()
    // the noises it makes (scrape, thud), turned into sound by the menu
    this.say = () => {}
    this.t = 0
    this.reset()
  }

  reset() {
    this.phi = HOME
    this.y = HANG_Y
    this.out = 0 // pushed off the post, mid-jump
    this.hang = 1
    this.vphi = 0
    this.state = 'idle'
    this.stateT = 0
    this.at = 'home' // the spot it is holding: home, bat or a word
    this.target = 'home'
    this.path = []
    this.leg = null
    this.idle = 0
    this.slideIn = this.rand.range(8, 12)
    this.pending = null
    this.batT = -1
    this.batWait = 0
    this.landing = null
    this.setOpacity(1)
    Object.assign(this.pose, newPose(), { hang: 1 })
    this.place()
  }

  // ---- where it can be -----------------------------------------------------------
  spot(name) {
    if (name === 'home') return { phi: HOME, y: HANG_Y, hang: 1 }
    if (name === 'bat') return { phi: BAT, y: HANG_Y, hang: 1 }
    // just above a word, off its right-hand end, so the word stays readable
    const w = this.set.wordAt[name]
    return { phi: clamp(w.phi + w.half + 0.3, 0.9, 1.35), y: w.y + 0.3, hang: 0 }
  }

  goTo(name) {
    if (this.state === 'move' && this.target === name) return
    const to = this.spot(name)
    const path = []
    const onRim = this.hang > 0.5
    // the rim is the way round: climb up to it before going sideways along it,
    // and come back to the right-hand side before climbing down to a word
    if (to.hang && !onRim && Math.abs(to.phi - this.phi) > 0.25) path.push({ phi: this.phi, y: HANG_Y, hang: 1 })
    if (!to.hang && onRim && Math.abs(this.phi - HOME) > 0.3) path.push({ phi: HOME, y: HANG_Y, hang: 1 })
    path.push(to)
    this.path = path
    this.target = name
    this.state = 'move'
    this.stateT = 0
    this.nextLeg()
  }

  nextLeg() {
    const to = this.path.shift()
    const from = { phi: this.phi, y: this.y, hang: this.hang }
    const d = Math.hypot((to.phi - from.phi) * 0.55, to.y - from.y)
    this.leg = { from, to, t: 0, dur: clamp(0.22 + d * 0.16, 0.28, 0.55) }
    // claws in the rope make a noise; paws along the carpet rim do not
    if (from.hang < 1 || to.hang < 1) this.say('scrape', this.leg.dur)
  }

  // ---- what the menu asks of it ------------------------------------------------------
  // jump onto a word, then do `then` once its claws are in
  pounce(id, then, reduced) {
    const w = this.set.wordAt[id]
    this.pending = { fn: then, t: Infinity }
    if (!w || this.state === 'dive') return this.fire()
    this.landing = { id, phi: w.phi + w.half * 0.45, y: w.y + 0.06 }
    this.state = reduced ? 'fade' : 'pounce'
    this.stateT = 0
    this.leg = null
    // a little hop off the rope first (less of one for a long drop), then down
    const drop = this.y - this.landing.y
    const v0 = Math.sqrt(2 * G * clamp(0.16 - drop * 0.08, 0.02, 0.16))
    const dur = drop > 0.02 ? (v0 + Math.sqrt(v0 * v0 + 2 * G * drop)) / G : 0.32
    this.fall = { y0: this.y, phi0: this.phi, up: drop <= 0.02, v0, dur, landed: false, faded: false }
    if (!reduced) this.squash.kick(-1.2)
  }

  // a click on the feather toy: a swipe if it is close enough, and the tag opens either way
  batToy(then) {
    if (this.at === 'bat' && this.state === 'idle') {
      this.swat()
      this.pending = { fn: then, t: 0.18 }
    } else then()
  }

  // play: let go and drop into the box
  dive() {
    this.pending = null
    this.state = 'dive'
    this.stateT = 0
    this.leg = null
    this.fall = { y0: this.y, phi0: this.phi, passed: false }
  }

  cancel() {
    this.pending = null
  }

  fire() {
    const p = this.pending
    this.pending = null
    p?.fn?.()
  }

  swat() {
    this.batT = 0
    this.batHit = false
    this.batWait = this.rand.range(0.75, 1.15)
  }

  // the middle of its body, in the world
  worldCentre(out) {
    return this.group.localToWorld(out.set(0, this.rig.joints.bodyY, 0))
  }

  // ---- the frame -------------------------------------------------------------------------
  // hover: what the dot is on; dotW and eyeW: the dot and the camera, in the world
  update(dt, { hover, dotW, eyeW, toy, reduced }) {
    this.t += dt
    this.stateT += dt
    const want = hover === 'settings' ? 'bat' : hover && this.set.wordAt[hover] ? hover : null
    this.idle = want ? 0 : this.idle + dt
    let stare = false
    let flail = false
    const pPhi = this.phi
    const pY = this.y

    switch (this.state) {
      case 'idle':
        if (want && want !== this.at) this.goTo(want)
        else if (!want && this.at !== 'home' && this.idle > 1.6) this.goTo('home')
        else if (!want && this.at === 'home' && !reduced && this.idle > this.slideIn) {
          this.state = 'slide'
          this.stateT = 0
          this.slideFrom = this.y
          this.cue = 0
        }
        break
      case 'move':
        if (want && want !== this.target) this.goTo(want) // changed its mind halfway
        else if (!want && this.target !== 'home' && this.idle > 1.6) this.goTo('home')
        this.moving(dt)
        break
      case 'slide':
        if (want) this.goTo(want)
        else stare = this.sliding()
        break
      case 'pounce':
        flail = this.falling(dt)
        break
      case 'dive':
        this.diving()
        flail = true
        break
      case 'fade':
        this.fading()
        break
    }

    if (this.pending && (this.pending.t -= dt) <= 0) this.fire()
    this.batting(dt, hover, toy)
    this.vphi = (this.phi - pPhi) / Math.max(dt, 1e-4)
    this.pose.climb += Math.hypot((this.phi - pPhi) * 0.6, this.y - pY) * (this.state === 'slide' ? 10 : 34)

    // the numbers its pose is made of
    const P = this.pose
    P.time = this.t
    P.hang = this.hang
    P.cling = 1 - this.hang
    P.kick = damp(P.kick, (flail ? 1 : 0.35) * this.hang, 6, dt)
    P.squash = this.squash.update(0, dt)
    P.tailSway = this.sway.update(clamp(-this.vphi * 0.6, -1, 1) + Math.sin(this.t * 1.6) * 0.3 * this.hang, dt)
    P.tailWag = 0.1
    P.breath += dt * 3.2
    P.earFlat = damp(P.earFlat, flail ? 0.7 : 0, 10, dt)
    P.tailPuff = damp(P.tailPuff, stare ? 0.4 : 0, 6, dt)
    this.fidgets.update(dt, P, { wide: stare })
    this.place()
    poseKitten(this.rig, P)

    // and the head: on where it is about to land, on you, or on the dot
    let look = dotW ?? eyeW
    if (stare) look = eyeW
    if (this.state === 'pounce' && this.landing) look = this.set.group.localToWorld(onPost(this.landing.phi - 0.2, this.landing.y, _v))
    if (look) aimHead(this.rig, look, 0.9)
    this.puff.update(dt)
  }

  moving(dt) {
    const L = this.leg
    L.t += dt
    const k = clamp(L.t / L.dur, 0, 1)
    const e = easeInOut(k)
    this.phi = lerp(L.from.phi, L.to.phi, e)
    this.y = lerp(L.from.y, L.to.y, e)
    // lets go of the rim early on the way down, grabs it late on the way up
    this.hang = L.to.hang > L.from.hang ? lerp(L.from.hang, L.to.hang, smooth(0.55, 1, k)) : lerp(L.from.hang, L.to.hang, smooth(0, 0.4, k))
    if (k < 1) return
    if (this.path.length) return this.nextLeg()
    this.leg = null
    this.at = this.target
    this.state = 'idle'
    this.stateT = 0
  }

  // left alone: the claws slip, it slides down a bit, scrabbles back up in a
  // panic, then stares at you as if nothing happened. True while staring.
  sliding() {
    const t = this.stateT
    const low = this.slideFrom - 0.42
    // the long scrape of the slide, then a frantic one going back up
    if (t >= 0.3 && this.cue < 1) {
      this.cue = 1
      this.say('scrape', 0.85)
    }
    if (t >= 1.15 && this.cue < 2) {
      this.cue = 2
      this.say('scrape', 0.45)
    }
    if (t < 0.3) this.hang = 1 - smooth(0, 0.3, t)
    else if (t < 1.15) {
      this.hang = 0
      this.y = lerp(this.slideFrom, low, smooth(0.3, 1.15, t) ** 1.5)
    } else if (t < 1.6) {
      this.y = lerp(low, this.slideFrom, smooth(1.15, 1.6, t))
      this.pose.climb += 0.9 // all four paws going at once
      this.hang = smooth(1.45, 1.6, t)
    } else if (t < 2.6) {
      this.hang = 1
      return true
    } else {
      this.state = 'idle'
      this.stateT = 0
      this.idle = 0
      this.slideIn = this.rand.range(8, 12)
    }
    return false
  }

  // let go, drop (or leap, if the word is above), land with a squash and a puff of fibre
  falling() {
    const F = this.fall
    const L = this.landing
    const t = this.stateT - 0.06 // a beat to let go
    if (t < 0) {
      this.hang = Math.min(1, this.hang + 0.3)
      return true
    }
    if (!F.landed) {
      const k = clamp(t / F.dur, 0, 1)
      this.y = F.up ? lerp(F.y0, L.y, easeInOut(k)) + 0.2 * Math.sin(Math.PI * k) : F.y0 + F.v0 * t - 0.5 * G * t * t
      this.phi = lerp(F.phi0, L.phi, smooth(0, 1, k))
      this.out = 0.14 * Math.sin(Math.PI * k)
      this.hang = 1
      if (k >= 1 || (!F.up && t > F.v0 / G && this.y <= L.y)) {
        this.y = L.y
        this.phi = L.phi
        this.out = 0
        this.hang = 0
        F.landed = true
        this.squash.kick(2.6)
        this.puff.emit(onPost(L.phi - 0.1, L.y + 0.3), 10)
        this.say('thud')
        this.at = L.id
        this.state = 'idle'
        this.stateT = 0
        this.idle = 0
        if (this.pending) this.pending.t = 0.12
      }
      return true
    }
    return false
  }

  // into the box, scraping past "play" on the way
  diving() {
    const F = this.fall
    const t = Math.max(0, this.stateT - 0.05)
    const play = this.set.wordAt.play
    this.y = Math.max(0.3, F.y0 + 0.04 - 0.5 * G * t * t)
    this.phi = lerp(F.phi0, 0.88, smooth(0, 0.3, t)) // toward the box's roomy corner
    this.out = 0.08 * smooth(0, 0.12, t)
    this.hang = 1
    if (!F.passed && this.y < play.y + 0.25) {
      F.passed = true
      this.squash.kick(1.4)
      this.puff.emit(onPost(this.phi - 0.15, play.y + 0.05), 8)
      this.say('scrape', 0.25)
    }
  }

  // reduced motion: no jump, just a quick fade to the word
  fading() {
    const t = this.stateT
    const F = this.fall
    const L = this.landing
    if (t < 0.1) return this.setOpacity(1 - t / 0.1)
    if (!F.faded) {
      F.faded = true
      this.phi = L.phi
      this.y = L.y
      this.hang = 0
      this.at = L.id
      if (this.pending) this.pending.t = 0.02
    }
    this.setOpacity(Math.min(1, (t - 0.1) / 0.1))
    if (t >= 0.2) {
      this.state = 'idle'
      this.stateT = 0
      this.idle = 0
    }
  }

  // swipes at the feather toy while the dot is on it
  batting(dt, hover, toy) {
    if (this.batT >= 0) {
      this.batT += dt
      const k = this.batT / 0.32
      this.pose.bat = Math.sin(Math.PI * clamp(k, 0, 1))
      if (!this.batHit && k > 0.4) {
        this.batHit = true
        toy.poke(-1.25)
      }
      if (k >= 1) this.batT = -1
    } else this.pose.bat = 0
    if (this.at === 'bat' && this.state === 'idle' && hover === 'settings') {
      this.batWait -= dt
      if (this.batWait <= 0) this.swat()
    }
  }

  setOpacity(o) {
    const m = this.material
    const see = o < 0.999
    if (m.transparent !== see) {
      m.transparent = see
      m.needsUpdate = true
    }
    m.opacity = o
  }

  // nose up, belly to the rope, the middle of its body at this angle and height
  place() {
    const r = POST.r + 0.005 + this.out + HANG_OUT * this.hang
    this.group.position.set(Math.sin(this.phi) * r, this.y, Math.cos(this.phi) * r)
    _q.setFromAxisAngle(UP, this.phi + Math.PI)
    this.group.quaternion.copy(_q).multiply(NOSE_UP)
  }
}

// One of the kittens on the grass: sits, follows the dot with its eyes, wags
// when it moves fast, and (if `swats`) takes a swipe when it comes close.
export class WatchKitten {
  constructor(seed, x, z, heading, { swats = false } = {}) {
    const { g, rig, group } = kitten(seed)
    this.g = g
    this.rig = rig
    this.group = group
    group.position.set(x, 0, z)
    group.rotation.y = heading
    group.scale.setScalar(SCALE * g.size)
    this.swats = swats
    this.rand = makeRng((seed * 31 + 5) >>> 0)
    this.fidgets = new Fidgets(this.rand)
    this.pose = Object.assign(newPose(), { sit: 1, tailCurl: 1, tailUp: 0.2 })
    this.t = this.rand.range(0, 10)
    this.reset()
  }

  reset() {
    this.swatT = -1
    this.cool = 1
    this.last = null
    this.speed = 0
  }

  // dot: the dot in the set's space; dotW, lookW: in the world
  update(dt, { dot, dotW, lookW }) {
    const P = this.pose
    this.t += dt
    P.time = this.t
    P.breath += dt * 3
    if (dot && this.last) this.speed = damp(this.speed, this.last.distanceTo(dot) / Math.max(dt, 1e-4), 6, dt)
    else this.speed = damp(this.speed, 0, 6, dt)
    this.last = dot ? (this.last ?? new THREE.Vector3()).copy(dot) : null
    P.tailWag = damp(P.tailWag, 0.08 + clamp(this.speed * 0.12, 0, 0.6), 3, dt)
    // a swipe when the dot goes by close and fast enough to be worth it
    this.cool -= dt
    if (this.swats && dot && this.swatT < 0 && this.cool <= 0 && this.speed > 0.5) {
      _v.copy(this.group.position).setY(0.48 * this.group.scale.y)
      if (_v.distanceTo(dot) < 0.8) {
        this.swatT = 0
        this.cool = this.rand.range(1.8, 2.8)
      }
    }
    if (this.swatT >= 0) {
      this.swatT += dt
      P.swat = Math.sin(Math.PI * clamp(this.swatT / 0.3, 0, 1))
      if (this.swatT > 0.3) this.swatT = -1
    } else P.swat = 0
    P.crouch = damp(P.crouch, this.swatT >= 0 ? 0.25 : 0, 12, dt)
    this.fidgets.update(dt, P)
    poseKitten(this.rig, P)
    if (dotW ?? lookW) aimHead(this.rig, dotW ?? lookW, 0.85, 1.3)
  }
}
