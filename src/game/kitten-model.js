// A procedural low-poly kitten: flat-shaded shapes, one colour per face, no
// textures and no imported model. Each body part follows one bone of a small
// skeleton (rigid skinning), so a whole kitten is a single draw call and every
// pose is computed from a handful of numbers: how far it is through a stride,
// how much it is sitting, loafing, crouching, swimming...
import * as THREE from 'three'
import { Poly, colour } from '../core/lowpoly.js'
import { makeRng, noise3 } from '../core/rng.js'
import { clamp } from '../core/mathx.js'

export const BONE = { root: 0, body: 1, head: 2, earL: 3, earR: 4, legFL: 5, legFR: 6, legBL: 7, legBR: 8, tail: 9 }
const TAIL = 5

export const kittenMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
export const eyeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
// in the dark the eyes catch the laser light, bright enough for the bloom
export const eyeShineMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 4, 4) })
for (const m of [kittenMaterial, eyeMaterial, eyeShineMaterial]) m.userData.shared = true

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const Z = new THREE.Vector3(0, 0, 1)

// ---- coat ------------------------------------------------------------------
// Paints one face. `part` says which body part it is; positions are in the
// kitten's own space (facing +z, feet on y = 0).
function coatColour(g, part, p, n, J, seg, out) {
  const col = g.colours
  const bz = p.z
  const by = p.y - J.bodyY
  const hx = p.x - J.head.x
  const hy = p.y - J.head.y
  const hz = p.z - J.head.z
  const under = (part === 'body' || part === 'chest') && n.y < -0.35
  const chest = (part === 'body' || part === 'chest') && bz > 0.07 && by < 0.03 && n.z > -0.2
  const paw = part === 'paw'
  const muzzle = part === 'muzzle'
  const blob = noise3(p.x * 9 + 3.1, p.y * 9, p.z * 9, g.noise)
  let c = col.base
  switch (g.pattern) {
    case 'solid':
      c = under || muzzle ? col.light : col.base
      break
    case 'tabby':
      if (part === 'body' && Math.sin(bz * 52 + Math.abs(p.x) * 14 + blob * 2) > 0.2) c = col.dark
      if (part === 'head' && hy > 0.035 && Math.sin(hz * 62 + 1) > 0.1) c = col.dark
      if (part === 'head' && hz > 0.06 && hy > 0.0 && Math.abs(Math.sin(hx * 75)) > 0.75) c = col.dark
      if ((part === 'leg' || part === 'haunch') && Math.sin(p.y * 70) > 0.4) c = col.dark
      if (part === 'tail') c = seg % 2 === 0 ? col.dark : col.base
      if (part === 'tailTip') c = col.dark
      if (under || muzzle || chest) c = col.light
      break
    case 'tuxedo':
      if (under || chest || paw || muzzle) c = col.white
      if (part === 'head' && Math.abs(hx) < 0.028 && hz > 0.05 && hy < 0.03) c = col.white
      break
    case 'bicolor':
      if (under || chest || paw || muzzle || (part === 'leg' && p.y < 0.1)) c = col.white
      if ((part === 'body' || part === 'haunch') && blob > 0.64) c = col.white
      if (part === 'head' && hz > 0.065 && hy < 0.005) c = col.white
      break
    case 'calico':
      c = col.white
      if (!(under || paw || muzzle || chest)) {
        if (blob > 0.58) c = col.patchA
        else if (blob < 0.38) c = col.patchB
      }
      if (part === 'tail' || part === 'tailTip') c = blob > 0.5 ? col.patchA : col.patchB
      break
    case 'tortie': {
      const m = noise3(p.x * 17, p.y * 17, p.z * 17, g.noise)
      c = m > 0.53 ? col.patchA : m > 0.46 ? '#7c4a2a' : col.patchB
      break
    }
    case 'point':
      if (part === 'ear' || paw || part === 'tailTip' || muzzle) c = col.points
      if (part === 'leg' && p.y < 0.11) c = col.points
      if (part === 'tail' && seg >= 2) c = col.points
      if (part === 'head' && hz > 0.045 && Math.hypot(hx * 0.9, hy + 0.025) < 0.07) c = col.points
      if (under) c = col.light
      break
    case 'spotted': {
      const s = noise3(p.x * 23, p.y * 23, p.z * 23, g.noise)
      if ((part === 'body' || part === 'haunch') && s > 0.63) c = col.dark
      if (part === 'leg' && s > 0.68) c = col.dark
      if (part === 'tail') c = seg % 2 === 0 ? col.dark : col.base
      if (under || muzzle || chest) c = col.light
      break
    }
  }
  out.copy(colour(c))
  if (part === 'ear' && n.z > 0.3) out.lerp(colour(g.innerEar), 0.75)
  // a little fake occlusion: faces that look down are darker
  out.multiplyScalar(0.82 + 0.18 * (n.y * 0.5 + 0.5))
}

