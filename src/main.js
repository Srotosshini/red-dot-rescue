// Red Dot Rescue: boot, input, menus, the loop.
// the two hands: marker handwriting and a typewriter mono, served with the game
import '@fontsource/gochi-hand/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import { createStage, guessQuality } from './render/stage.js'
import { DioramaCamera } from './render/camera.js'
import { Sound } from './audio/sound.js'
import { Game } from './game/game.js'
import { createUI } from './ui/ui.js'
import { createPortraits } from './ui/cards.js'
import { loadSave, writeSave } from './ui/save.js'
import { LEVELS, DEMO } from './world/levels.js'
import { Menu } from './menu/menu.js'
import { fontsReady } from './menu/paper.js'
import { strings } from './strings.js'

const canvas = document.querySelector('#game')
const root = document.querySelector('#ui')
const save = loadSave()
const persist = () => writeSave(save)
// index.html carries copies of these for browsers without JavaScript
document.title = strings.title
canvas.setAttribute('aria-label', strings.system.canvas)

let stage
try {
  stage = createStage(canvas)
} catch (error) {
  console.error(error)
  root.innerHTML = `<p class="noscript">${strings.system.noWebgl}</p>`
  throw error
}

const cam = new DioramaCamera()
cam.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
stage.setQuality(save.settings.quality ?? guessQuality())
stage.setCamera(cam.camera)
const sound = new Sound(save.settings)
const portraits = createPortraits(stage.renderer)

let game = null
let menu = null
const click = () => sound.ui('click')

function openLevel(id) {
  const L = LEVELS.find((l) => l.id === id) ?? LEVELS[0]
  game.load(L.id)
  const traits = [...new Set(L.kittens.map((k) => k.trait ?? 'plain'))]
  ui.intro(L, LEVELS.indexOf(L), traits)
  ui.show('intro')
}

// the backyard with the scratching post in it
function goMenu() {
  game.load(DEMO.level, { menu: true })
  menu.enter()
  ui.show('menu')
}

// a quick fade through dark around a scene change
let fading = false
function fade(change) {
  if (fading) return
  if (cam.reduced) return change()
  fading = true
  ui.curtain(true)
  setTimeout(() => {
    change()
    fading = false
    reveal()
  }, 280)
}
// lift the curtain once the new scene has had a frame to draw
const reveal = () => setTimeout(() => ui.curtain(false), 60)

const handlers = {
  title() {
    click()
    fade(goMenu)
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
menu = new Menu({
  stage,
  sound,
  save,
  persist,
  ui,
  portraits,
  gameCamera: cam.camera,
  getGrid: () => game.grid,
  // after the dive into the box: straight into the first rescue on a first
  // visit, the level list once any rescue has been passed
  onPlay() {
    const fresh = !LEVELS.some((L) => (save.levels[L.id]?.stars ?? 0) > 0)
    menu.exit()
    if (fresh) openLevel(LEVELS[0].id)
    else {
      game.load(DEMO.level, { demo: true })
      ui.show('levels')
    }
    reveal()
  },
  onToggle: (key) => handlers.toggle(key),
})
menu.reduced = cam.reduced
// paper drawn before the handwriting font arrived gets drawn again
fontsReady.then(() => menu.set?.redrawPaper())
stage.onDowngrade((q) => ui.toast(q === 'low' ? strings.system.effectsLow : strings.system.effectsSome))
// a handle for poking at things from the console while developing
if (import.meta.env.DEV) window.__rdr = { game, cam, stage, ui, sound, save, menu }

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
  if (menu.active) {
    if (e.button === 0) menu.press(e.clientX, e.clientY, e.pointerType)
    return
  }
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
  if (menu.active) {
    // a finger only aims when it taps; a mouse aims as it moves
    if (e.pointerType !== 'touch') menu.aim(e.clientX, e.clientY, e.pointerType)
    return
  }
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
  if (menu.active) {
    if (e.type === 'pointerup') menu.release(e.clientX, e.clientY, e.pointerType)
    return
  }
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
  if (menu.active) return menu.leave()
  if (e.pointerType === 'mouse' && !orbit) game.pointer.active = false
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    if (!menu.active) cam.zoomBy(e.deltaY > 0 ? 1.07 : 1 / 1.07)
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
  if (menu.active) {
    if (menu.key(e)) e.preventDefault()
    return
  }
  if (e.key === 'Escape' || e.code === 'KeyP') {
    if (ui.screen === 'play') handlers.pause()
    else if (ui.screen === 'pause') handlers.resume()
    else if (ui.screen === 'levels' && e.key === 'Escape') handlers.title()
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
  // a hidden page can report a 0 by 0 window
  const aspect = innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : 1
  cam.setAspect(aspect)
  menu.setAspect(aspect)
}
addEventListener('resize', resize)
resize()
goMenu()

let last = performance.now()
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
  last = now
  game.update(dt)
  if (menu.active) menu.update(dt)
  else game.frameUI(dt)
  stage.render(now / 1000)
  stage.watchFrames(dt, menu.active || game.state === 'playing' || game.state === 'demo')
})
