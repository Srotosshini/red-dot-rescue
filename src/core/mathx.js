// Small math helpers shared by everything.

export const TAU = Math.PI * 2
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Move `a` toward `b` at a pace that does not depend on the frame rate.
// A bigger rate is snappier.
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))

// The short way round from one angle to another.
export const angleTo = (from, to) => {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  else if (d < -Math.PI) d += TAU
  return d
}
export const dampAngle = (a, b, rate, dt) => a + angleTo(a, b) * (1 - Math.exp(-rate * dt))

export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz)

export const easeOut = (t) => 1 - (1 - t) ** 3
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// A damped spring: squash and stretch, wobbling boxes, tails that lag behind.
export class Spring {
  constructor(value = 0, stiffness = 180, damping = 12) {
    this.x = value
    this.v = 0
    this.k = stiffness
    this.c = damping
  }
  update(target, dt) {
    // two half steps on a slow frame, so a hitch cannot make it explode
    const steps = dt > 1 / 90 ? 2 : 1
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h
      this.x += this.v * h
    }
    return this.x
  }
  kick(v) {
    this.v += v
  }
}
