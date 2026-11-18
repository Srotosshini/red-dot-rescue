// The storm: the light drifting from calm to grim, clouds massing around the
// diorama, rain (drawn entirely in a shader), splashes, lightning, and gusts of
// wind on the rooftops. `storm` runs from 0 (level start) to 1 (it hits).
import * as THREE from 'three'
import { Poly, colour } from '../core/lowpoly.js'
import { clamp, damp, lerp, smooth } from '../core/mathx.js'

const rainMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      speed: { value: 9 },
      len: { value: 0.38 },
      boxMin: { value: new THREE.Vector3() },
      boxSize: { value: new THREE.Vector3(1, 1, 1) },
      wind: { value: new THREE.Vector2() },
      color: { value: new THREE.Color('#c9d6ea') },
      opacity: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float speed;
      uniform float len;
      uniform vec3 boxMin;
      uniform vec3 boxSize;
      uniform vec2 wind;
      attribute vec4 seed;
      varying float vFade;
      void main() {
        float fall = fract(seed.y - time * speed / boxSize.y);
        vec3 p = boxMin + vec3(seed.x, fall, seed.z) * boxSize;
        p.xz += wind * (fall - 0.5) * 1.4;
        vec3 dir = normalize(vec3(wind.x * 0.7, -speed, wind.y * 0.7));
        p -= dir * len * seed.w;
        vFade = (1.0 - seed.w * 0.9) * smoothstep(0.0, 0.08, fall);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(color, opacity * vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  })

function makeRain(count, min, size, rand) {
  const geo = new THREE.BufferGeometry()
  const seeds = new Float32Array(count * 2 * 4)
  for (let i = 0; i < count; i++) {
    const x = rand()
    const y = rand()
    const z = rand()
    seeds.set([x, y, z, 0, x, y, z, 1], i * 8)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3))
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
  const mat = rainMaterial()
  mat.uniforms.boxMin.value.copy(min)
  mat.uniforms.boxSize.value.copy(size)
  const lines = new THREE.LineSegments(geo, mat)
  lines.frustumCulled = false
  lines.renderOrder = 8
  lines.userData.count = count
  return lines
}