// ---- model -----------------------------------------------------------------
export function buildKitten(g, { shine = false } = {}) {
  const rand = makeRng((g.seed ^ 0x9e3779b9) >>> 0)
  const P = new Poly(rand, { skinned: true })
  const w = g.chonk
  const hs = g.head
  const L = 0.17 * g.legs
  const bodyY = L + 0.045
  const J = {
    bodyY,
    body: new THREE.Vector3(0, bodyY, 0),
    neck: new THREE.Vector3(0, bodyY + 0.075, 0.15),
    head: new THREE.Vector3(0, bodyY + 0.165, 0.205),
    shoulder: new THREE.Vector3(0.068 * w, L + 0.005, 0.105),
    hip: new THREE.Vector3(0.072 * w, L + 0.005, -0.115),
    tail: new THREE.Vector3(0, bodyY + 0.035, -0.215),
  }
  const ear = (sx) => new THREE.Vector3(sx * 0.07 * hs, J.head.y + 0.085 * hs, J.head.z - 0.012)
  J.earL = ear(1)
  J.earR = ear(-1)
  let seg = 0
  const paint = (part) => (p, n, out) => coatColour(g, part, p, n, J, seg, out)

  // torso: a lathe along the spine, so stripes come out as bands
  P.bone = BONE.body
  const profile = [
    [0, -0.235], [0.08, -0.215], [0.122, -0.16], [0.138, -0.085], [0.138, 0],
    [0.128, 0.07], [0.108, 0.128], [0.07, 0.17], [0, 0.185],
  ].map(([r, z]) => new THREE.Vector2(r, z))
  P.add(new THREE.LatheGeometry(profile, 8), {
    at: [0, bodyY, 0], rot: [Math.PI / 2, 0, 0], scale: [w, 1, 0.88], paint: paint('body'), vary: 0.035,
  })
  P.ico(0.086, 1, { at: [0, bodyY + 0.045, 0.12], scale: [w * 0.95, 0.95, 1], paint: paint('chest'), vary: 0.03 })

  // head
  P.bone = BONE.head
  const H = J.head
  P.ico(0.13, 1, { at: [H.x, H.y, H.z], scale: [1.12 * hs, 0.94 * hs, hs], paint: paint('head'), vary: 0.03 })
  for (const sx of [-1, 1])
    P.ico(0.052, 0, { at: [sx * 0.062 * hs, H.y - 0.034 * hs, H.z + 0.05 * hs], scale: [1.1, 0.9, 1], paint: paint('head'), vary: 0.03 })
  P.ico(0.047, 0, { at: [0, H.y - 0.042 * hs, H.z + 0.1 * hs], scale: [1.3, 0.75, 0.95], paint: paint('muzzle'), vary: 0.02 })
  P.cone(0.019, 0.022, 3, { at: [0, H.y - 0.017 * hs, H.z + 0.142 * hs], rot: [Math.PI / 2 + 0.35, 0, Math.PI], color: g.nose, vary: 0 })

  // ears: three-sided cones turned so one face looks forward (that face gets the pink)
  const eh = 0.105 * g.ears
  const er = 0.058 * g.ears
  for (const [sx, bone, at] of [[1, BONE.earL, J.earL], [-1, BONE.earR, J.earR]]) {
    P.bone = bone
    _e.set(-0.12, 0, -sx * 0.32)
    const centre = new THREE.Vector3(0, eh / 2, 0).applyEuler(_e).add(at)
    P.add(new THREE.ConeGeometry(er, eh, 3).rotateY(Math.PI), {
      at: [centre.x, centre.y, centre.z], rot: [_e.x, _e.y, _e.z], paint: paint('ear'), vary: 0.02,
    })
  }

  // legs, with haunches on the back pair and a paw on each
  const legs = [[BONE.legFL, J.shoulder, 1], [BONE.legFR, J.shoulder, -1], [BONE.legBL, J.hip, 1], [BONE.legBR, J.hip, -1]]
  for (const [bone, j, sx] of legs) {
    P.bone = bone
    const x = sx * j.x
    P.cyl(0.034, 0.029, L, 5, { at: [x, j.y - L / 2, j.z], paint: paint('leg'), vary: 0.03 })
    P.ico(0.034, 0, { at: [x, 0.022, j.z + 0.012], scale: [1, 0.62, 1.3], paint: paint('paw'), vary: 0.02 })
    if (bone >= BONE.legBL)
      P.ico(0.062, 0, { at: [x * 1.06, j.y + 0.005, j.z - 0.005], scale: [0.85 * w, 1.1, 1.15], paint: paint('haunch'), vary: 0.03 })
  }

  // tail: five segments, straight up in the rest pose
  const segL = 0.068 * g.tail
  for (let s = 0; s < TAIL; s++) {
    P.bone = BONE.tail + s
    seg = s
    const r0 = 0.031 - s * 0.0034
    P.cyl(r0 - 0.0034, r0, segL * 1.18, 5, { at: [0, J.tail.y + s * segL + segL * 0.5, J.tail.z], paint: paint('tail'), vary: 0.03 })
  }
  seg = TAIL - 1
  P.ico(0.016, 0, { at: [0, J.tail.y + TAIL * segL - 0.004, J.tail.z], paint: paint('tailTip'), vary: 0 })

  const geometry = P.build()

  // ---- skeleton
  const joints = [
    [-1, new THREE.Vector3()],
    [0, J.body],
    [1, J.neck],
    [2, J.earL],
    [2, J.earR],
    [1, new THREE.Vector3(J.shoulder.x, J.shoulder.y, J.shoulder.z)],
    [1, new THREE.Vector3(-J.shoulder.x, J.shoulder.y, J.shoulder.z)],
    [1, new THREE.Vector3(J.hip.x, J.hip.y, J.hip.z)],
    [1, new THREE.Vector3(-J.hip.x, J.hip.y, J.hip.z)],
  ]
  for (let s = 0; s < TAIL; s++) joints.push([s === 0 ? 1 : BONE.tail + s - 1, new THREE.Vector3(0, J.tail.y + s * segL, J.tail.z)])
  const bones = joints.map(([parent, at]) => {
    const bone = new THREE.Bone()
    const from = parent >= 0 ? joints[parent][1] : new THREE.Vector3()
    bone.position.copy(at).sub(from)
    return bone
  })
  joints.forEach(([parent], i) => parent >= 0 && bones[parent].add(bones[i]))
  bones[BONE.head].rotation.order = 'YXZ'

  const mesh = new THREE.SkinnedMesh(geometry, kittenMaterial)
  mesh.add(bones[0])
  mesh.bind(new THREE.Skeleton(bones))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  // ---- eyes: unlit discs on a pivot, so a blink squashes them in place
  const E = new Poly(rand)
  const R = new THREE.Vector3(0.13 * 1.12 * hs, 0.13 * 0.94 * hs, 0.13 * hs)
  const spots = []
  for (const sx of [1, -1]) {
    const dir = new THREE.Vector3(sx * 0.43, 0.15, 0.89).normalize()
    const t = 1 / Math.sqrt((dir.x / R.x) ** 2 + (dir.y / R.y) ** 2 + (dir.z / R.z) ** 2)
    const s = dir.clone().multiplyScalar(t)
    const normal = new THREE.Vector3(s.x / R.x ** 2, s.y / R.y ** 2, s.z / R.z ** 2).normalize()
    spots.push({ sx, at: s.add(H), normal })
  }
  const pivotAt = new THREE.Vector3(0, spots[0].at.y, spots[0].at.z)
  for (const { sx, at, normal } of spots) {
    _q.setFromUnitVectors(Z, normal)
    _e.setFromQuaternion(_q)
    const rot = [_e.x, _e.y, _e.z]
    const base = at.clone().sub(pivotAt).addScaledVector(normal, 0.004)
    const iris = sx > 0 ? g.eyes.left : g.eyes.right
    const put = (geo, offset, color, scale = 1) => {
      const p = base.clone().addScaledVector(normal, offset.z)
      p.x += offset.x
      p.y += offset.y
      E.add(geo, { at: [p.x, p.y, p.z], rot, scale, color, vary: 0 })
    }
    put(new THREE.CircleGeometry(0.031, 8), { x: 0, y: 0, z: 0 }, iris)
    put(new THREE.CircleGeometry(0.0125, 6), { x: 0, y: -0.001, z: 0.0015 }, '#110f14', [0.62, 1.45, 1])
    put(new THREE.CircleGeometry(0.008, 5), { x: -sx * 0.007, y: 0.01, z: 0.003 }, '#ffffff')
    put(new THREE.CircleGeometry(0.0042, 4), { x: sx * 0.006, y: -0.008, z: 0.003 }, '#ffffff')
  }
  const eyesMesh = new THREE.Mesh(E.build(), shine ? eyeShineMaterial : eyeMaterial)
  const eyes = new THREE.Object3D()
  eyes.position.copy(pivotAt).sub(J.neck)
  eyes.add(eyesMesh)
  bones[BONE.head].add(eyes)

  return {
    mesh,
    bones,
    rest: bones.map((b) => b.position.clone()),
    eyes,
    eyesMesh,
    joints: J,
    setShine(on) {
      eyesMesh.material = on ? eyeShineMaterial : eyeMaterial
    },
  }
}

