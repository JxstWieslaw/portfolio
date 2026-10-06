import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DataTexture,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PointLight,
  RGBAFormat,
  RepeatWrapping,
  TorusGeometry,
  UnsignedByteType,
  Vector3,
  LinearFilter,
  NoColorSpace,
} from 'three'
import {
  ARTEFACT_CENTRE,
  ARTEFACT_DETAIL,
  GLOW_OPACITY,
  GLOW_SCALE,
  ARTEFACT_LIGHT_INTENSITY,
  FILM,
  RINGS,
  displaceShell,
  filmNoise,
  shellLookFor,
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
  /** The glow's point light; the scene drives its intensity (never `visible`). */
  readonly light: PointLight
  /** Advances the rings and the glow pulse. */
  tick(time: number): void
  /** Ring presence 0..1: `1` in the hero, `0` as the orbit's core (§ 3.4). Scale, never `visible`. */
  setRings(weight: number): void
  dispose(): void
}

const VIOLET = new Color('#7C3AED')
const CYAN = new Color('#22D3EE')

/**
 * The film's thickness map: tileable noise in every channel (the shader reads
 * G), repeating, with no mipmaps (64 px is already smoother than the facets).
 */
function createFilmMap(): DataTexture {
  const bytes = filmNoise()
  const data = new Uint8Array(bytes.length * 4)
  for (let i = 0; i < bytes.length; i += 1) {
    const v = bytes[i] as number
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const map = new DataTexture(data, FILM.noisePx, FILM.noisePx, RGBAFormat, UnsignedByteType)
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearFilter
  map.colorSpace = NoColorSpace
  map.needsUpdate = true
  return map
}

/**
 * `keep` is the assembly's tier fraction: below 1 (`reduced-instances`) the
 * shell is a plain `MeshStandardMaterial` with a baked tint and no texture.
 */
export function createArtefact(keep = 1): Artefact {
  const group = new Group()
  group.position.set(ARTEFACT_CENTRE[0], ARTEFACT_CENTRE[1], ARTEFACT_CENTRE[2])

  // Shell: every face flat, so the facets catch the key and rim lights.
  const unit = new IcosahedronGeometry(1, ARTEFACT_DETAIL).toNonIndexed()
  const displaced = displaceShell(unit.getAttribute('position').array)
  unit.setAttribute('position', new BufferAttribute(displaced, 3))
  unit.computeVertexNormals()
  const look = shellLookFor(keep)
  const filmMap = look === 'film' ? createFilmMap() : null
  const shellMaterial =
    filmMap === null
      ? new MeshStandardMaterial({ color: FILM.bakedTint, metalness: 0.7, roughness: 0.28, flatShading: true })
      : new MeshPhysicalMaterial({
          color: FILM.tint,
          metalness: FILM.metalness,
          roughness: FILM.roughness,
          clearcoat: FILM.clearcoat,
          clearcoatRoughness: FILM.clearcoatRoughness,
          iridescence: FILM.iridescence,
          iridescenceIOR: FILM.ior,
          iridescenceThicknessRange: [FILM.thickness[0], FILM.thickness[1]],
          iridescenceThicknessMap: filmMap,
          emissive: FILM.emissive,
          emissiveIntensity: FILM.emissiveIntensity,
          flatShading: true,
        })
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

  const light = new PointLight(VIOLET, ARTEFACT_LIGHT_INTENSITY, 2.5)
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
    light,
    setRings(weight) {
      const s = Math.max(0, weight)
      for (const { ring } of rings) ring.scale.setScalar(s)
    },
    tick(time) {
      for (const { ring, rate } of rings) ring.rotation.y = time * rate
      // The film drifts: the map's offset wraps (RepeatWrapping), so the colour slides over the facets.
      if (filmMap) filmMap.offset.set((time * FILM.drift[0]) % 1, (time * FILM.drift[1]) % 1)
      glowMaterial.opacity = GLOW_OPACITY[0] + (GLOW_OPACITY[1] - GLOW_OPACITY[0]) * (0.5 + 0.5 * Math.sin(time * 0.8))
    },
    dispose() {
      unit.dispose()
      shellMaterial.dispose()
      filmMap?.dispose()
      glowGeometry.dispose()
      glowMaterial.dispose()
      ringMaterial.dispose()
      for (const { ring } of rings) ring.geometry.dispose()
    },
  }
}
