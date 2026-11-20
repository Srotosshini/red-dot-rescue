// Everything about one kitten that can be rebuilt from a single number: coat,
// eyes, proportions, voice, name and the lines on its adoption card. The trait
// (shy, greedy...) comes from the level, because traits are the puzzle.
import { makeRng } from '../core/rng.js'
import { strings } from '../strings.js'

// the kinds of kitten; their names, blurbs and tips are in strings.js
export const TRAITS = strings.traits

const COATS = {
  ginger: { base: '#e3893f', dark: '#b4592a', light: '#f5c38f', label: strings.kittens.coats.ginger },
  cream: { base: '#eccb98', dark: '#c99b62', light: '#f8e6c8', label: strings.kittens.coats.cream },
  grey: { base: '#8a94a1', dark: '#59616d', light: '#bcc4ce', label: strings.kittens.coats.grey },
  black: { base: '#2c2a31', dark: '#1a191e', light: '#4b4751', label: strings.kittens.coats.black },
  brown: { base: '#94704f', dark: '#5a3f2d', light: '#c9a37d', label: strings.kittens.coats.brown },
  white: { base: '#f1ede4', dark: '#d8d0c3', light: '#ffffff', label: strings.kittens.coats.white },
  chocolate: { base: '#6c4838', dark: '#452c22', light: '#94705a', label: strings.kittens.coats.chocolate },
  silver: { base: '#c2c6cc', dark: '#676c75', light: '#e5e8eb', label: strings.kittens.coats.silver },
}

const PATTERNS = [
  { id: 'solid', weight: 2, coats: ['ginger', 'cream', 'grey', 'black', 'white', 'chocolate'] },
  { id: 'tabby', weight: 4, coats: ['ginger', 'brown', 'grey', 'silver', 'cream'] },
  { id: 'tuxedo', weight: 2.2, coats: ['black', 'grey', 'chocolate'] },
  { id: 'calico', weight: 1.8, coats: ['white'] },
  { id: 'tortie', weight: 1.4, coats: ['black'] },
  { id: 'point', weight: 1.4, coats: ['cream'] },
  { id: 'bicolor', weight: 2.2, coats: ['ginger', 'grey', 'black', 'brown', 'cream'] },
  { id: 'spotted', weight: 1, coats: ['silver', 'brown', 'cream'] },
]

const EYES = [
  { label: strings.kittens.eyes[0], color: '#7ccc5c' },
  { label: strings.kittens.eyes[1], color: '#f2b13a' },
  { label: strings.kittens.eyes[2], color: '#e57a2c' },
  { label: strings.kittens.eyes[3], color: '#ffd545' },
  { label: strings.kittens.eyes[4], color: '#b8a64a' },
  { label: strings.kittens.eyes[5], color: '#5fb2f2' },
]

const NAMES = strings.kittens.names

const LOVES = strings.kittens.loves
const FEARS = strings.kittens.fears
const TALENTS = strings.kittens.talents

function weighted(rng, list) {
  const total = list.reduce((s, x) => s + x.weight, 0)
  let r = rng() * total
  for (const x of list) if ((r -= x.weight) <= 0) return x
  return list[list.length - 1]
}

export function makeGenome(seed, trait = 'plain', avoidNames = new Set()) {
  const rng = makeRng(seed)
  const pattern = weighted(rng, PATTERNS)
  const coatId = rng.pick(pattern.coats)
  const coat = COATS[coatId]
  let eyes = rng.pick(EYES)
  if (pattern.id === 'point') eyes = EYES[5] // colorpoints have blue eyes
  const oddEyed = coatId === 'white' && pattern.id === 'solid' && rng.chance(0.35)

  // colours each pattern paints with
  const colours = { base: coat.base, dark: coat.dark, light: coat.light, white: '#f4f0e8', patchA: '#dd8740', patchB: '#2c2a31' }
  let label = `${coat.label} ${pattern.id}`
  switch (pattern.id) {
    case 'solid':
      label = coat.label
      break
    case 'tabby':
      label = strings.kittens.patterns.tabby(coat.label)
      break
    case 'tuxedo':
      label = coatId === 'black' ? strings.kittens.patterns.tuxedo : strings.kittens.patterns.colouredTuxedo(coat.label)
      break
    case 'calico':
      label = strings.kittens.patterns.calico
      break
    case 'tortie':
      label = strings.kittens.patterns.tortie
      colours.base = '#2c2a31'
      break
    case 'point': {
      const seal = rng.chance(0.6)
      colours.points = seal ? '#5a4031' : '#6d7480'
      label = seal ? strings.kittens.patterns.seal : strings.kittens.patterns.blue
      break
    }
    case 'bicolor':
      label = strings.kittens.patterns.bicolor(coat.label)
      break
    case 'spotted':
      label = strings.kittens.patterns.spotted(coat.label)
      break
  }

  const darkCoat = ['black', 'grey', 'chocolate'].includes(coatId) || pattern.id === 'tortie'
  let name = rng.pick(NAMES)
  for (let k = 0; k < 20 && avoidNames.has(name); k++) name = rng.pick(NAMES)

  return {
    seed,
    trait,
    name,
    pattern: pattern.id,
    coat: coatId,
    label,
    colours,
    nose: darkCoat ? '#5b4047' : '#e88f96',
    innerEar: darkCoat ? '#a8737a' : '#f2a9ad',
    eyes: { label: oddEyed ? 'odd' : eyes.label, left: oddEyed ? EYES[5].color : eyes.color, right: oddEyed ? EYES[1].color : eyes.color },
    size: rng.range(0.92, 1.08),
    chonk: rng.range(0.94, 1.2),
    head: rng.range(0.95, 1.08),
    ears: rng.range(0.85, 1.2),
    tail: rng.range(0.85, 1.15),
    legs: rng.range(0.9, 1.1),
    pitch: rng.range(0.85, 1.25),
    noise: rng.int(1, 9999), // seed for coat patches
    loves: rng.pick(LOVES),
    fears: rng.pick(FEARS),
    talent: rng.pick(TALENTS),
  }
}

export function eyeLabel(g) {
  return g.eyes.label === 'odd' ? strings.kittens.oddEyes : g.eyes.label
}
