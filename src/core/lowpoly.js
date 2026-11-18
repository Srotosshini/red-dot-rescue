// The low-poly look in one place: every shape is flat triangles with one
// colour per face and no textures. `Poly` collects shapes (boxes, cones,
// icosahedrons, loose triangles) into a single mesh, so a whole level is a
// handful of draw calls.
import * as THREE from 'three'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _n = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _col = new THREE.Color()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const ZERO = [0, 0, 0]

// One lit material and one unlit "glow" material are enough for all scenery.
// Glow colours may be brighter than 1, which is what the bloom picks up.
export const MAT = {
  flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
}

const colours = new Map()
// A cached THREE.Color for a css colour. Treat the result as read-only.
export function colour(css) {
  let c = colours.get(css)
  if (!c) colours.set(css, (c = new THREE.Color(css)))
  return c
}

export class Poly {
  // `skinned: true` also records which bone each shape belongs to (set
  // `poly.bone` before adding it), for a rigidly skinned character.
  constructor(rand = Math.random, { skinned = false } = {}) {
    this.rand = rand
    this.pos = []
    this.col = []
    this.skin = skinned ? [] : null
    this.bone = 0
    this.parent = null
  }

  get empty() {
    return this.pos.length === 0
  }

  // Add any geometry.
  //   at, rot, scale  where it goes (scale may be one number or [x, y, z])
  //   color           one colour for the whole shape, or
  //   paint           (centre, normal, out) => writes that face's colour to `out`
  //   vary            how much each face's brightness may drift, for a hand-cut look
  //   flip            turn the faces inside out (the inside of a basket)
  add(geometry, { at = ZERO, rot = ZERO, scale = 1, color = '#ffffff', paint = null, vary = 0.06, flip = false } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    _p.set(at[0], at[1], at[2])
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]))
    if (typeof scale === 'number') _s.setScalar(scale)
    else _s.set(scale[0], scale[1], scale[2])
    _m.compose(_p, _q, _s)
    if (this.parent) _m.premultiply(this.parent)
    // a mirrored shape comes out inside out, so swap two corners back
    const swap = _m.determinant() < 0 !== flip
    const base = paint ? null : colour(color)
    const src = g.attributes.position
    const { pos, col, rand } = this
    for (let i = 0; i < src.count; i += 3) {
      _a.fromBufferAttribute(src, i).applyMatrix4(_m)
      _b.fromBufferAttribute(src, i + (swap ? 2 : 1)).applyMatrix4(_m)
      _c.fromBufferAttribute(src, i + (swap ? 1 : 2)).applyMatrix4(_m)
      if (paint) {
        _mid.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3)
        _n.crossVectors(_ab.subVectors(_b, _a), _ac.subVectors(_c, _a)).normalize()
        paint(_mid, _n, _col)
      } else _col.copy(base)
      if (vary) _col.multiplyScalar(1 + (rand() - 0.5) * 2 * vary)
      pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z)
      col.push(_col.r, _col.g, _col.b, _col.r, _col.g, _col.b, _col.r, _col.g, _col.b)
      if (this.skin) this.skin.push(this.bone, this.bone, this.bone)
    }
    if (g !== geometry) g.dispose()
    geometry.dispose()
    return this
  }

  box(w, h, d, o) {
    return this.add(new THREE.BoxGeometry(w, h, d), o)
  }
  cyl(rTop, rBottom, h, sides, o) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1), o)
  }
  // a tube with no end caps
  tube(rTop, rBottom, h, sides, o) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, true), o)
  }
  cone(r, h, sides, o) {
    return this.add(new THREE.ConeGeometry(r, h, sides, 1), o)
  }
  ico(r, detail, o) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), o)
  }
  octa(r, o) {
    return this.add(new THREE.OctahedronGeometry(r, 0), o)
  }
  torus(r, tube, o) {
    return this.add(new THREE.TorusGeometry(r, tube, 5, 12), o)
  }

  // One loose triangle. Corners are [x, y, z], counter-clockwise seen from the
  // front; `c` is a THREE.Color. These skip the placement transform.
  tri(a, b, c3, c, vary = 0) {
    const k = vary ? 1 + (this.rand() - 0.5) * 2 * vary : 1
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c3[0], c3[1], c3[2])
    const r = c.r * k
    const g = c.g * k
    const bl = c.b * k
    this.col.push(r, g, bl, r, g, bl, r, g, bl)
    if (this.skin) this.skin.push(this.bone, this.bone, this.bone)
    return this
  }
  // A four-cornered face, as two triangles.
  quad(a, b, c3, d, c, vary = 0) {
    return this.tri(a, b, c3, c, vary).tri(a, c3, d, c, vary)
  }

  // Run `build`, with everything it adds placed at (x, y, z), turned about the
  // vertical and scaled. Calls nest.
  place(x, y, z, turn, scale, build) {
    const before = this.parent
    const here = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, turn), _s.setScalar(scale))
    this.parent = before ? here.premultiply(before) : here
    build(this)
    this.parent = before
    return this
  }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals() // loose triangles, so these come out as flat face normals
    if (this.skin) {
      // rigid skinning: every vertex follows exactly one bone
      const n = this.skin.length
      const index = new Uint16Array(n * 4)
      const weight = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        index[i * 4] = this.skin[i]
        weight[i * 4] = 1
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4))
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4))
      this.skin = []
    }
    this.pos = []
    this.col = []
    return g
  }

  mesh(material = MAT.flat, { cast = true, receive = true } = {}) {
    const mesh = new THREE.Mesh(this.build(), material)
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    return mesh
  }
}

// Free everything under an object, except the shared materials above.
export function dispose(object) {
  object.traverse((o) => {
    o.geometry?.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      if (m === MAT.flat || m === MAT.glow || m.userData.shared) continue
      m.map?.dispose()
      m.dispose()
    }
  })
  object.removeFromParent()
}
