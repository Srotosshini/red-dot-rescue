// The laser pointer: you. A tiny red dot with a soft halo and a little red
// light of its own, which matters a lot in the storm drain. It also measures
// how it is being moved: how long it has been still (sleepy kittens notice)
// and how much it is wiggling back and forth over one spot (that wakes
// kittens up and calls them out of boxes).
import * as THREE from 'three'
import { clamp, damp } from '../core/mathx.js'

function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Laser {
  constructor() {
    this.group = new THREE.Group()
    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 14).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.35, 0.42), polygonOffset: true, polygonOffsetFactor: -4 }),
    )
    this.core = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 6, 6), polygonOffset: true, polygonOffsetFactor: -5 }),
    )
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: haloTexture(), color: new THREE.Color(2.4, 0.15, 0.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.24, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.5), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    )
    this.halo.renderOrder = this.ring.renderOrder = 10
    this.light = new THREE.PointLight('#ff2a3d', 2, 3.5, 2)
    this.light.position.y = 0.35
    this.group.add(this.dot, this.core, this.halo, this.ring, this.light)
    this.group.visible = false

    this.active = false
    this.x = 0
    this.y = 0
    this.z = 0
    this.tx = 0
    this.ty = 0
    this.tz = 0
    this.has = false
    this.still = 0
    this.speed = 0
    this.wiggle = 0
    this.offFor = 0
    this.history = []
    this.focus = 0 // how much something is responding to the dot (ring feedback)
    this.baseLight = 2
    this.t = 0
  }

  setStrength(intensity, distance) {
    this.baseLight = intensity
    this.light.distance = distance
  }

  set(hit) {
    if (hit) {
      this.tx = hit.x
      this.ty = hit.y
      this.tz = hit.z
      this.has = true
    } else this.has = false
  }

  snapTo(x, y, z) {
    this.x = this.tx = x
    this.y = this.ty = y
    this.z = this.tz = z
  }

  update(dt) {
    this.t += dt
    if (this.has) {
      if (!this.active) {
        this.x = this.tx
        this.y = this.ty
        this.z = this.tz
        this.history.length = 0
        this.still = 0
      }
      this.active = true
      this.offFor = 0
    } else {
      this.offFor += dt
      if (this.active) this.active = false
    }
    if (!this.active) {
      this.group.visible = false
      this.speed = 0
      this.wiggle = damp(this.wiggle, 0, 6, dt)
      return
    }
    const px = this.x
    const pz = this.z
    this.x = damp(this.x, this.tx, 40, dt)
    this.y = damp(this.y, this.ty, 30, dt)
    this.z = damp(this.z, this.tz, 40, dt)
    const moved = Math.hypot(this.x - px, this.z - pz)
    this.speed = damp(this.speed, moved / Math.max(dt, 1e-4), 10, dt)
    this.still = this.speed < 0.3 ? this.still + dt : 0

    // wiggle: lots of travel that goes nowhere
    const H = this.history
    H.push({ t: this.t, x: this.x, z: this.z })
    while (H.length && H[0].t < this.t - 0.7) H.shift()
    let path = 0
    for (let i = 1; i < H.length; i++) path += Math.hypot(H[i].x - H[i - 1].x, H[i].z - H[i - 1].z)
    const span = H.length ? Math.hypot(this.x - H[0].x, this.z - H[0].z) : 0
    this.wiggle = damp(this.wiggle, clamp((path - span * 1.6 - 0.3) / 0.9, 0, 1), 8, dt)

    // a real laser pointer never holds perfectly still
    const jx = Math.sin(this.t * 37) * 0.004 + Math.sin(this.t * 23 + 1) * 0.003
    const jz = Math.cos(this.t * 31) * 0.004
    this.group.visible = true
    this.group.position.set(this.x + jx, this.y + 0.012, this.z + jz)
    const flick = 1 + Math.sin(this.t * 50) * 0.04 + Math.sin(this.t * 13) * 0.03
    this.dot.scale.setScalar(flick)
    this.halo.scale.setScalar(1 + Math.sin(this.t * 6) * 0.06 + this.wiggle * 0.3)
    this.light.intensity = this.baseLight * (0.92 + Math.sin(this.t * 40) * 0.05)
    this.focus = damp(this.focus, 0, 3, dt)
    this.ring.material.opacity = this.focus * 0.8
    this.ring.scale.setScalar(1 + (1 - this.focus) * 0.8)
  }

  ping() {
    this.focus = 1
  }
}
