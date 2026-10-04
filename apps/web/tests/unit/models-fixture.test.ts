import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { buildCubeGlb } from '../fixtures/make-cube-glb'

const committed = readFileSync(join(process.cwd(), 'tests/fixtures/cube.glb'))

describe('the e2e cube fixture', () => {
  it('is tiny, generated without timestamps, and the committed file is what the helper builds', async () => {
    const first = await buildCubeGlb()
    const second = await buildCubeGlb()
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true)
    expect(Buffer.from(first).equals(committed)).toBe(true)
    expect(committed.length).toBeLessThan(3000)
  })

  it('holds one textured mesh and one clip, normalised to bounding radius 1', async () => {
    const doc = await new NodeIO().readBinary(new Uint8Array(committed))
    const root = doc.getRoot()
    expect(root.listMeshes()).toHaveLength(1)
    expect(root.listTextures()).toHaveLength(1)
    expect(root.listMaterials()).toHaveLength(1)
    expect(root.listAnimations().map((a) => a.getName())).toEqual(['spin'])
    const positions = root.listMeshes()[0]?.listPrimitives()[0]?.getAttribute('POSITION')?.getArray() as Float32Array
    let radius = 0
    for (let i = 0; i < positions.length; i += 3) radius = Math.max(radius, Math.hypot(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0))
    expect(radius).toBeCloseTo(1, 5)
  })
})