export class Weather {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    stage.scene.add(this.group)
    this.flash = 0
    this.flashK = 0
    this.nextStrike = 8
    this.wind = { x: 0, z: 0, force: 0, warn: false, gusting: false }
    this.windT = 0
    this.rain = []
    this.splashes = null
    this.clouds = null
    this.bolt = null
    this.boltT = 0
    this.level = null
    this.tmp = { top: new THREE.Color(), bottom: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color() }
    this.cloudMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.boltMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.5, 9) })
    this.rainAmount = 0
  }

  setLevel(level, rand) {
    for (const r of this.rain) {
      r.geometry.dispose()
      r.material.dispose()
    }
    this.group.clear()
    this.rain = []
    this.level = level
    const theme = level.theme
    const [W, D] = level.def.size
    this.windT = 0
    this.wind.force = 0
    this.flash = 0
    this.nextStrike = 6 + rand() * 6

    if (!theme.indoor) {
      this.rain.push(makeRain(2800, new THREE.Vector3(-W / 2 - 1.5, -1, -D / 2 - 1.5), new THREE.Vector3(W + 3, 9, D + 3), rand))
      this.splashes = this.makeSplashes(level, rand)
      this.group.add(this.splashes.mesh)
      this.clouds = this.makeClouds(W, D, rand)
      this.group.add(this.clouds)
    } else {
      this.splashes = null
      this.clouds = null
    }
    // rain falling through the drain grates
    for (const d of level.def.decor ?? []) {
      if (d.k !== 'shaft') continue
      const y = level.grid.heightAt(d.x, d.z)
      this.rain.push(makeRain(90, new THREE.Vector3(d.x - 0.45, y, d.z - 0.45), new THREE.Vector3(0.9, d.h ?? 4, 0.9), rand))
    }
    for (const r of this.rain) this.group.add(r)
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMaterial)
    this.bolt.visible = false
    this.group.add(this.bolt)
  }

  makeClouds(W, D, rand) {
    const P = new Poly(rand)
    const puffs = []
    // a ring of cloud banks behind and around the diorama, never over it
    for (let k = 0; k < 16; k++) {
      const a = Math.PI * (0.05 + (k / 15) * 0.9)
      const r = Math.max(W, D) * 0.75 + 4 + rand() * 4
      puffs.push([Math.cos(a) * r * 1.15, 3 + rand() * 3.5, -Math.sin(a) * r - 2])
    }
    for (const [x, y, z] of puffs) {
      const n = 3 + Math.floor(rand() * 3)
      for (let j = 0; j < n; j++) {
        const s = 1.2 + rand() * 1.4
        P.ico(s, 1, {
          at: [x + (j - n / 2) * s * 0.9, y + rand() * 0.6, z + (rand() - 0.5) * 1.5],
          scale: [1.3, 0.75, 1],
          paint: (p, nrm, out) => {
            out.copy(colour('#ffffff')).multiplyScalar(0.72 + 0.28 * (nrm.y * 0.5 + 0.5))
          },
          vary: 0.04,
        })
      }
    }
    const mesh = new THREE.Mesh(P.build(), this.cloudMaterial)
    return mesh
  }

  makeSplashes(level, rand) {
    const N = 90
    const mesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.03, 0.05, 8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.4, 1.6), transparent: true, opacity: 0.55, depthWrite: false }),
      N,
    )
    mesh.frustumCulled = false
    const items = Array.from({ length: N }, () => ({ life: 1, x: 0, y: -50, z: 0 }))
    const m = new THREE.Matrix4()
    const grid = level.grid
    return {
      mesh,
      update(dt, amount) {
        for (let k = 0; k < N; k++) {
          const s = items[k]
          s.life += dt * 3
          if (s.life >= 1 && rand() < amount * 0.35) {
            // respawn on something you can stand on
            for (let tries = 0; tries < 4; tries++) {
              const x = grid.x0 + rand() * grid.width
              const z = grid.z0 + rand() * grid.depth
              const i = grid.index(x, z)
              if (i >= 0 && Number.isFinite(grid.top[i])) {
                s.x = x
                s.z = z
                s.y = grid.top[i] + 0.015
                s.life = 0
                break
              }
            }
          }
          const sc = s.life < 1 ? 0.4 + s.life * 2.2 : 0
          m.makeScale(sc, 1, sc).setPosition(s.x, s.y, s.z)
          mesh.setMatrixAt(k, m)
        }
        mesh.instanceMatrix.needsUpdate = true
      },
    }
  }

  strike(rand, camera) {
    this.flash = 1
    this.flashK = 0
    const indoor = this.level?.theme.indoor
    if (!indoor) {
      // a jagged bolt somewhere behind the level
      const [W, D] = this.level.def.size
      const x0 = (rand() - 0.5) * W * 1.6
      const z0 = -D / 2 - 10 - rand() * 10
      const pts = []
      let x = x0
      const top = 24
      const bottom = 0
      const n = 12
      for (let i = 0; i <= n; i++) {
        pts.push(new THREE.Vector3(x, top - ((top - bottom) * i) / n, z0))
        x += (rand() - 0.5) * 2.2
      }
      const P = new Poly(rand)
      for (let i = 0; i < n; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const len = a.distanceTo(b)
        const ang = Math.atan2(b.x - a.x, a.y - b.y)
        P.box(0.16, len + 0.1, 0.16, { at: [mid.x, mid.y, mid.z], rot: [0, 0, ang], color: '#ffffff', vary: 0 })
      }
      this.bolt.geometry.dispose()
      this.bolt.geometry = P.build()
      this.bolt.visible = true
      this.boltT = 0.22
    }
    void camera
  }

  // returns true on a lightning strike this frame
  update(dt, { storm, t, rand, active = true }) {
    const L = this.level
    if (!L) return false
    const th = L.theme
    const st = this.stage
    const k = smooth(0, 1, storm)
    const T = this.tmp

    // ---- light and mood
    const mixC = (a, b, out) => out.copy(colour(a)).lerp(colour(b), k)
    mixC(th.sky.calm[0], th.sky.storm[0], st.sky.material.uniforms.top.value)
    mixC(th.sky.calm[1], th.sky.storm[1], st.sky.material.uniforms.bottom.value)
    mixC(th.sky.calm[2] ?? th.sky.calm[1], th.sky.storm[2] ?? th.sky.storm[1], st.sky.material.uniforms.below.value)
    mixC(th.hemi.calm[0], th.hemi.storm[0], st.hemi.color)
    mixC(th.hemi.calm[1], th.hemi.storm[1], st.hemi.groundColor)
    mixC(th.sun.calm[0], th.sun.storm[0], st.sun.color)
    const flashLight = this.flash * (th.indoor ? 0.9 : 1.5)
    st.hemi.intensity = lerp(th.hemi.calm[2], th.hemi.storm[2], k) + flashLight
    st.sun.intensity = lerp(th.sun.calm[1], th.sun.storm[1], k)
    st.renderer.toneMappingExposure = lerp(th.exposure[0], th.exposure[1], k)
    st.mood.vignette = lerp(th.vignette[0], th.vignette[1], k)
    st.mood.desat = lerp(th.desat[0], th.desat[1], k)
    mixC(th.tint.calm, th.tint.storm, st.mood.tint)
    st.mood.flash = this.flash * (th.indoor ? 0.25 : 0.42)
    if (this.clouds) {
      // clouds go from white to bruised
      this.cloudMaterial.color.copy(colour('#ffffff')).lerp(colour('#5a6070'), k)
      this.clouds.rotation.y = Math.sin(t * 0.02) * 0.05
      this.clouds.position.y = -k * 1.2
    }

    // ---- wind
    const W = L.def.wind
    if (W) {
      this.windT += active ? dt : 0
      const len = Math.hypot(W.dir[0], W.dir[1])
      this.wind.x = W.dir[0] / len
      this.wind.z = W.dir[1] / len
      const c = this.windT % W.period
      const g0 = W.period - W.gust
      this.wind.warn = c >= g0 - W.warn && c < g0
      this.wind.gusting = c >= g0
      this.wind.force = this.wind.gusting ? W.force * Math.sin((Math.PI * (c - g0)) / W.gust) : 0
    }

    // ---- rain
    const want = th.indoor ? 0 : clamp(lerp(th.rain0, 1, smooth(0.55, 1, storm)) + (storm >= 1 ? 0.2 : 0), 0, 1)
    this.rainAmount = damp(this.rainAmount, want, 1.5, dt)
    const slantX = 0.6 + this.wind.x * this.wind.force * 0.5
    const slantZ = 0.25 + this.wind.z * this.wind.force * 0.5
    for (const r of this.rain) {
      const u = r.material.uniforms
      u.time.value = t
      const shaft = r.userData.count < 200
      u.wind.value.set(shaft ? 0.05 : slantX, shaft ? 0.02 : slantZ)
      const amount = shaft ? 0.35 + storm * 0.65 : this.rainAmount
      r.geometry.setDrawRange(0, Math.floor(r.userData.count * amount) * 2)
      u.opacity.value = shaft ? 0.35 : 0.32 + this.rainAmount * 0.25
      r.visible = amount > 0.01
    }
    this.splashes?.update(dt, this.rainAmount)

    // ---- lightning
    let struck = false
    if (active && storm > 0.42) {
      this.nextStrike -= dt
      if (this.nextStrike <= 0) {
        this.strike(rand)
        struck = true
        this.nextStrike = lerp(13, 4.5, smooth(0.42, 1, storm)) * (0.6 + rand() * 0.8)
      }
    }
    if (this.flash > 0) {
      this.flashK += dt
      // a double flicker, then fade
      const f = this.flashK
      this.flash = f < 0.06 ? 1 : f < 0.11 ? 0.25 : f < 0.17 ? 0.85 : Math.max(0, 0.85 - (f - 0.17) * 2.4)
    }
    if (this.boltT > 0) {
      this.boltT -= dt
      this.bolt.visible = this.boltT > 0 && (this.flashK < 0.06 || this.flashK > 0.11)
    }
    return struck
  }
}
