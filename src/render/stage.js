// The renderer, the scene, the lights and the post-processing chain.
//   high:   bloom on the laser dot, tilt-shift blur, vignette, 4x MSAA
//   medium: bloom and vignette, no tilt-shift, lower resolution
//   low:    straight to the screen, no post-processing
// It starts on a guess for the device and steps down by itself if the frame
// rate cannot keep up.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export const QUALITY = {
  low: { dpr: 1, post: false, tilt: false, msaa: 0, shadow: 1024 },
  medium: { dpr: 1.5, post: true, tilt: false, msaa: 4, shadow: 1024 },
  high: { dpr: 2, post: true, tilt: true, msaa: 4, shadow: 2048 },
}
export const QUALITY_ORDER = ['low', 'medium', 'high']

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

// One direction of a 9-tap Gaussian, stronger the further a pixel is from the
// sharp band around the dot: the miniature look.
const TiltShift = {
  name: 'TiltShift',
  uniforms: {
    tDiffuse: { value: null },
    stepSize: { value: new THREE.Vector2(0.001, 0) },
    focus: { value: 0.5 },
    band: { value: 0.17 },
    amount: { value: 1.6 },
  },
  vertexShader: quadVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 stepSize;
    uniform float focus;
    uniform float band;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - focus);
      float b = smoothstep(band, band + 0.34, d) * amount;
      vec2 o1 = stepSize * 1.3846153846 * b;
      vec2 o2 = stepSize * 3.2307692308 * b;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
      gl_FragColor = c;
    }`,
}

// Grade, vignette, lightning flash and a little grain, in linear light before
// the tone mapping in OutputPass.
const Finish = {
  name: 'Finish',
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.45 },
    flash: { value: 0 },
    desat: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    time: { value: 0 },
    grain: { value: 0.025 },
    aspect: { value: 1 },
  },
  vertexShader: quadVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float flash;
    uniform float desat;
    uniform vec3 tint;
    uniform float time;
    uniform float grain;
    uniform float aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(l), desat);
      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = 1.0 - smoothstep(0.35, 1.25, length(q) * 1.15);
      col *= mix(1.0, v, vignette);
      col += flash * vec3(0.55, 0.62, 0.85);
      col += (hash(vUv * 731.0 + fract(time)) - 0.5) * grain * (0.25 + l);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
}

// A gradient sky that always sits behind everything.
function makeSky() {
  const material = new THREE.ShaderMaterial({
    name: 'Sky',
    uniforms: {
      top: { value: new THREE.Color('#8ec9ee') },
      bottom: { value: new THREE.Color('#f7e3bf') },
      below: { value: new THREE.Color('#a9c6d8') },
      flash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 below;
      uniform float flash;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        // above the horizon: horizon glow up to the sky; below it: falling away into the void
        vec3 c = y > 0.0 ? mix(bottom, top, smoothstep(0.0, 0.7, y)) : mix(bottom, below, smoothstep(-0.12, -0.85, y));
        c += flash * vec3(0.5, 0.58, 0.8) * smoothstep(-0.6, 0.6, y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), material)
  mesh.renderOrder = -100
  mesh.frustumCulled = false
  return mesh
}

export function guessQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const small = Math.min(screen.width, screen.height) < 700
  if (coarse || small) return 'medium'
  return 'high'
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const sky = makeSky()
  scene.add(sky)

  const hemi = new THREE.HemisphereLight('#d8ecff', '#6b8a4a', 1.7)
  const sun = new THREE.DirectionalLight('#fff0d6', 2.7)
  sun.castShadow = true
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = 2.5
  sun.shadow.mapSize.set(2048, 2048)
  scene.add(hemi, sun, sun.target)
  const sunOffset = new THREE.Vector3(-5.5, 12, 6.5)

  let width = 1
  let height = 1
  let camera = null
  let qualityName = 'high'
  let q = QUALITY.high
  let composer = null
  let passes = null

  function buildComposer() {
    composer?.dispose()
    composer = null
    passes = null
    if (!q.post || !camera) return
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa })
    composer = new EffectComposer(renderer, rt)
    const render = new RenderPass(scene, camera)
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.85, 0.55, 1.45)
    const tiltH = new ShaderPass(TiltShift)
    const tiltV = new ShaderPass(TiltShift)
    const finish = new ShaderPass(Finish)
    const output = new OutputPass()
    tiltH.enabled = tiltV.enabled = q.tilt
    composer.addPass(render)
    composer.addPass(bloom)
    composer.addPass(tiltH)
    composer.addPass(tiltV)
    composer.addPass(finish)
    composer.addPass(output)
    passes = { render, bloom, tiltH, tiltV, finish }
    sizeComposer()
  }

  function sizeComposer() {
    if (!composer) return
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
    const pr = renderer.getPixelRatio()
    passes.tiltH.uniforms.stepSize.value.set(1 / (width * pr), 0)
    passes.tiltV.uniforms.stepSize.value.set(0, 1 / (height * pr))
    passes.finish.uniforms.aspect.value = width / height
    // the blur is measured in pixels, so keep it the same size on a sharper screen
    passes.tiltH.uniforms.amount.value = passes.tiltV.uniforms.amount.value = 1.5 * pr
  }

  function setQuality(name) {
    qualityName = QUALITY[name] ? name : 'high'
    q = QUALITY[qualityName]
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr))
    renderer.setSize(width, height, false)
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    buildComposer()
  }

  // The mood the weather asks for this frame.
  const mood = {
    flash: 0,
    desat: 0,
    vignette: 0.45,
    tint: new THREE.Color(1, 1, 1),
    focus: 0.5,
  }

  // frame-rate watch for the automatic step down
  const watch = { avg: 16, time: 0, cooldown: 4, enabled: true }
  let onDowngrade = null

  const stage = {
    renderer,
    scene,
    sky,
    hemi,
    sun,
    mood,
    get quality() {
      return qualityName
    },
    get size() {
      return { width, height }
    },
    setQuality,
    onDowngrade(fn) {
      onDowngrade = fn
    },
    setCamera(cam) {
      camera = cam
      buildComposer()
    },
    resize(w, h) {
      width = Math.max(1, w)
      height = Math.max(1, h)
      renderer.setSize(width, height, false)
      sizeComposer()
    },
    // light and shadow box for a level: the sun sits up and to the left, so
    // shadows fall back and to the right where they read best
    frameLight(center, radius) {
      sun.target.position.copy(center)
      sun.position.copy(center).add(sunOffset)
      const cam = sun.shadow.camera
      cam.left = cam.bottom = -radius
      cam.right = cam.top = radius
      cam.near = 1
      cam.far = sunOffset.length() + radius * 2
      cam.updateProjectionMatrix()
    },
    watchFrames(dt, active) {
      if (!active || !watch.enabled || dt > 0.25) return
      watch.avg += (dt * 1000 - watch.avg) * 0.04
      watch.time += dt
      watch.cooldown -= dt
      if (watch.time < 3 || watch.cooldown > 0 || watch.avg < 25) return
      const at = QUALITY_ORDER.indexOf(qualityName)
      if (at <= 0) {
        watch.enabled = false
        return
      }
      setQuality(QUALITY_ORDER[at - 1])
      watch.cooldown = 5
      watch.avg = 16
      onDowngrade?.(qualityName)
    },
    render(time) {
      if (!camera) return
      sky.position.copy(camera.position)
      sky.material.uniforms.flash.value = mood.flash
      if (composer) {
        const f = passes.finish.uniforms
        f.flash.value = mood.flash * 0.6
        f.desat.value = mood.desat
        f.vignette.value = mood.vignette
        f.tint.value.copy(mood.tint)
        f.time.value = time
        passes.tiltH.uniforms.focus.value = passes.tiltV.uniforms.focus.value = mood.focus
        composer.render()
      } else {
        renderer.render(scene, camera)
      }
    },
  }
  return stage
}
