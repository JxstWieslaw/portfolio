import { describe, expect, it } from 'vitest'
import { BREATH_FPS } from '@/lib/assembly/motion'

/**
 * The idle ticker's rate. It lives in `lib/assembly/motion.ts` (the canvas
 * imports three and needs WebGL, so a test cannot import it) and the canvas
 * reads it, so this is the real value, not a copy of it.
 *
 * Tradeoff recorded here so a later change is made knowingly: desktop moved
 * from 30 to 20 fps to match the 2D hero this layer replaces (a third fewer
 * idle frames). `setInterval(..., 50)` therefore steps visibly on 120 and
 * 144 Hz displays, advancing the scene every 6th or 7th refresh.
 */
describe('Assembly idle breathing rate', () => {
  it('is 20 fps on desktop as well as touch', () => {
    expect(BREATH_FPS).toBe(20)
  })
})
