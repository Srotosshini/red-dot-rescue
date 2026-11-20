// The menu's camera: low, looking up at the scratching post, framed so the
// whole set fits any window (a wide monitor, a phone held upright, the
// portfolio's little cabinet screen), and leaning a couple of degrees after
// the pointer so the yard behind slides a little and the scene feels alive.
import * as THREE from 'three'
import { clamp, damp } from '../core/mathx.js'

const _v = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const LEAN = { yaw: 0.045, pitch: 0.035 } // about 2.5 and 2 degrees

export class MenuCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400)
    this.probe = new THREE.PerspectiveCamera()
    this.pos = new THREE.Vector3(0, 1, 10) // where it is, before the lean
    this.look = new THREE.Vector3(0, 2, 0)
    this.goal = { pos: new THREE.Vector3(0, 1, 10), look: new THREE.Vector3(0, 2, 0) }
    this.rate = 3
    this.pointer = { x: 0, y: 0 } // -1..1, set by the menu
    this.lean = { x: 0, y: 0 }
    this.reduced = false
    this.fits = new Map() // framed views, worked out once per window shape
  }

  setAspect(aspect) {
    // a hidden page can report a 0 by 0 window
    if (!(aspect > 0 && aspect < Infinity)) aspect = 1
    this.camera.aspect = aspect
    this.camera.fov = aspect < 0.75 ? 40 : aspect < 1.1 ? 36 : 32
    this.camera.updateProjectionMatrix()
    this.fits.clear()
  }

  // Head for a framed view: { look, dir, points, margin }, where dir points
  // from the look point toward the camera.
  frame(key, view, { rate = 3, snap = false } = {}) {
    let f = this.fits.get(key)
    if (!f) {
      f = this.solve(view)
      this.fits.set(key, f)
    }
    this.goal.pos.copy(f.pos)
    this.goal.look.copy(f.look)
    this.rate = rate
    if (snap) this.snap()
  }

  // Head for an exact spot, looking at a point.
  moveTo(pos, look, { rate = 3, snap = false } = {}) {
    this.goal.pos.copy(pos)
    this.goal.look.copy(look)
    this.rate = rate
    if (snap) this.snap()
  }

  snap() {
    this.pos.copy(this.goal.pos)
    this.look.copy(this.goal.look)
  }

  // The camera position that fits every point, with the set nudged into the
  // middle of the frame. On a narrow screen only the `narrow` points have to
  // fit (the rest may run off the sides). `floor` sits the set on the bottom
  // of the frame, so spare height goes to the sky and not to the ground
  // beyond the edge of the yard.
  solve({ look, dir, points, narrow, floor = false, margin = { x: 0.9, y: 0.88 } }) {
    if (narrow && this.camera.aspect < 0.8) points = narrow
    const L = look.clone()
    let d = this.fit(L, dir, points, margin)
    for (let i = 0; i < 4; i++) {
      const c = this.centre(L, dir, d, points)
      const cam = this.probe
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d
      _right.setFromMatrixColumn(cam.matrixWorld, 0)
      _up.setFromMatrixColumn(cam.matrixWorld, 1)
      const dy = floor && i > 1 ? c.y0 + margin.y : c.y
      L.addScaledVector(_right, c.x * halfH * cam.aspect).addScaledVector(_up, dy * halfH)
      if (!floor || i < 2) d = this.fit(L, dir, points, margin)
    }
    return { look: L, pos: L.clone().addScaledVector(dir, d) }
  }

  place(look, dir, d) {
    const cam = this.probe
    cam.fov = this.camera.fov
    cam.aspect = this.camera.aspect
    cam.near = 0.05
    cam.far = 1000
    cam.updateProjectionMatrix()
    cam.position.copy(look).addScaledVector(dir, d)
    cam.lookAt(look)
    cam.updateMatrixWorld()
    return cam
  }

  fit(look, dir, points, margin) {
    const ok = (d) => {
      const cam = this.place(look, dir, d)
      for (const p of points) {
        _v.copy(p).project(cam)
        if (_v.z > 1 || Math.abs(_v.x) > margin.x || Math.abs(_v.y) > margin.y) return false
      }
      return true
    }
    let lo = 0.2
    let hi = 200
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2
      if (ok(mid)) hi = mid
      else lo = mid
    }
    return hi
  }

  // middle of the points on screen, in -1..1
  centre(look, dir, d, points) {
    const cam = this.place(look, dir, d)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const p of points) {
      _v.copy(p).project(cam)
      x0 = Math.min(x0, _v.x)
      x1 = Math.max(x1, _v.x)
      y0 = Math.min(y0, _v.y)
      y1 = Math.max(y1, _v.y)
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, y0 }
  }

  update(dt) {
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.look.x + this.look.y + this.look.z)) this.snap()
    const k = 1 - Math.exp(-this.rate * dt)
    this.pos.lerp(this.goal.pos, k)
    this.look.lerp(this.goal.look, k)
    const lean = this.reduced ? 0 : 1
    this.lean.x = damp(this.lean.x, this.pointer.x * lean, 2.5, dt)
    this.lean.y = damp(this.lean.y, this.pointer.y * lean, 2.5, dt)
    // swing round the look point by the lean
    _v.copy(this.pos).sub(this.look)
    const r = _v.length()
    const yaw = Math.atan2(_v.x, _v.z) + this.lean.x * LEAN.yaw
    const pitch = Math.asin(clamp(_v.y / r, -1, 1)) + this.lean.y * LEAN.pitch
    const cam = this.camera
    cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(r).add(this.look)
    cam.lookAt(this.look)
    cam.updateMatrixWorld()
  }

  // Where the camera settles, without the lean: things that fly up to the
  // camera aim here, so the lean still slides them a little.
  restingPose(outPos, outQuat) {
    const p = this.place(this.goal.look, _v.copy(this.goal.pos).sub(this.goal.look).normalize(), this.goal.pos.distanceTo(this.goal.look))
    outPos.copy(p.position)
    outQuat.copy(p.quaternion)
  }
}