// ---- poses -----------------------------------------------------------------
// The numbers a pose is made of. The kitten's brain moves these toward
// targets every frame; poseKitten turns them into bone rotations.
export function newPose() {
  return {
    time: 0, phase: 0, stride: 0, run: 0,
    sit: 0, loaf: 0, crouch: 0, arch: 0, swim: 0, sleep: 0, eat: 0, groom: 0,
    air: 0, squash: 0, wiggle: 0, swat: 0, shake: 0, meow: 0,
    lookYaw: 0, lookPitch: 0, tilt: 0,
    earFlat: 0, twitchL: 0, twitchR: 0,
    blink: 0, eyesClosed: 0, breath: 0,
    tailUp: 0.4, tailWag: 0.15, tailSway: 0, tailCurl: 0, tailPuff: 0,
  }
}

const LEG_TROT = [0, Math.PI, Math.PI, 0]
const LEG_RUN = [0, 0.4, Math.PI, Math.PI + 0.4]

export function poseKitten(rig, a) {
  const b = rig.bones
  const r = rig.rest
  const t = a.time
  const settle = Math.max(a.sit, a.loaf, a.swim)
  const stride = a.stride * (1 - settle)

  // root: bob, crouch, settling down, squash and stretch
  const bob = Math.abs(Math.sin(a.phase)) * 0.018 * stride * (1 - a.run * 0.6) + Math.max(0, Math.sin(a.phase * 2)) * 0.016 * a.run * stride
  const rootY = bob - 0.05 * a.crouch - 0.03 * a.sit - 0.088 * a.loaf - 0.17 * a.swim + 0.035 * a.arch
  b[0].position.set(r[0].x, r[0].y + rootY, r[0].z)
  const sq = clamp(a.squash, -0.4, 0.4)
  b[0].scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5)
  b[0].rotation.set(0, Math.sin(t * 26) * 0.08 * a.wiggle, Math.sin(t * 40) * 0.28 * a.shake)

  // body
  const sitTilt = -0.62 * a.sit
  const gallop = Math.sin(a.phase + 0.6) * 0.13 * a.run * stride
  b[1].rotation.set(sitTilt + gallop + 0.12 * a.crouch - 0.06 * a.swim, 0, 0)
  const breathe = Math.sin(a.breath) * 0.02 * (0.4 + a.loaf + a.sleep)
  b[1].scale.set(1 + breathe * 0.5, 1 + breathe + 0.2 * a.arch, 1)
  b[1].position.set(r[1].x, r[1].y + 0.02 * a.arch, r[1].z)

  // legs
  const amp = 0.78 * stride
  const tuck = 1 - 0.82 * a.loaf
  for (let k = 0; k < 4; k++) {
    const leg = b[BONE.legFL + k]
    const front = k < 2
    const off = LEG_TROT[k] + (LEG_RUN[k] - LEG_TROT[k]) * a.run
    let rx = Math.sin(a.phase + off) * amp
    let sy = tuck * (1 - 0.3 * a.crouch) * (1 + 0.1 * a.arch)
    if (front) {
      rx += 0.62 * a.sit - 0.12 * a.crouch - 0.9 * a.air
      sy *= 1 + 0.22 * a.sit
      if (k === 0) rx -= 1.5 * a.swat + 1.3 * a.groom
    } else {
      rx += -0.7 * a.sit - 0.12 * a.crouch + 0.95 * a.air
      sy *= 1 - 0.1 * a.sit
    }
    rx += Math.sin(t * 13 + k * 1.6) * 0.65 * a.swim
    leg.rotation.set(rx, 0, k === 0 ? -0.25 * a.groom : 0)
    leg.scale.set(1, Math.max(0.08, sy), 1)
  }

  // head: look where it is told, stay level when the body tilts
  const head = b[BONE.head]
  let pitch = a.lookPitch - sitTilt - gallop * 0.6 - 0.12 * a.crouch
  pitch += 0.42 * a.sleep + 0.95 * a.eat + 0.55 * a.groom - 0.35 * a.swim - 0.25 * a.meow
  const yaw = clamp(a.lookYaw, -1.15, 1.15) + 0.45 * a.groom
  const tilt = a.tilt + 0.35 * a.sleep + 0.2 * a.groom
  head.rotation.set(pitch, yaw, tilt)
  head.position.set(r[2].x, r[2].y - 0.03 * a.sleep - 0.01 * a.loaf, r[2].z + 0.03 * a.eat - 0.015 * a.sleep)

  // ears
  for (const [i, sx, tw] of [[BONE.earL, 1, a.twitchL], [BONE.earR, -1, a.twitchR]]) {
    b[i].rotation.set(-0.75 * a.earFlat, 0, sx * (-0.55 * a.earFlat - 0.45 * tw))
  }

  // eyes
  rig.eyes.scale.y = 1 - 0.9 * clamp(Math.max(a.blink, a.eyesClosed), 0, 1)

  // tail: a resting curve, a happy question mark, wrapped around when settled
  const up = clamp(a.tailUp, 0, 1)
  const curl = clamp(Math.max(a.tailCurl, a.loaf, a.sit * 0.8), 0, 1)
  const puff = 1 + 0.75 * a.tailPuff
  for (let s = 0; s < TAIL; s++) {
    const bone = b[BONE.tail + s]
    let rx
    if (s === 0) rx = -1.05 + 0.75 * up
    else rx = 0.12 + (s >= 3 ? 0.3 * up : 0.06 * up)
    // settled: lie back along the ground and wrap round the side
    if (s === 0) rx = rx * (1 - curl) + (-1.95) * curl
    else if (s === 1) rx = rx * (1 - curl) + 0.55 * curl
    else rx = rx * (1 - curl) + 0.05 * curl
    rx = rx * (1 - a.tailPuff) + (s === 0 ? -0.15 : 0.02) * a.tailPuff
    rx = rx * (1 - a.swim) + (s === 0 ? -1.5 : 0.04) * a.swim
    const wag = Math.sin(t * (3 + a.tailWag * 6) - s * 0.75) * a.tailWag * (0.25 + s * 0.12)
    const rz = wag + a.tailSway * (0.2 + s * 0.08) + (s > 0 ? curl * 0.5 : 0)
    bone.rotation.set(rx, 0, rz)
    bone.scale.set(puff, 1, puff)
  }
}

// A sitting pose for adoption-card portraits.
export function portraitPose(seed) {
  const rng = makeRng(seed)
  const a = newPose()
  a.sit = 1
  a.tailCurl = 1
  a.tailUp = 0.2
  a.tailWag = 0
  a.tilt = rng.range(-0.28, 0.28)
  a.lookYaw = rng.range(-0.25, 0.25)
  a.lookPitch = -0.08
  a.time = rng.range(0, 10)
  return a
}
