// Adoption cards. Each rescued kitten is stored as nothing but its seed, so
// its portrait is rebuilt and photographed on demand: same coat, same eyes,
// same name, sitting for its polaroid.
import * as THREE from 'three'
import { makeGenome, TRAITS } from '../game/genome.js'
import { strings } from '../strings.js'
import { buildKitten, poseKitten, portraitPose } from '../game/kitten-model.js'
import { makeRng } from '../core/rng.js'

const BACKDROPS = ['#f6d7c3', '#d3e6f6', '#e0f0d1', '#f3dcef', '#fff0bf', '#d9efe9', '#f8e2c8']

export function createPortraits(renderer) {
  const SIZE = 512
  const OUT = 256
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace })
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#fff6ec', '#b9a48f', 1.9))
  const key = new THREE.DirectionalLight('#fff1dd', 1.6)
  key.position.set(1.2, 2.2, 2.0)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#cfe2ff', 0.8)
  rim.position.set(-1.5, 1.2, -1.5)
  scene.add(rim)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }))
  scene.add(floor)
  const cam = new THREE.PerspectiveCamera(27, 1, 0.05, 20)
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const big = document.createElement('canvas')
  big.width = big.height = SIZE
  const bigCtx = big.getContext('2d')
  const small = document.createElement('canvas')
  small.width = small.height = OUT
  const smallCtx = small.getContext('2d')
  const cache = new Map()
  const queue = []
  let busy = false
  const clear = new THREE.Color()

  function shoot(seed, trait) {
    const g = makeGenome(seed, trait)
    const rig = buildKitten(g)
    poseKitten(rig, portraitPose(seed))
    const kitten = new THREE.Group()
    kitten.add(rig.mesh)
    kitten.scale.setScalar(g.size)
    const rng = makeRng(seed + 3)
    kitten.rotation.y = 0.25 + rng.range(-0.25, 0.35)
    scene.add(kitten)
    const bg = new THREE.Color(BACKDROPS[seed % BACKDROPS.length])
    floor.material.color.copy(bg).multiplyScalar(0.86)
    // frame the whole sitting kitten, ear tips included
    const h = 0.33 * g.size
    cam.position.set(0.52, h + 0.16, 1.5)
    cam.lookAt(0, h, 0)

    const prevTarget = renderer.getRenderTarget()
    renderer.getClearColor(clear)
    const prevAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(rt)
    renderer.setClearColor(bg, 1)
    renderer.clear()
    renderer.render(scene, cam)
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels)
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(clear, prevAlpha)

    scene.remove(kitten)
    rig.mesh.geometry.dispose()
    rig.eyesMesh.geometry.dispose()
    rig.mesh.skeleton.dispose()

    // WebGL reads bottom-up
    const img = bigCtx.createImageData(SIZE, SIZE)
    const row = SIZE * 4
    for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row)
    bigCtx.putImageData(img, 0, 0)
    smallCtx.imageSmoothingQuality = 'high'
    smallCtx.drawImage(big, 0, 0, OUT, OUT)
    return small.toDataURL('image/png')
  }

  function pump() {
    busy = true
    const job = queue.shift()
    if (!job) {
      busy = false
      return
    }
    try {
      const url = shoot(job.seed, job.trait)
      cache.set(job.key, url)
      job.resolve(url)
    } catch (error) {
      job.reject(error)
    }
    requestAnimationFrame(pump)
  }

  return {
    // a promise of the portrait's data URL, made one per frame so nothing stutters
    get(seed, trait) {
      const key = `${seed}:${trait}`
      if (cache.has(key)) return Promise.resolve(cache.get(key))
      const pending = queue.find((j) => j.key === key)
      if (pending) return pending.promise
      let resolve
      let reject
      const promise = new Promise((a, b) => {
        resolve = a
        reject = b
      })
      queue.push({ key, seed, trait, resolve, reject, promise })
      if (!busy) requestAnimationFrame(pump)
      return promise
    },
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// the card itself, as HTML, like the polaroids on the menu's corkboard: the
// photo is filled in when it is ready, the name is in marker underneath
export function polaroid(card, { tilt = 0, big = false } = {}) {
  const trait = TRAITS[card.trait] ?? TRAITS.plain
  return `<span class="polaroid${big ? ' big' : ''}" style="--tilt:${tilt.toFixed(1)}deg" data-seed="${card.seed}" data-trait="${esc(card.trait)}">
    <span class="photo"><img alt="${esc(strings.system.photo(card.name, card.label))}" /></span>
    <span class="caption"><b>${esc(card.name)}</b><small>${esc(card.label)} · ${esc(trait.name)}</small></span>
  </span>`
}

export function hydratePhotos(root, portraits) {
  for (const el of root.querySelectorAll('.polaroid[data-seed]')) {
    const img = el.querySelector('img')
    if (img.src) continue
    portraits
      .get(Number(el.dataset.seed), el.dataset.trait)
      .then((url) => {
        img.src = url
        el.classList.add('developed')
      })
      .catch(() => {})
  }
}
