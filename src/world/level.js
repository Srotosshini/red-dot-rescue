// Turns a level description into a nav grid and the static scenery.
import * as THREE from 'three'
import { Grid, F_WALL, F_HOLE, F_WATER } from './grid.js'
import { buildStatic } from './props.js'
import { THEMES } from './levels.js'

const PLATFORMS = new Set(['deck', 'porch', 'roof', 'walkway', 'pallet', 'bridge', 'ledge', 'skylight', 'ac', 'counter', 'island', 'table', 'chair', 'stool'])
const RAMPS = new Set(['plank', 'stairs'])
const WALLS = new Set([
  'fence', 'hedge', 'house', 'doghouse', 'trunk', 'parapet', 'chimney', 'tank', 'backwall', 'partition',
  'fridge', 'washer', 'tunnel', 'rail', 'rubble', 'shelter', 'post', 'barrow',
])

function paint(grid, s) {
  const k = s.k
  if (PLATFORMS.has(k)) {
    s.base = Math.max(-6, grid.heightAt(s.x, s.z))
    grid.each(s, (i) => {
      grid.h[i] = s.h
      grid.top[i] = s.h
      grid.flags[i] &= ~(F_HOLE | F_WATER)
    })
  } else if (RAMPS.has(k)) {
    const x0 = s.x - s.w / 2
    const z0 = s.z - s.d / 2
    grid.each(s, (i, x, z) => {
      const t = s.axis === 'x' ? (x - x0) / s.w : (z - z0) / s.d
      const h = s.from + (s.to - s.from) * t
      grid.h[i] = h
      grid.top[i] = h
      grid.flags[i] &= ~(F_HOLE | F_WATER)
    })
  } else if (WALLS.has(k)) {
    s.base = grid.heightAt(s.x, s.z)
    grid.each(s, (i) => {
      grid.flags[i] |= F_WALL
      grid.top[i] = Number.isFinite(grid.top[i]) ? Math.max(grid.top[i], s.h) : s.h
    })
  } else if (k === 'puddle' || k === 'spill') {
    s.base = grid.heightAt(s.x, s.z)
    grid.each(s, (i) => (grid.flags[i] |= F_WATER))
  } else if (k === 'gap') {
    grid.each(s, (i) => {
      grid.flags[i] |= F_HOLE
      grid.h[i] = -3
      grid.top[i] = -Infinity
    })
  } else if (k === 'channel') {
    grid.each(s, (i) => {
      grid.flags[i] |= F_WATER
      grid.h[i] = s.h
      grid.top[i] = s.h + 0.15
    })
  }
}

export function buildLevel(def, rand) {
  const theme = THEMES[def.theme]
  const [W, D] = def.size
  const grid = new Grid(W, D)
  if (def.ground === 'void') {
    grid.h.fill(-3)
    grid.top.fill(-Infinity)
    grid.flags.fill(F_HOLE)
  }
  // work on copies: painting records each shape's base height on it
  const shapes = def.shapes.map((s) => ({ ...s }))
  for (const s of shapes) paint(grid, s)

  // hiding places you cannot walk through
  for (const h of def.hideouts ?? []) {
    if (h.solid === false) continue
    grid.each({ x: h.at[0], z: h.at[1], r: h.r }, (i) => {
      grid.flags[i] |= F_WALL
      grid.top[i] = Math.max(grid.top[i], grid.h[i] + h.r * 1.4)
    })
  }

  let maxTop = -Infinity
  let minTop = Infinity
  for (let i = 0; i < grid.n; i++) {
    const t = grid.top[i]
    if (!Number.isFinite(t)) continue
    if (t > maxTop) maxTop = t
    if (t < minTop) minTop = t
  }
  grid.maxTop = Number.isFinite(maxTop) ? maxTop : 1
  grid.minTop = Number.isFinite(minTop) ? minTop : 0
  if (def.wind) grid.computeShelter(def.wind.dir[0], def.wind.dir[1])

  const built = buildStatic({ ...def, shapes }, grid, theme, rand)
  const group = built.group
  for (const L of built.lights) {
    const light = new THREE.PointLight(L.color, L.intensity, L.distance, 2)
    light.position.set(L.x, L.y, L.z)
    group.add(light)
  }

  // what the camera has to keep in shot
  const bounds = new THREE.Box3(new THREE.Vector3(-W / 2, def.ground === 'void' ? -0.6 : -0.45, -D / 2), new THREE.Vector3(W / 2, Math.min(1.6, grid.maxTop), D / 2))
  return { def, theme, grid, group, bounds, shapes }
}
