import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `BREATH_FPS` is module-private in `AssemblyCanvas`, which needs WebGL to
 * import. Pin the value from source instead: the idle ticker runs at 20 fps on
 * every device, matching the 2D hero it replaces.
 */
describe('Assembly idle breathing rate', () => {
  it('is 20 fps on desktop as well as touch', () => {
    const source = readFileSync(join(process.cwd(), 'components/three/AssemblyCanvas.tsx'), 'utf8')
    expect(source).toMatch(/^const BREATH_FPS = 20$/m)
  })
})
