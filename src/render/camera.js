// The diorama camera: it frames the whole little level, leans a touch toward
// the dot, and lets the player orbit within limits (right-drag, two fingers,
// Q and E, the wheel).
import * as THREE from 'three'
import { clamp, damp } from '../core/mathx.js'

const _v = new THREE.Vector3()
const _dir = new THREE.Vector3()

export class DioramaCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600)
    this.yaw = 0
    this.pitch = 0.92
    this.zoom = 1
    this.base = { yaw: 0, pitch: 0.92 }
    this.goal = { yaw: 0, pitch: 0.92, zoom: 1 }
    this.limits = { yaw: 0.7, pitchMin: 0.62, pitchMax: 1.28, zoomMin: 0.62, zoomMax: 1.3 }
    this.rate = 4
    this.center = new THREE.Vector3()
    this.look = new THREE.Vector3()
    this.box = new THREE.Box3(new THREE.Vector3(-8, -1, -6), new THREE.Vector3(8, 2, 6))
    this.distance = 30
    this.fitFor = { aspect: 0, pitch: 0, tight: false }
    // tight: on a tall screen, frame a slice of the level and pan with the dot
    this.tight = false
    this.panRange = 0
    this.shakeAmount = 0
    this.shakeTime = 0
    this.reduced = false
    this.probe = new THREE.PerspectiveCamera()
  }

  setAspect(aspect) {
    this.camera.aspect = aspect
    // a tall phone screen needs a wider lens or the level gets tiny
    this.camera.fov = aspect < 0.8 ? 42 : aspect < 1.2 ? 36 : 30
    this.camera.updateProjectionMatrix()
    // tall screens look down a little more steeply, so the level's depth fills the height
    const pitch = aspect < 0.8 ? 1.04 : 0.92
    if (pitch !== this.base.pitch) {
      this.base.pitch = this.goal.pitch = pitch
      this.limits.pitchMin = pitch - 0.3
    }
    this.fitFor.aspect = 0
  }

  // Frame a level. `intro` starts from a sweeping angle and glides in.
  frame(box, { intro = false } = {}) {
    this.box.copy(box)
    box.getCenter(this.center)
    this.center.y = Math.max(0, box.min.y + 0.4)
    this.look.copy(this.center)
    this.goal.yaw = this.base.yaw
    this.goal.pitch = this.base.pitch
    this.goal.zoom = 1
    this.fitFor.aspect = 0
    if (intro && !this.reduced) {
      this.yaw = this.base.yaw - 0.55
      this.pitch = this.base.pitch - 0.22
      this.zoom = 1.45
      this.rate = 1.6
    } else {
      this.yaw = this.goal.yaw
      this.pitch = this.goal.pitch
      this.zoom = 1
      this.rate = 4
    }
  }

  orbit(dYaw, dPitch) {
    const L = this.limits
    this.goal.yaw = clamp(this.goal.yaw + dYaw, this.base.yaw - L.yaw, this.base.yaw + L.yaw)
    this.goal.pitch = clamp(this.goal.pitch + dPitch, L.pitchMin, L.pitchMax)
    this.rate = 6
  }

  zoomBy(factor) {
    const L = this.limits
    this.goal.zoom = clamp(this.goal.zoom * factor, L.zoomMin, L.zoomMax)
    this.rate = 6
  }

  resetView() {
    this.goal.yaw = this.base.yaw
    this.goal.pitch = this.base.pitch
    this.goal.zoom = 1
    this.rate = 3
  }

  shake(amount) {
    if (this.reduced) return
    this.shakeAmount = Math.max(this.shakeAmount, amount)
  }

  // The distance at which every corner of the level box lands on screen, with
  // room left at the top for the HUD.
  fit(pitch) {
    // a portrait phone cannot show a wide level and still have kittens you can see
    this.panRange = 0
    const b = this.box.clone()
    if (this.tight && this.camera.aspect < 0.95) {
      const full = b.max.x - b.min.x
      const depth = b.max.z - b.min.z
      const w = Math.min(full, this.camera.aspect < 0.7 ? Math.max(5.5, depth * 0.55) : Math.max(7, depth * 0.95))
      this.panRange = (full - w) / 2
      const cx = (b.min.x + b.max.x) / 2
      b.min.x = cx - w / 2
      b.max.x = cx + w / 2
    }
    const cam = this.probe
    cam.fov = this.camera.fov
    cam.aspect = this.camera.aspect
    cam.near = 0.1
    cam.far = 1000
    cam.updateProjectionMatrix()
    const corners = []
    for (let i = 0; i < 8; i++)
      corners.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z))
    _dir.set(Math.sin(this.base.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.base.yaw) * Math.cos(pitch))
    const fits = (d) => {
      cam.position.copy(this.center).addScaledVector(_dir, d)
      cam.lookAt(this.center)
      cam.updateMatrixWorld()
      for (const c of corners) {
        _v.copy(c).project(cam)
        if (_v.z > 1 || _v.x < -0.95 || _v.x > 0.95 || _v.y < -0.93 || _v.y > 0.8) return false
      }
      return true
    }
    let lo = 2
    let hi = 400
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid
      else lo = mid
    }
    return hi
  }

  update(dt, { focus = null, t = 0 } = {}) {
    if (this.fitFor.aspect !== this.camera.aspect || Math.abs(this.fitFor.pitch - this.base.pitch) > 1e-4 || this.fitFor.tight !== this.tight) {
      this.distance = this.fit(this.base.pitch)
      this.fitFor.aspect = this.camera.aspect
      this.fitFor.pitch = this.base.pitch
      this.fitFor.tight = this.tight
      if (!this.panRange) this.panX = 0
    }
    this.yaw = damp(this.yaw, this.goal.yaw, this.rate, dt)
    this.pitch = damp(this.pitch, this.goal.pitch, this.rate, dt)
    this.zoom = damp(this.zoom, this.goal.zoom, this.rate, dt)
    if (Math.abs(this.yaw - this.goal.yaw) < 0.002 && Math.abs(this.zoom - this.goal.zoom) < 0.002) this.rate = 4

    // lean a little toward the dot, never far enough to lose the level
    _v.copy(this.center)
    if (this.panRange > 0) {
      // follow the dot sideways, never past the ends of the level
      if (focus) this.panX = clamp(focus.x - this.center.x, -this.panRange, this.panRange)
      _v.x += this.panX ?? 0
      if (focus) _v.z += clamp((focus.z - this.center.z) * 0.1, -0.8, 0.8)
    } else if (focus) {
      _v.x += clamp((focus.x - this.center.x) * 0.12, -1.2, 1.2)
      _v.z += clamp((focus.z - this.center.z) * 0.1, -0.8, 0.8)
    }
    this.look.x = damp(this.look.x, _v.x, 2, dt)
    this.look.y = damp(this.look.y, _v.y, 2, dt)
    this.look.z = damp(this.look.z, _v.z, 2, dt)

    // orbiting off the front view pulls back a little so the corners stay in shot
    const off = Math.abs(this.yaw - this.base.yaw) / this.limits.yaw
    const d = this.distance * this.zoom * (1 + off * 0.14) * (1 + Math.max(0, this.base.pitch - this.pitch) * 0.25)
    _dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
    const cam = this.camera
    cam.position.copy(this.look).addScaledVector(_dir, d)

    if (this.shakeAmount > 0.001) {
      this.shakeTime += dt
      const s = this.shakeAmount
      cam.position.x += Math.sin(this.shakeTime * 47) * s
      cam.position.y += Math.sin(this.shakeTime * 59 + 1) * s * 0.6
      this.shakeAmount = damp(this.shakeAmount, 0, 5, dt)
    }
    cam.lookAt(this.look)
    cam.updateMatrixWorld()
  }

  // ground direction the camera faces, for camera-relative keyboard movement
  // and for pointing the audio listener
  forward(out = new THREE.Vector3()) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    return out
  }

  // world point to CSS pixels; returns false when behind the camera
  toScreen(p, width, height, out) {
    _v.copy(p).project(this.camera)
    out.x = (_v.x * 0.5 + 0.5) * width
    out.y = (1 - (_v.y * 0.5 + 0.5)) * height
    out.z = _v.z
    return _v.z < 1
  }
}
