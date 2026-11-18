// Red Dot Rescue: boot, input, menus, the loop.
import { createStage, guessQuality } from './render/stage.js'
import { DioramaCamera } from './render/camera.js'
import { Sound } from './audio/sound.js'
import { Game } from './game/game.js'
import { createUI } from './ui/ui.js'
import { createPortraits } from './ui/cards.js'
import { loadSave, writeSave } from './ui/save.js'
import { LEVELS, DEMO } from './world/levels.js'

const canvas = document.querySelector('#game')
const root = document.querySelector('#ui')
const save = loadSave()
const persist = () => writeSave(save)

let stage
try {
  stage = createStage(canvas)
} catch (error) {
  console.error(error)
  root.innerHTML = '<p class="noscript">Red Dot Rescue needs WebGL, and this browser could not start it.</p>'
  throw error
}

const cam = new DioramaCamera()
cam.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
stage.setQuality(save.settings.quality ?? guessQuality())
stage.setCamera(cam.camera)
const sound = new Sound(save.settings)
const portraits = createPortraits(stage.renderer)

let game = null
const click = () => sound.ui('click')

function openLevel(id) {
  const L = LEVELS.find((l) => l.id === id) ?? LEVELS[0]
  game.load(L.id)
  const traits = [...new Set(L.kittens.map((k) => k.trait ?? 'plain'))]
  ui.intro(L, LEVELS.indexOf(L), traits)
  ui.show('intro')
}

function goTitle() {
  game.load(DEMO.level, { demo: true })
  ui.show('title')
}

const handlers = {
  play() {
    click()
    ui.show('levels')
  },
  cards() {
    click()
    ui.show('cards')
  },
  howto() {
    click()
    ui.show('howto')
  },
  title() {
    click()
    goTitle()
  },
  levels() {
    click()
    if (game.state !== 'demo') game.load(DEMO.level, { demo: true })
    ui.show('levels')
  },
  level(id) {
    click()
    openLevel(id)
  },
  start() {
    sound.ui('start')
    game.start()
    ui.show('play')
    canvas.focus({ preventScroll: true })
  },
  pause() {
    if (game.state !== 'playing') return
    click()
    game.pause()
    ui.show('pause')
  },
  resume() {
    click()
    game.resume()
    ui.show('play')
  },
  restart() {
    click()
    openLevel(game.def.id)
  },
  next() {
    click()
    if (game.nextId) openLevel(game.nextId)
  },
  toggle(key) {
    const s = save.settings
    if (key === 'sound') sound.setSound(!s.sound)
    if (key === 'music') sound.setMusic(!s.music)
    if (key === 'fancy') {
      s.quality = s.quality === 'low' ? guessQuality() : 'low'
      stage.setQuality(s.quality)
    }
    persist()
    click()
    ui.renderToggles()
  },
}

const ui = createUI(root, handlers, { portraits, save })
game = new Game({ stage, cam, sound, ui, save, saveNow: persist })
game.onResults = (r) => {
  ui.results(r)
  ui.show('results')
}
stage.onDowngrade((q) => ui.toast(q === 'low' ? 'Effects turned down to keep things smooth.' : 'Some effects turned down to keep things smooth.'))
// a handle for poking at things from the console while developing
if (import.meta.env.DEV) window.__rdr = { game, cam, stage, ui, sound, save }

// ---- input ------------------------------------------------------------------------------
// Mouse: hover is the laser, right or middle drag tilts the view, wheel zooms.
// Touch: one finger is the laser, two fingers orbit and pinch.
const touches = new Map()
let orbit = null
let pinch = null

function aim(x, y) {
  game.pointer.x = (x / innerWidth) * 2 - 1
  game.pointer.y = -(y / innerHeight) * 2 + 1
  game.pointer.active = true
  game.pointer.keyboard = false
  game.keys.clear()
  game.kdot = null
}

function twoFingers() {
  const [a, b] = [...touches.values()]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture?.(e.pointerId)
    if (touches.size >= 2) {
      game.pointer.active = false
      pinch = twoFingers()
    } else aim(e.clientX, e.clientY)
    return
  }
  if (e.button === 1 || e.button === 2) {
    orbit = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture?.(e.pointerId)
    e.preventDefault()
    return
  }
  aim(e.clientX, e.clientY)
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    if (!touches.has(e.pointerId)) return
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size >= 2 && pinch) {
      const now = twoFingers()
      cam.orbit(-(now.x - pinch.x) * 0.006, (now.y - pinch.y) * 0.005)
      if (pinch.d > 0 && now.d > 0) cam.zoomBy(pinch.d / now.d)
      pinch = now
    } else if (touches.size === 1) aim(e.clientX, e.clientY)
    return
  }
  if (orbit) {
    cam.orbit(-(e.clientX - orbit.x) * 0.005, (e.clientY - orbit.y) * 0.004)
    orbit = { x: e.clientX, y: e.clientY }
    return
  }
  aim(e.clientX, e.clientY)
})

const lift = (e) => {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    if (touches.size === 0) game.pointer.active = false
    return
  }
  if (orbit && (e.button === 1 || e.button === 2 || e.type === 'pointercancel')) orbit = null
}
canvas.addEventListener('pointerup', lift)
canvas.addEventListener('pointercancel', lift)
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !orbit) game.pointer.active = false
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    cam.zoomBy(e.deltaY > 0 ? 1.07 : 1 / 1.07)
  },
  { passive: false },
)

const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'fast', ShiftRight: 'fast',
}
addEventListener('keydown', (e) => {
  sound.unlock()
  if (e.key === 'Escape' || e.code === 'KeyP') {
    if (ui.detailOpen) ui.hideDetail()
    else if (ui.screen === 'play') handlers.pause()
    else if (ui.screen === 'pause') handlers.resume()
    return
  }
  if (ui.screen !== 'play') return
  const k = KEYS[e.code]
  if (k) {
    game.keys.add(k)
    if (k !== 'fast') {
      game.pointer.keyboard = true
      game.pointer.active = false
    }
    e.preventDefault()
  } else if (e.code === 'KeyQ') cam.orbit(0.14, 0)
  else if (e.code === 'KeyE') cam.orbit(-0.14, 0)
  else if (e.code === 'KeyR') cam.resetView()
})
addEventListener('keyup', (e) => {
  const k = KEYS[e.code]
  if (k) game.keys.delete(k)
})
addEventListener('blur', () => {
  game.keys.clear()
  if (game.state === 'playing') handlers.pause()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') handlers.pause()
})
// the first tap or key anywhere is allowed to start audio
addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true })

// ---- size and loop ------------------------------------------------------------------------
function resize() {
  stage.resize(innerWidth, innerHeight)
  cam.setAspect(innerWidth / innerHeight)
}
addEventListener('resize', resize)
resize()
goTitle()

let last = performance.now()
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
  last = now
  game.update(dt)
  game.frameUI(dt)
  stage.render(now / 1000)
  stage.watchFrames(dt, game.state === 'playing' || game.state === 'demo')
})
