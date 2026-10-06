/**
 * GPU disposal for a loaded model — model platform spec § 3.2.
 *
 * PURE over a minimal interface so a unit test can use fakes (no three, no
 * WebGL). Every geometry, material, texture and skeleton is disposed exactly
 * once even when meshes share them; the mixer is stopped and its root
 * uncached; the model leaves its parent.
 */

export interface DisposableLike {
  dispose(): void
}

interface TextureLike extends DisposableLike {
  readonly isTexture: true
  readonly source?: { readonly data?: unknown }
}

export interface DisposeNode {
  geometry?: DisposableLike
  material?: unknown
  skeleton?: DisposableLike
}

export interface DisposeRoot extends DisposeNode {
  /** `any` so three's `Object3D.traverse` (which hands out `Object3D`) fits without a cast at every call site. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse(visit: (node: any) => void): void
  removeFromParent(): void
}

export interface MixerLike {
  stopAllAction(): void
  uncacheRoot(root: unknown): void
}

function isTexture(value: unknown): value is TextureLike {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true
}

function isDisposable(value: unknown): value is DisposableLike {
  return typeof value === 'object' && value !== null && typeof (value as { dispose?: unknown }).dispose === 'function'
}

/** Releases an ImageBitmap-backed texture's pixels as well as its GPU copy. */
function closeBitmap(texture: TextureLike): void {
  const data = texture.source?.data as { close?: () => void } | undefined
  if (data && typeof data.close === 'function') data.close()
}

/**
 * `mixerRoot` is the object the mixer was created on (the glTF scene), when
 * that is not `root` itself.
 *
 * Every release is attempted even when an earlier one throws, and the model
 * always leaves its parent. If anything threw, the first error is rethrown
 * once at the end so the caller can count and log it.
 */
export function disposeModel(root: DisposeRoot, mixer?: MixerLike | null, mixerRoot: unknown = root): void {
  let firstError: unknown
  let failed = false
  const attempt = (release: () => void): void => {
    try {
      release()
    } catch (error) {
      if (!failed) firstError = error
      failed = true
    }
  }

  try {
    attempt(() => mixer?.stopAllAction())
    attempt(() => mixer?.uncacheRoot(mixerRoot))

    const geometries = new Set<DisposableLike>()
    const materials = new Set<DisposableLike>()
    const textures = new Set<TextureLike>()
    const skeletons = new Set<DisposableLike>()

    attempt(() =>
      root.traverse((visited) => {
        const node = visited as DisposeNode
        if (node.geometry) geometries.add(node.geometry)
        if (node.skeleton) skeletons.add(node.skeleton)
        const list = Array.isArray(node.material) ? (node.material as unknown[]) : node.material ? [node.material] : []
        for (const material of list) {
          if (!isDisposable(material)) continue
          materials.add(material)
          for (const value of Object.values(material as unknown as Record<string, unknown>)) if (isTexture(value)) textures.add(value)
        }
      }),
    )

    for (const texture of textures) {
      attempt(() => closeBitmap(texture))
      attempt(() => texture.dispose())
    }
    for (const material of materials) attempt(() => material.dispose())
    for (const geometry of geometries) attempt(() => geometry.dispose())
    for (const skeleton of skeletons) attempt(() => skeleton.dispose())
  } finally {
    attempt(() => root.removeFromParent())
  }
  if (failed) throw firstError
}
