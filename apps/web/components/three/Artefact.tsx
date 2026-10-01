import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  TorusGeometry,
  Vector3,
} from 'three'
import {
  ARTEFACT_CENTRE,
  ARTEFACT_DETAIL,
  GLOW_OPACITY,
  GLOW_SCALE,
  RINGS,
  displaceShell,
} from '@/lib/assembly/artefact'

/**
 * The hero artefact — journey spec § 3.1, decision D1. A displaced
 * icosahedron shell, an additive inner glow, a point light at its heart and
 * two gyroscopic rings. Procedural: no asset, no loader. Sits at the
 * monolith's centre of mass in model units; the scene scales it by the
 * formation's unit so it keeps its proportion to the cubes.
 *
 * Imports three; only ever loaded through `AssemblyCanvas`.
 */

export interface Artefact {
  readonly group: Group
  readonly glowMaterial: MeshBasicMaterial
  /** Advances the rings and the glow pulse. */
  tick(time: number): void
  dispose(): void
}

const VIOLET = new Color('#7C3AED')
const CYAN = new Color('#22D3EE')

export function createArtefact(): Artefact {
  const group = new Group()
  group.position.set(ARTEFACT_CENTRE[0], ARTEFACT_CENTRE[1], ARTEFACT_CENTRE[2])

  // Shell: every face flat, so the facets catch the key and rim lights.
  const unit = new IcosahedronGeometry(1, ARTEFACT_DETAIL).toNonIndexed()
  const displaced = displaceShell(unit.getAttribute('position').array)
  unit.setAttribute('position', new BufferAttribute(displaced, 3))
  unit.computeVertexNormals()
  const shellMaterial = new MeshStandardMaterial({ color: '#c9b8ff', metalness: 0.7, roughness: 0.28, flatShading: true })
  const shell = new Mesh(unit, shellMaterial)
  group.add(shell)

  // Inner glow: additive, vertex colours violet at the bottom to cyan at the top.
  const glowGeometry = new IcosahedronGeometry(GLOW_SCALE * 0.42, 1)
  const positions = glowGeometry.getAttribute('position')
  const colours = new Float32Array(positions.count * 3)
  const tmp = new Color()
  for (let i = 0; i < positions.count; i += 1) {
    const t = (positions.getY(i) / (GLOW_SCALE * 0.42) + 1) / 2
    tmp.copy(VIOLET).lerp(CYAN, t)
    colours[i * 3] = tmp.r
    colours[i * 3 + 1] = tmp.g
    colours[i * 3 + 2] = tmp.b
  }
  glowGeometry.setAttribute('color', new BufferAttribute(colours, 3))
  const glowMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: GLOW_OPACITY[0],
    blending: AdditiveBlending,
    depthWrite: false,
  })
  group.add(new Mesh(glowGeometry, glowMaterial))

  const light = new PointLight(VIOLET, 2, 2.5)
  group.add(light)

  // Rings on their own tilted axes.
  const ringMaterial = new MeshStandardMaterial({ color: '#e6e1ff', metalness: 0.9, roughness: 0.2 })
  const rings = RINGS.map((spec) => {
    const pivot = new Group()
    pivot.rotation.x = spec.tilt
    const ring = new Mesh(new TorusGeometry(spec.radius, spec.tube, 8, 64), ringMaterial)
    // A torus lies in the xy plane; turn it about its own normal (z) through the pivot.
    pivot.add(ring)
    group.add(pivot)
    return { ring, rate: spec.rate, axis: new Vector3(0, 1, 0) }
  })

  return {
    group,
    glowMaterial,
    tick(time) {
      for (const { ring, rate } of rings) ring.rotation.y = time * rate
      glowMaterial.opacity = GLOW_OPACITY[0] + (GLOW_OPACITY[1] - GLOW_OPACITY[0]) * (0.5 + 0.5 * Math.sin(time * 0.8))
    },
    dispose() {
      unit.dispose()
      shellMaterial.dispose()
      glowGeometry.dispose()
      glowMaterial.dispose()
      ringMaterial.dispose()
      for (const { ring } of rings) ring.geometry.dispose()
    },
  }
}
