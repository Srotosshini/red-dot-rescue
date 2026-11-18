// The HTML on top of the canvas: menus, the HUD, little icons over kittens,
// and the adoption cards. Everything clickable is a real <button>.
import { TRAITS } from '../game/genome.js'
import { LEVELS } from '../world/levels.js'
import { polaroid, hydratePhotos, cardFacts } from './cards.js'

const svg = (body, view = '0 0 24 24') => `<svg viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`
export const ICON = {
  kitten: svg('<path d="M4 3l4 4.2h8L20 3v9.5c0 4.7-3.6 8.5-8 8.5s-8-3.8-8-8.5z" fill="currentColor"/><circle cx="9" cy="12.5" r="1.4" fill="#1c2233"/><circle cx="15" cy="12.5" r="1.4" fill="#1c2233"/><path d="M11 15.5h2l-1 1.2z" fill="#1c2233"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g>'),
  cloud: svg('<path d="M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4-1.6A4.8 4.8 0 0 0 7 18z" fill="currentColor"/><path d="M12.5 14l-2 4h2.2l-1.2 4 4-5.5h-2.4l1.4-2.5z" fill="#ffd34d"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  music: svg('<path d="M9 18.5V6l10-2v12.5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6.5" cy="18.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="16.5" r="2.5" fill="currentColor"/>'),
  sparkle: svg('<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="currentColor"/>'),
  star: svg('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" stroke-width="2.2" fill="none"/>'),
  arrow: svg('<path d="M4 12h13M12 6l6 6-6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  heart: svg('<path d="M12 21s-7.5-4.6-9.3-9.2C1.4 8.4 3.5 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.7 0 5.8 3.9 4.5 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/>'),
  z: svg('<text x="3" y="17" font-size="13" font-weight="900" fill="currentColor" font-family="system-ui">Z</text><text x="13" y="11" font-size="9" font-weight="900" fill="currentColor" font-family="system-ui">z</text>'),
  bang: svg('<rect x="10" y="3" width="4" height="12" rx="2" fill="currentColor"/><circle cx="12" cy="19.5" r="2.2" fill="currentColor"/>'),
  what: svg('<path d="M8.5 8.5a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-1.9 1.4-1.9 2.9" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="19.3" r="1.8" fill="currentColor"/>'),
  fish: svg('<path d="M3 12c3-4.5 9-5.5 13-2l4-3v10l-4-3c-4 3.5-10 2.5-13-2z" fill="currentColor"/><circle cx="8" cy="11" r="1.1" fill="#1c2233"/>'),
  sweat: svg('<path d="M12 3c3 4.5 5 7.4 5 10a5 5 0 0 1-10 0c0-2.6 2-5.5 5-10z" fill="currentColor"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="currentColor"/><circle cx="12" cy="12" r="3.2" fill="#1c2233"/>'),
  note: svg('<path d="M10 17.5V5.5l9-2v11" stroke="currentColor" stroke-width="2.2" fill="none"/><circle cx="7.5" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16.5" cy="15" r="2.6" fill="currentColor"/>'),
  paw: svg('<ellipse cx="12" cy="16" rx="5" ry="4" fill="currentColor"/><circle cx="6" cy="10" r="2.1" fill="currentColor"/><circle cx="10" cy="6.5" r="2.1" fill="currentColor"/><circle cx="14" cy="6.5" r="2.1" fill="currentColor"/><circle cx="18" cy="10" r="2.1" fill="currentColor"/>'),
  bolt: svg('<path d="M13 2L5 14h5.5L9 22l9-12.5h-5.6z" fill="currentColor"/>'),
}
const TRAIT_ICON = { plain: 'paw', shy: 'sweat', greedy: 'fish', chaotic: 'bolt', sleepy: 'z' }
const EMOTE_ICON = { heart: 'heart', z: 'z', '!': 'bang', '?': 'what', fish: 'fish', sweat: 'sweat', spark: 'sparkle', eye: 'eye', drop: 'sweat', note: 'note' }

const fmt = (s) => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const stars = (n, of = 3) => Array.from({ length: of }, (_, i) => `<span class="star${i < n ? ' on' : ''}">${ICON.star}</span>`).join('')

export function createUI(root, handlers, { portraits, save }) {
  root.innerHTML = /* html */ `
    <div class="hud" hidden>
      <div class="hud-top">
        <div class="chip count"><span class="i">${ICON.kitten}</span><b class="n">0/0</b><small class="need"></small></div>
        <div class="storm" role="timer" aria-label="Time until the storm hits">
          <span class="i sun">${ICON.sun}</span>
          <div class="bar"><div class="fill"></div><span class="cloud">${ICON.cloud}</span></div>
          <b class="time">0:00</b>
        </div>
        <button class="round" data-act="pause" aria-label="Pause">${ICON.pause}</button>
      </div>
      <div class="wind" hidden><span class="arrow">${ICON.arrow}</span><b>Gust!</b></div>
      <p class="hint" role="status" aria-live="polite"></p>
    </div>
    <div class="labels" aria-hidden="true"></div>
    <div class="fx" aria-hidden="true"></div>
    <p class="sr-only announce" aria-live="polite"></p>

    <section class="screen title" data-screen="title" hidden>
      <div class="logo">
        <h1>Red <span class="dotword">D<i class="the-dot"></i>t</span> Rescue</h1>
        <p>A storm is coming and the kittens are still outside. You are the laser pointer.</p>
      </div>
      <nav class="menu">
        <button class="btn primary" data-act="play">Play</button>
        <button class="btn" data-act="cards">Adoption cards <span class="badge card-count">0</span></button>
        <button class="btn" data-act="howto">How to play</button>
      </nav>
      <div class="toggles"></div>
      <p class="tease">Move your pointer. They are already watching.</p>
    </section>

    <section class="screen sheet" data-screen="levels" hidden>
      <div class="panel wide">
        <h2>Choose a rescue</h2>
        <div class="level-grid"></div>
        <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
      </div>
    </section>

    <section class="screen sheet side" data-screen="intro" hidden>
      <div class="panel intro"></div>
    </section>

    <section class="screen sheet" data-screen="pause" hidden>
      <div class="panel small">
        <h2>Paused</h2>
        <nav class="menu">
          <button class="btn primary" data-act="resume">Keep going</button>
          <button class="btn" data-act="restart">Restart this rescue</button>
          <button class="btn" data-act="levels">Choose another rescue</button>
          <button class="btn ghost" data-act="title">Title screen</button>
        </nav>
        <div class="toggles"></div>
      </div>
    </section>

    <section class="screen sheet" data-screen="results" hidden>
      <div class="panel wide results"></div>
    </section>

    <section class="screen sheet" data-screen="cards" hidden>
      <div class="panel wide tall">
        <h2>Adoption cards</h2>
        <p class="sub">Every kitten you bring home gets a card. Each rescue rolls brand-new kittens, so no two albums match.</p>
        <div class="album"></div>
        <div class="row"><button class="btn ghost" data-act="back">Back</button></div>
      </div>
      <div class="detail" hidden></div>
    </section>

    <section class="screen sheet" data-screen="howto" hidden>
      <div class="panel">
        <h2>How to play</h2>
        <ol class="steps">
          <li><span class="i red">${ICON.sparkle}</span><div><b>You are the laser pointer.</b> Move the mouse (or drag a finger) and the red dot follows. Kittens chase it.</div></li>
          <li><span class="i">${ICON.heart}</span><div><b>Lead them into the basket</b> before the storm arrives. The storm meter at the top counts down.</div></li>
          <li><span class="i">${ICON.paw}</span><div><b>Every kitten has a personality.</b> Shy ones keep their distance, greedy ones run for food, chaotic ones overshoot, sleepy ones nap when the dot stops.</div></li>
          <li><span class="i">${ICON.what}</span><div><b>Boxes are irresistible.</b> Hold the dot on a box to call a kitten out. Wiggle the dot on a kitten to wake it or snap it out of a daze.</div></li>
          <li><span class="i">${ICON.note}</span><div><b>Listen.</b> Hidden kittens meow, louder the closer the dot gets. Sound on, please.</div></li>
          <li><span class="i">${ICON.eye}</span><div><b>Look around:</b> right-drag or two fingers to tilt the view, the wheel or a pinch to zoom, Q and E to turn. Arrow keys move the dot, Escape pauses.</div></li>
        </ol>
        <div class="row"><button class="btn primary" data-act="back">Got it</button></div>
      </div>
    </section>
  `

  const $ = (s) => root.querySelector(s)
  const screens = Object.fromEntries([...root.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el]))
  const hud = $('.hud')
  const labels = $('.labels')
  const fx = $('.fx')
  let current = null
  let previous = 'title'

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-level],[data-seed],[data-toggle]')
    if (!el || el.disabled) return
    if (el.dataset.toggle) return handlers.toggle?.(el.dataset.toggle)
    if (el.dataset.level) return handlers.level?.(el.dataset.level)
    if (el.dataset.seed && el.closest('.album')) return ui.showDetail(Number(el.dataset.seed), el.dataset.trait)
    if (el.dataset.seed) return
    const act = el.dataset.act
    if (act === 'back') return ui.show(previous)
    if (act === 'close-detail') return ui.hideDetail()
    handlers[act]?.()
  })

  // ---- HUD state, only touching the DOM when something changed
  const hudEls = {
    n: $('.count .n'),
    need: $('.count .need'),
    count: $('.count'),
    fill: $('.storm .fill'),
    cloud: $('.storm .cloud'),
    time: $('.storm .time'),
    storm: $('.storm'),
    hint: $('.hint'),
    wind: $('.wind'),
    arrow: $('.wind .arrow'),
  }
  const last = {}
  let hintTimer = 0

  // ---- floating icons over kittens
  const pool = new Map()
  let tagEl = null

  const ui = {
    get screen() {
      return current
    },
    show(name) {
      if (current && current !== name && name !== 'cards' && name !== 'howto') previous = current
      if (name === 'cards' || name === 'howto') previous = current && current !== 'cards' && current !== 'howto' ? current : previous
      current = name
      for (const [key, el] of Object.entries(screens)) el.hidden = key !== name
      hud.hidden = name !== 'play' && name !== 'pause'
      root.dataset.screen = name
      document.documentElement.dataset.screen = name
      if (name === 'title') root.querySelector('.card-count').textContent = String(save.cards.length)
      if (name === 'levels') ui.renderLevels()
      if (name === 'cards') ui.renderAlbum()
      if (name === 'pause' || name === 'title') ui.renderToggles()
      const focus = screens[name]?.querySelector('.btn.primary, .btn, .level-card:not([disabled])')
      if (focus && name !== 'play') requestAnimationFrame(() => focus.focus({ preventScroll: true }))
    },

    renderToggles() {
      const s = save.settings
      const t = (key, icon, label, on) =>
        `<button type="button" class="toggle" data-toggle="${key}" aria-pressed="${on}"><span class="i">${icon}</span>${label}</button>`
      for (const el of root.querySelectorAll('.toggles'))
        el.innerHTML = t('sound', ICON.sound, 'Sound', s.sound) + t('music', ICON.music, 'Music', s.music) + t('fancy', ICON.sparkle, 'Fancy effects', s.quality !== 'low')
    },

    renderLevels() {
      const grid = root.querySelector('.level-grid')
      grid.innerHTML = LEVELS.map((L, i) => {
        const rec = save.levels[L.id]
        const unlocked = i === 0 || (save.levels[LEVELS[i - 1].id]?.stars ?? 0) > 0
        return `<button type="button" class="level-card${unlocked ? '' : ' locked'}" data-level="${L.id}" ${unlocked ? '' : 'disabled'}>
          <span class="num">${i + 1}</span>
          <b>${esc(L.name)}</b>
          <span class="blurb">${esc(L.newIdea)}</span>
          <span class="stars">${stars(rec?.stars ?? 0)}</span>
          <span class="best">${rec ? `best: ${rec.best} of ${L.kittens.length} home` : unlocked ? `${L.kittens.length} kittens` : 'finish the last rescue to unlock'}</span>
          ${unlocked ? '' : `<span class="lock">${ICON.lock}</span>`}
        </button>`
      }).join('')
    },

    intro(L, index, traits) {
      const el = screens.intro.querySelector('.intro')
      el.innerHTML = `
        <p class="kicker">Rescue ${index + 1} of ${LEVELS.length}</p>
        <h2>${esc(L.name)}</h2>
        <p class="blurb">${esc(L.blurb)}</p>
        <ul class="traits">${traits
          .map((t) => `<li><span class="i t-${t}">${ICON[TRAIT_ICON[t]]}</span><div><b>${TRAITS[t].name}</b> ${esc(TRAITS[t].blurb)}</div></li>`)
          .join('')}</ul>
        <p class="goal">Bring at least <b>${L.need}</b> of <b>${L.kittens.length}</b> kittens home in <b>${fmt(L.time)}</b>.</p>
        <div class="row"><button class="btn primary" data-act="start">Start the rescue</button><button class="btn ghost" data-act="levels">Levels</button></div>`
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
      const need = s.rescued >= s.need ? 'enough to pass' : `need ${s.need}`
      if (last.need !== need) hudEls.need.textContent = last.need = need
      const time = fmt(s.left)
      if (last.time !== time) hudEls.time.textContent = last.time = time
      const p = Math.min(1, Math.max(0, s.storm))
      if (Math.abs((last.p ?? -1) - p) > 0.002) {
        hudEls.fill.style.transform = `scaleX(${(1 - p).toFixed(4)})`
        hudEls.cloud.style.left = `${((1 - p) * 100).toFixed(2)}%`
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
          el.innerHTML = ICON[EMOTE_ICON[it.kind] ?? 'heart']
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
        const html = `<b>${esc(tag.name)}</b><span class="t-${tag.trait}">${ICON[TRAIT_ICON[tag.trait]]}${TRAITS[tag.trait].name}</span>`
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
      const el = screens.results.querySelector('.results')
      const title = r.all ? 'Everyone is home!' : r.passed ? 'Home and dry' : 'The storm hit'
      const kicker = r.all ? 'Purrfect rescue' : r.passed ? 'Rescue complete' : 'Not enough kittens home'
      const spare = r.left > 0.5 ? ` with ${fmt(r.left)} to spare` : ''
      el.innerHTML = `
        <p class="kicker">${kicker}</p>
        <h2>${title}</h2>
        <div class="stars big">${stars(r.stars)}</div>
        <p class="summary"><b>${r.rescued}</b> of ${r.total} kittens rescued${spare}.${r.passed ? '' : ` You need ${r.need} to pass.`}${r.unlocked ? ' <b>New rescue unlocked.</b>' : ''}</p>
        ${r.cards.length ? `<p class="sub">New adoption cards</p><div class="deal">${r.cards.map((c, i) => polaroid(c, { tilt: ((i % 5) - 2) * 2.5 })).join('')}</div>` : '<p class="sub">No kittens made it this time, so no cards. They are waiting for you.</p>'}
        <div class="row">
          ${r.next ? '<button class="btn primary" data-act="next">Next rescue</button>' : ''}
          <button class="btn${r.next ? '' : ' primary'}" data-act="restart">${r.passed ? 'Play again' : 'Try again'}</button>
          <button class="btn ghost" data-act="levels">Levels</button>
        </div>`
      el.querySelectorAll('.star').forEach((s, i) => (s.style.animationDelay = `${0.25 + i * 0.22}s`))
      el.querySelectorAll('.deal .polaroid').forEach((p, i) => (p.style.animationDelay = `${0.6 + i * 0.12}s`))
      hydratePhotos(el, portraits)
    },

    renderAlbum() {
      const album = screens.cards.querySelector('.album')
      if (!save.cards.length) {
        album.innerHTML = '<p class="empty">No cards yet. Bring a kitten home and its polaroid lands here.</p>'
        return
      }
      album.innerHTML = save.cards
        .slice()
        .reverse()
        .map((c, i) => polaroid(c, { tilt: ((i * 7) % 5) - 2 }))
        .join('')
      hydratePhotos(album, portraits)
    },
    showDetail(seed, trait) {
      const card = save.cards.find((c) => c.seed === seed && c.trait === trait)
      if (!card) return
      const d = screens.cards.querySelector('.detail')
      d.innerHTML = `<div class="detail-card" role="dialog" aria-label="${esc(card.name)}">
        ${polaroid(card, { tilt: -2, big: true })}
        <dl>${cardFacts(card, LEVELS).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <button class="btn primary" data-act="close-detail">Close</button>
      </div>`
      d.hidden = false
      hydratePhotos(d, portraits)
      d.querySelector('.btn').focus({ preventScroll: true })
    },
    hideDetail() {
      screens.cards.querySelector('.detail').hidden = true
    },
    get detailOpen() {
      return !screens.cards.querySelector('.detail').hidden
    },
    toast(text) {
      const el = document.createElement('p')
      el.className = 'toast'
      el.textContent = text
      root.append(el)
      setTimeout(() => el.remove(), 3500)
    },
  }
  return ui
}
