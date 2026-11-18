// Everything about one kitten that can be rebuilt from a single number: coat,
// eyes, proportions, voice, name and the lines on its adoption card. The trait
// (shy, greedy...) comes from the level, because traits are the puzzle.
import { makeRng } from '../core/rng.js'

export const TRAITS = {
  plain: {
    name: 'Curious',
    blurb: 'Chases the dot wherever it goes.',
    tip: 'Curious kittens follow the dot. Lead them home.',
  },
  shy: {
    name: 'Shy',
    blurb: 'Keeps its distance and only creeps forward when the dot is far away.',
    tip: 'Shy kittens keep their distance. Shine the dot past them, then further on. Near the basket they walk in by themselves.',
  },
  greedy: {
    name: 'Greedy',
    blurb: 'Drops everything for food, including you.',
    tip: 'Greedy kittens run to any food they see. The bowl by the basket works on them too.',
  },
  chaotic: {
    name: 'Chaotic',
    blurb: 'Overshoots the dot and pounces at nothing.',
    tip: 'Chaotic kittens pounce past the dot. Give them room.',
  },
  sleepy: {
    name: 'Sleepy',
    blurb: 'Naps whenever the dot stops moving.',
    tip: 'Sleepy kittens nap when the dot stops. Wiggle the dot on one to wake it.',
  },
}

const COATS = {
  ginger: { base: '#e3893f', dark: '#b4592a', light: '#f5c38f', label: 'ginger' },
  cream: { base: '#eccb98', dark: '#c99b62', light: '#f8e6c8', label: 'cream' },
  grey: { base: '#8a94a1', dark: '#59616d', light: '#bcc4ce', label: 'grey' },
  black: { base: '#2c2a31', dark: '#1a191e', light: '#4b4751', label: 'black' },
  brown: { base: '#94704f', dark: '#5a3f2d', light: '#c9a37d', label: 'brown' },
  white: { base: '#f1ede4', dark: '#d8d0c3', light: '#ffffff', label: 'white' },
  chocolate: { base: '#6c4838', dark: '#452c22', light: '#94705a', label: 'chocolate' },
  silver: { base: '#c2c6cc', dark: '#676c75', light: '#e5e8eb', label: 'silver' },
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
  { label: 'green', color: '#7ccc5c' },
  { label: 'amber', color: '#f2b13a' },
  { label: 'copper', color: '#e57a2c' },
  { label: 'gold', color: '#ffd545' },
  { label: 'hazel', color: '#b8a64a' },
  { label: 'blue', color: '#5fb2f2' },
]

const NAMES = [
  'Mochi', 'Biscuit', 'Pepper', 'Noodle', 'Tofu', 'Pickle', 'Waffles', 'Bean', 'Sprout', 'Clementine',
  'Pumpkin', 'Dumpling', 'Miso', 'Olive', 'Marble', 'Socks', 'Pixel', 'Nugget', 'Juniper', 'Toast',
  'Button', 'Fig', 'Wasabi', 'Comet', 'Tater', 'Peanut', 'Sesame', 'Ziggy', 'Hazel', 'Pudding',
  'Basil', 'Maple', 'Ollie', 'Luna', 'Kiwi', 'Ravioli', 'Gnocchi', 'Bao', 'Crumpet', 'Muffin',
  'Scone', 'Toffee', 'Poppy', 'Chai', 'Cocoa', 'Taco', 'Pretzel', 'Sardine', 'Moth', 'Velcro',
  'Puddle', 'Bramble', 'Tinsel', 'Custard', 'Dorito', 'Gremlin', 'Pebble', 'Sock Puppet', 'Turnip', 'Wobble',
  'Lentil', 'Snickerdoodle', 'Admiral', 'Professor', 'Bug', 'Cricket', 'Pistachio', 'Kumquat', 'Mango', 'Radish',
  'Inkblot', 'Flapjack', 'Sushi', 'Tamale', 'Hiccup', 'Zucchini', 'Beans', 'Nacho', 'Plum', 'Rascal',
]

const LOVES = [
  'cardboard boxes', 'sunbeams', 'the sound of a can opening', 'yarn it is not allowed to have', 'bottle caps',
  'sitting on homework', 'warm laundry', 'the top of the fridge', 'paper bags', 'shoelaces', 'boxes too small for it',
  'chasing its own tail', 'being carried like a baby', 'crinkly wrappers', 'the bathroom tap', 'bread',
]
const FEARS = [
  'the vacuum', 'cucumbers', 'its own reflection', 'the doorbell', 'balloons', 'tin foil', 'Tuesdays',
  'the hairdryer', 'sneezes', 'an empty bowl', 'the blender', 'umbrellas opening',
]
const TALENTS = [
  'opening cupboards', 'knocking things off tables, precisely', 'loafing for hours', 'yelling at birds',
  'finding the one warm spot', 'fitting through tiny gaps', 'purring on command', 'stealing socks',
  'turning off laptops', 'fetching hair ties', 'sleeping in impossible positions', 'judging you silently',
]

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
      label = `${coat.label} tabby`
      break
    case 'tuxedo':
      label = coatId === 'black' ? 'tuxedo' : `${coat.label} tuxedo`
      break
    case 'calico':
      label = 'calico'
      break
    case 'tortie':
      label = 'tortoiseshell'
      colours.base = '#2c2a31'
      break
    case 'point': {
      const seal = rng.chance(0.6)
      colours.points = seal ? '#5a4031' : '#6d7480'
      label = seal ? 'seal colorpoint' : 'blue colorpoint'
      break
    }
    case 'bicolor':
      label = `${coat.label} and white`
      break
    case 'spotted':
      label = `spotted ${coat.label}`
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
  return g.eyes.label === 'odd' ? 'odd eyes, one blue and one amber' : `${g.eyes.label} eyes`
}
