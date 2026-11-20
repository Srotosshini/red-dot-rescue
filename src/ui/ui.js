// The HTML on top of the canvas: the level list, the start of a rescue, pause
// and results, the HUD and the little marks over kittens. It is drawn as
// paper and marker: off-white sheets turned a degree or two, handwriting for
// anything a person wrote, a typewriter mono for anything printed, and laser
// red only on what can be pressed. Every option is a real <button>. The main
// menu is not here: it is the 3D scratching post. All the words come from
// strings.js.
import { TRAITS } from '../game/genome.js'
import { LEVELS } from '../world/levels.js'
import { strings } from '../strings.js'
import { polaroid, hydratePhotos } from './cards.js'

const S = strings.screens
const svg = (body, view = '0 0 24 24') => `<svg viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`
// marks drawn as if in marker: round ends, no fills (apart from dots)
const pen = (d, w = 2.4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const STAR = 'M12 3.2l2.7 5.8 6.1.7-4.5 4.2 1.2 6.2L12 17l-5.5 3.1 1.2-6.2-4.5-4.2 6.1-.7z'
export const ICON = {
  star: svg(pen(STAR, 1.8)),
  starOn: svg(`<path d="${STAR}" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
  tick: svg(pen('M4.5 12.5l4.6 5 10.4-12', 2.8)),
  cross: svg(pen('M5.5 5.5l13 13M18.5 5.8L5.8 18.5', 2.8)),
  arrow: svg(pen('M3.5 12.5h14M12.5 6.5l6 6-6 6', 2.6)),
  heart: svg(pen('M12 20s-7-4.3-8.6-8.6C2.2 8.3 4.1 4.8 7.4 4.8c1.9 0 3.4 1 4.6 2.6 1.2-1.6 2.7-2.6 4.6-2.6 3.3 0 5.2 3.5 4 6.6C19 15.7 12 20 12 20z')),
  z: svg(pen('M5 9h6l-6 7h6M14 4h5l-5 6h5', 2.2)),
  bang: svg(`${pen('M12 3.5v11', 3)}<circle cx="12" cy="19.5" r="1.8" fill="currentColor"/>`),
  what: svg(`${pen('M8.5 8.5a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-1.9 1.4-1.9 2.9', 2.6)}<circle cx="12" cy="19.3" r="1.7" fill="currentColor"/>`),
  fish: svg(`${pen('M3 12c3-4.5 9-5.5 13-2l4-3v10l-4-3c-4 3.5-10 2.5-13-2z')}<circle cx="8" cy="11" r="1.1" fill="currentColor"/>`),
  sweat: svg(pen('M12 3.5c3 4.5 5 7.3 5 9.9a5 5 0 0 1-10 0c0-2.6 2-5.4 5-9.9z')),
  eye: svg(`${pen('M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12s-3.5 6.2-9.5 6.2S2.5 12 2.5 12z')}<circle cx="12" cy="12" r="2.8" fill="currentColor"/>`),
  note: svg(`${pen('M10 17.5V5.5l9-2v11')}<circle cx="7.5" cy="17.5" r="2.4" fill="currentColor"/><circle cx="16.5" cy="15" r="2.4" fill="currentColor"/>`),
}
// what a kitten's mood shows as over its head
const EMOTE = { heart: 'heart', z: 'z', '!': 'bang', '?': 'what', fish: 'fish', sweat: 'sweat', spark: 'bang', eye: 'eye', drop: 'sweat', note: 'note' }

const fmt = (s) => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const stars = (n, of = 3) => Array.from({ length: of }, (_, i) => `<span class="star${i < n ? ' on' : ''}">${i < n ? ICON.starOn : ICON.star}</span>`).join('')
// each sheet of paper sits turned a little, the same way every time
const tilt = (key) => {
  let h = 7
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 997
  const t = ((h % 7) - 3) * 0.7
  return `--tilt:${(t + (t >= 0 ? 0.8 : -0.8)).toFixed(1)}deg`
}

export function createUI(root, handlers, { portraits, save }) {
  root.innerHTML = /* html */ `
    <div class="hud" hidden>
      <div class="hud-top">
        <p class="tape count" style="${tilt('count')}"><b class="n">0/0</b> <span>${strings.hud.home}</span> <small class="need"></small></p>
        <div class="tape storm" role="timer" aria-label="${strings.hud.stormLabel}" style="${tilt('storm')}">
          <span class="label">${strings.hud.storm}</span>
          <span class="bar"><span class="fill"></span></span>
          <b class="time">0:00</b>
        </div>
        <button class="word pause" data-act="pause">${strings.hud.pause}</button>
      </div>
      <p class="tape wind" hidden><span class="arrow">${ICON.arrow}</span> <b>${strings.hud.gust}</b></p>
      <p class="note hint" role="status" aria-live="polite"></p>
    </div>
    <div class="labels" aria-hidden="true"></div>
    <div class="fx" aria-hidden="true"></div>
    <p class="sr-only announce" aria-live="polite"></p>

    <div class="menu-a11y sr-only"></div>

    <section class="screen dim" data-screen="levels" hidden>
      <div class="sheet wide" style="${tilt('levels')}">
        <h2>${S.levels.title}</h2>
        <ol class="rescues"></ol>
        <div class="actions"><button class="word" data-act="title">${S.levels.back}</button></div>
      </div>
    </section>

    <section class="screen side" data-screen="intro" hidden>
      <div class="sheet intro" style="${tilt('intro')}"></div>
    </section>

    <section class="screen dim" data-screen="pause" hidden>
      <div class="sheet small" style="${tilt('pause')}">
        <h2>${S.pause.title}</h2>
        <ul class="choices">
          <li><button class="word big" data-act="resume">${S.pause.resume}</button></li>
          <li><button class="word" data-act="restart">${S.pause.restart}</button></li>
          <li><button class="word" data-act="levels">${S.pause.levels}</button></li>
          <li><button class="word" data-act="title">${S.pause.menu}</button></li>
        </ul>
        <ul class="toggles"></ul>
        <p class="small-print">${S.pause.controls}</p>
      </div>
    </section>

    <section class="screen dim" data-screen="results" hidden>
      <div class="sheet wide results" style="${tilt('results')}"></div>
    </section>

    <div class="curtain" aria-hidden="true"></div>
  `

  const $ = (s) => root.querySelector(s)
  const screens = Object.fromEntries([...root.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el]))
  const hud = $('.hud')
  const labels = $('.labels')
  const fx = $('.fx')
  let current = null

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-level],[data-seed],[data-toggle]')
    if (!el || el.disabled) return
    if (el.dataset.toggle) return handlers.toggle?.(el.dataset.toggle)
    if (el.dataset.level) return handlers.level?.(el.dataset.level)
    if (el.dataset.seed) return
    handlers[el.dataset.act]?.()
  })

  // ---- HUD state, only touching the DOM when something changed
  const hudEls = {
    n: $('.count .n'),
    need: $('.count .need'),
    count: $('.count'),
    fill: $('.storm .fill'),
    time: $('.storm .time'),
    storm: $('.storm'),
    hint: $('.hint'),
    wind: $('.wind'),
    arrow: $('.wind .arrow'),
  }
  const last = {}
  let hintTimer = 0

  // ---- marks floating over kittens
  const pool = new Map()
  let tagEl = null

  const ui = {
    get screen() {
      return current
    },
    // 'menu' is the 3D scratching post: every HTML screen hides for it
    show(name) {
      current = name
      for (const [key, el] of Object.entries(screens)) el.hidden = key !== name
      hud.hidden = name !== 'play' && name !== 'pause'
      root.dataset.screen = name
      document.documentElement.dataset.screen = name
      if (name === 'levels') ui.renderLevels()
      if (name === 'pause') ui.renderToggles()
      const focus = screens[name]?.querySelector('.word.big, .rescue:not([disabled]), .word')
      if (focus && name !== 'play') requestAnimationFrame(() => focus.focus({ preventScroll: true }))
    },

    // the menu's buttons for screen readers live here, out of sight
    get menuLayer() {
      return root.querySelector('.menu-a11y')
    },
    // a fade through dark, to hide a scene change
    curtain(on) {
      root.querySelector('.curtain').classList.toggle('on', !!on)
    },

    // the same list as the settings tag on the menu's feather toy
    renderToggles() {
      const s = save.settings
      const row = (key, label, on) =>
        `<li><button type="button" class="toggle" data-toggle="${key}" aria-pressed="${on}"><span class="label">${label}</span><span class="mark">${on ? ICON.tick : ICON.cross}</span></button></li>`
      for (const el of root.querySelectorAll('.toggles'))
        el.innerHTML =
          row('sound', strings.settings.sound, s.sound) + row('music', strings.settings.music, s.music) + row('fancy', strings.settings.pretty, s.quality !== 'low')
    },

    renderLevels() {
      const list = root.querySelector('.rescues')
      list.innerHTML = LEVELS.map((L, i) => {
        const rec = save.levels[L.id]
        const open = i === 0 || (save.levels[LEVELS[i - 1].id]?.stars ?? 0) > 0
        const note = rec ? S.levels.best(rec.best, L.kittens.length) : open ? S.levels.count(L.kittens.length) : S.levels.locked
        return `<li><button type="button" class="rescue${open ? '' : ' locked'}" data-level="${L.id}" ${open ? '' : 'disabled'}>
          <span class="num">${i + 1}</span>
          <span class="name">${esc(L.name)}</span>
          <span class="idea">${esc(L.newIdea)}</span>
          <span class="stars">${stars(rec?.stars ?? 0)}</span>
          <span class="best">${esc(note)}</span>
        </button></li>`
      }).join('')
    },

    intro(L, index, traits) {
      const el = screens.intro.querySelector('.intro')
      el.innerHTML = `
        <p class="kicker">${S.intro.kicker(index + 1, LEVELS.length)}</p>
        <h2>${esc(L.name)}</h2>
        <p class="blurb">${esc(L.blurb)}</p>
        <ul class="traits">${traits.map((t) => `<li><b>${esc(TRAITS[t].name)}</b>: ${esc(TRAITS[t].blurb)}</li>`).join('')}</ul>
        <p class="goal">${esc(S.intro.goal(L.need, L.kittens.length, fmt(L.time)))}</p>
        <div class="actions"><button class="word big" data-act="start">${S.intro.start}</button><button class="word" data-act="levels">${S.intro.levels}</button></div>`
    },

    hud(s) {
      const count = `${s.rescued}/${s.total}`
      if (last.count !== count) {
        hudEls.n.textContent = count
        last.count = count
        hudEls.count.classList.remove('pop')
        void hudEls.count.offsetWidth
        hudEls.count.classList.add('pop')
      }
      const need = s.rescued >= s.need ? strings.hud.enough : strings.hud.need(s.need)
      if (last.need !== need) hudEls.need.textContent = last.need = need
      const time = fmt(s.left)
      if (last.time !== time) hudEls.time.textContent = last.time = time
      const p = Math.min(1, Math.max(0, s.storm))
      if (Math.abs((last.p ?? -1) - p) > 0.002) {
        hudEls.fill.style.transform = `scaleX(${(1 - p).toFixed(4)})`
        last.p = p
      }
      const urgent = s.left < 20
      if (last.urgent !== urgent) hudEls.storm.classList.toggle('urgent', (last.urgent = urgent))
      const warn = s.wind?.warn || s.wind?.gusting
      if (last.warn !== warn) {
        hudEls.wind.hidden = !warn
        last.warn = warn
      }
      if (warn) {
        hudEls.wind.classList.toggle('gusting', !!s.wind.gusting)
        hudEls.arrow.style.transform = `rotate(${s.windAngle.toFixed(1)}rad)`
      }
    },

    hint(text, ms = 5200) {
      clearTimeout(hintTimer)
      hudEls.hint.textContent = text
      hudEls.hint.classList.add('on')
      hintTimer = setTimeout(() => hudEls.hint.classList.remove('on'), ms)
    },
    clearHint() {
      clearTimeout(hintTimer)
      hudEls.hint.classList.remove('on')
    },
    announce(text) {
      root.querySelector('.announce').textContent = text
    },

    // [{ id, x, y, kind, z }] in CSS pixels
    labels(items, tag) {
      const seen = new Set()
      for (const it of items) {
        seen.add(it.id)
        let el = pool.get(it.id)
        if (!el) {
          el = document.createElement('span')
          el.className = 'emote'
          labels.append(el)
          pool.set(it.id, el)
        }
        if (el.dataset.kind !== it.kind) {
          el.dataset.kind = it.kind
          el.innerHTML = ICON[EMOTE[it.kind] ?? 'heart']
          el.classList.remove('in')
          void el.offsetWidth
          el.classList.add('in')
        }
        el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`
        el.hidden = false
      }
      for (const [id, el] of pool) if (!seen.has(id)) {
        el.hidden = true
        el.dataset.kind = ''
      }
      if (tag) {
        if (!tagEl) {
          tagEl = document.createElement('span')
          tagEl.className = 'nametag'
          labels.append(tagEl)
        }
        const html = `<b>${esc(tag.name)}</b><span>${esc(TRAITS[tag.trait].name)}</span>`
        if (tagEl.dataset.html !== html) {
          tagEl.innerHTML = html
          tagEl.dataset.html = html
        }
        tagEl.style.transform = `translate(${tag.x.toFixed(1)}px, ${tag.y.toFixed(1)}px)`
        tagEl.hidden = false
      } else if (tagEl) tagEl.hidden = true
    },
    clearLabels() {
      for (const el of pool.values()) el.remove()
      pool.clear()
      tagEl?.remove()
      tagEl = null
      fx.innerHTML = ''
    },

    floatText(text, x, y, cls = '') {
      const el = document.createElement('span')
      el.className = `float ${cls}`
      el.textContent = text
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      fx.append(el)
      setTimeout(() => el.remove(), 1700)
    },
    burst(x, y, n = 10) {
      for (let i = 0; i < n; i++) {
        const el = document.createElement('span')
        el.className = 'heart'
        el.innerHTML = ICON.heart
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
        const r = 50 + Math.random() * 60
        el.style.setProperty('--dx', `${(Math.cos(a) * r).toFixed(0)}px`)
        el.style.setProperty('--dy', `${(Math.sin(a) * r * 0.7 - 70).toFixed(0)}px`)
        el.style.setProperty('--rot', `${((Math.random() - 0.5) * 60).toFixed(0)}deg`)
        fx.append(el)
        setTimeout(() => el.remove(), 1600)
      }
    },
    ring(x, y) {
      const el = document.createElement('span')
      el.className = 'meow-ring'
      el.innerHTML = ICON.note
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      fx.append(el)
      setTimeout(() => el.remove(), 1400)
    },

    results(r) {
      const R = S.results
      const el = screens.results.querySelector('.results')
      const title = r.all ? R.allTitle : r.passed ? R.passTitle : R.failTitle
      const kicker = r.all ? R.allKicker : r.passed ? R.passKicker : R.failKicker
      const summary = R.rescued(r.rescued, r.total) + (r.left > 0.5 ? R.spare(fmt(r.left)) : '') + '.' + (r.passed ? '' : R.need(r.need)) + (r.unlocked ? ` ${R.unlocked}` : '')
      el.innerHTML = `
        <p class="kicker">${esc(kicker)}</p>
        <h2>${esc(title)}</h2>
        <div class="stars big">${stars(r.stars)}</div>
        <p class="summary">${esc(summary)}</p>
        ${r.cards.length ? `<p class="kicker">${esc(R.newCards)}</p><div class="deal">${r.cards.map((c, i) => polaroid(c, { tilt: ((i % 5) - 2) * 2.2 + 0.6 })).join('')}</div>` : `<p class="note-line">${esc(R.noCards)}</p>`}
        <div class="actions">
          ${r.next ? `<button class="word big" data-act="next">${R.next}</button>` : ''}
          <button class="word${r.next ? '' : ' big'}" data-act="restart">${r.passed ? R.again : R.retry}</button>
          <button class="word" data-act="levels">${R.levels}</button>
        </div>`
      el.querySelectorAll('.star').forEach((s, i) => (s.style.animationDelay = `${0.25 + i * 0.22}s`))
      el.querySelectorAll('.deal .polaroid').forEach((p, i) => (p.style.animationDelay = `${0.6 + i * 0.12}s`))
      hydratePhotos(el, portraits)
    },

    toast(text) {
      const el = document.createElement('p')
      el.className = 'toast tape'
      el.textContent = text
      root.append(el)
      setTimeout(() => el.remove(), 3500)
    },
  }
  return ui
}
