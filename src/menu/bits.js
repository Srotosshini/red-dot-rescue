// Small three.js helpers shared by the menu's set pieces.
import * as THREE from 'three'

export const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra })

// Paper keeps close to its own colour under the storm's dim light: it gives
// off a little of its texture as light (`glow`), so writing stays crisp.
export const PAPER_GLOW = 0.28
export const paper = (map, extra) => mat('#ffffff', { map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: PAPER_GLOW, ...extra })

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// invisible, generous shapes the pointer is tested against
const hitMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
export function hitMesh(geometry, id, view) {
  const m = new THREE.Mesh(geometry, hitMaterial)
  m.visible = false
  m.userData = { id, view }
  return m
}
