import { describe, expect, it, vi } from 'vitest'
import { disposeModel, type DisposeNode, type DisposeRoot, type MixerLike } from '@/lib/models/dispose'

const disposable = () => ({ dispose: vi.fn() })
const texture = (data?: unknown) => ({ isTexture: true as const, dispose: vi.fn(), source: { data } })

function makeRoot(nodes: DisposeNode[]) {
  const removed = vi.fn()
  const root: DisposeRoot = {
    traverse: (visit) => {
      for (const node of nodes) visit(node)
    },
    removeFromParent: removed,
  }
  return { root, removed }
}

function makeMixer() {
  const calls: string[] = []
  const mixer: MixerLike = {
    stopAllAction: () => calls.push('stop'),
    uncacheRoot: (target) => calls.push(`uncache:${String(target)}`),
  }
  return { mixer, calls }
}

describe('disposeModel', () => {
  it('disposes every geometry, material, texture and skeleton exactly once, and leaves the parent', () => {
    const geometry = disposable()
    const geometry2 = disposable()
    const skeleton = disposable()
    const map = texture()
    const normal = texture()
    const material = { ...disposable(), map, normalMap: normal, roughness: 0.5, name: 'm' }
    const material2 = { ...disposable(), map }
    const { root, removed } = makeRoot([{ geometry, material }, { geometry: geometry2, material: [material, material2], skeleton }])

    disposeModel(root)

    for (const item of [geometry, geometry2, skeleton, map, normal, material, material2]) expect(item.dispose).toHaveBeenCalledTimes(1)
    expect(removed).toHaveBeenCalledTimes(1)
  })

  it('disposes shared geometry once even when many meshes use it', () => {
    const geometry = disposable()
    const { root } = makeRoot([{ geometry }, { geometry }, { geometry }])
    disposeModel(root)
    expect(geometry.dispose).toHaveBeenCalledTimes(1)
  })

  it('stops the mixer and uncaches its root before anything is released', () => {
    const geometry = disposable()
    const { mixer, calls } = makeMixer()
    geometry.dispose.mockImplementation(() => calls.push('geometry'))
    const { root } = makeRoot([{ geometry }])
    disposeModel(root, mixer, 'scene')
    expect(calls).toEqual(['stop', 'uncache:scene', 'geometry'])
  })

  it('uncaches the root itself when no mixer root is given', () => {
    const { mixer, calls } = makeMixer()
    const { root } = makeRoot([])
    root.toString = () => 'root'
    disposeModel(root, mixer)
    expect(calls).toEqual(['stop', 'uncache:root'])
  })

  it('closes an ImageBitmap-backed texture as well as disposing it', () => {
    const close = vi.fn()
    const map = texture({ close })
    const { root } = makeRoot([{ material: { ...disposable(), map } }])
    disposeModel(root)
    expect(close).toHaveBeenCalledTimes(1)
    expect(map.dispose).toHaveBeenCalledTimes(1)
  })

  it('tolerates plain-image textures, nodes with nothing to release and materials that cannot dispose', () => {
    const map = texture({ width: 2 })
    const { root, removed } = makeRoot([{}, { material: { ...disposable(), map } }, { material: { notAMaterial: true } }])
    expect(() => disposeModel(root)).not.toThrow()
    expect(map.dispose).toHaveBeenCalledTimes(1)
    expect(removed).toHaveBeenCalledTimes(1)
  })
})
