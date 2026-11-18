// Progress, settings and the adoption-card collection, kept in this browser.
// Every read and write is guarded: private windows and blocked storage just
// mean nothing is remembered.
const KEY = 'red-dot-rescue/v1'

const blank = () => ({
  settings: { sound: true, music: true, quality: null },
  levels: {}, // id -> { stars, best }
  cards: [], // { seed, trait, name, label, level, at }
  seen: {}, // tips already shown
})

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank()
    const s = JSON.parse(raw)
    const b = blank()
    return {
      settings: { ...b.settings, ...(s.settings || {}) },
      levels: s.levels && typeof s.levels === 'object' ? s.levels : {},
      cards: Array.isArray(s.cards) ? s.cards.filter((c) => c && Number.isFinite(c.seed)) : [],
      seen: s.seen && typeof s.seen === 'object' ? s.seen : {},
    }
  } catch {
    return blank()
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // storage full or blocked: carry on without it
  }
}
