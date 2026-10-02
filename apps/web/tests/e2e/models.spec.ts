import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_BUDGETS } from '@repo/contracts'
import { expect, test, type Page } from '@playwright/test'

/**
 * The model slot in a real browser — model platform spec § 7.3, cases 1, 2, 4
 * and 5, plus the leave-and-return leak loop.
 *
 * Every ledger row is `null` today, so the browser gets its placement and its
 * manifest from the test seam (`?modeltest=1` plus
 * `window.__ASSEMBLY_MODELS_TEST__`), and the GLB is `tests/fixtures/cube.glb`,
 * served by `page.route`. The suite never depends on a shipped model.
 *
 * Chromium runs on SwiftShader, so there is a WebGL2 context without a GPU;
 * `html[data-gl="live"]` is the proof the Assembly mounted.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
test.describe.configure({ timeout: 120_000 })

const CUBE = readFileSync(join(process.cwd(), 'tests/fixtures/cube.glb'))
const INTEGRITY = `sha256-${createHash('sha256').update(CUBE).digest('base64')}`
const GLB_URL = /\/models\/fixture-cube\.t[12]\.[0-9a-f]{8}\.glb$/

const variant = (tier: 1 | 2) => ({
  tier,
  requires: ['meshopt'],
  url: `/models/fixture-cube.t${tier}.deadbeef.glb`,
  bytes: CUBE.length,
  triangles: 12,
  maxTexturePx: 2,
  integrity: INTEGRITY,
  extensions: [],
})

const SEAM = {
  placements: {
    lattice: {
      asset: 'fixture-cube',
      role: 'prop',
      position: [0, 0, 0],
      scale: 0.3,
      rotation: [0, 0, 0],
      spin: 0.5,
      exclusion: 0,
      appear: [0.1, 0.5],
      clip: { name: 'spin', mode: 'scrub' },
    },
  },
  manifest: {
    version: 1,
    contentHash: '0000000000000000',
    models: [
      { id: 'fixture-cube', title: 'Fixture cube', kind: 'prop', enabled: true, boundsRadius: 1, clips: [{ name: 'spin', seconds: 1 }], variants: [variant(1), variant(2)] },
    ],
  },
}

async function arm(page: Page): Promise<void> {
  await page.addInitScript((seam) => {
    window.__ASSEMBLY_MODELS_TEST__ = seam as never
  }, SEAM)
}

const html = (page: Page) => page.locator('html')
const goLive = async (page: Page): Promise<void> => {
  await expect(html(page)).toHaveAttribute('data-gl', 'live', { timeout: 60_000 })
}

/** Centre a formation's section in the viewport (the scroll store keys on the viewport centre). */
async function showFormation(page: Page, formation: string): Promise<void> {
  await page.evaluate((id) => {
    document.querySelector(`main [data-formation="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, formation)
}

const scrollToTop = (page: Page): Promise<void> => page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))

const memory = (page: Page) => page.evaluate(() => window.__ASSEMBLY_DEBUG__?.memory())

/** A scripted scroll the length of the page, ending back at the top. */
async function scrollWholePage(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  const step = await page.evaluate(() => window.innerHeight * 0.8)
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
    await page.waitForTimeout(60)
  }
  await scrollToTop(page)
}

function watch(page: Page) {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  return {
    errors,
    models: () => requests.filter((url) => /\/models\//.test(url) || /\/_next\/static\/chunks\/models\./.test(url)),
  }
}

test.describe('no models, no requests', () => {
  test('?nomodels=1: the Assembly mounts and a full scroll asks for nothing under /models/ and loads no models chunk', async ({ page }) => {
    const seen = watch(page)
    await arm(page)
    await page.goto('/?modeltest=1&nomodels=1')
    await goLive(page)
    await scrollWholePage(page)
    await showFormation(page, 'lattice')
    await page.waitForTimeout(1500)
    expect(seen.models()).toEqual([])
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-models-failed', '0')
    expect(seen.errors).toEqual([])
  })

  test('?nogl=1: WebGL never mounts, no slot exists and nothing under /models/ is requested', async ({ page }) => {
    const seen = watch(page)
    await arm(page)
    await page.goto('/?modeltest=1&nogl=1')
    await scrollWholePage(page)
    await page.waitForTimeout(1500)
    expect(seen.models()).toEqual([])
    await expect(html(page)).not.toHaveAttribute('data-gl', 'live')
    await expect(html(page)).not.toHaveAttribute('data-models', /.*/)
    expect(seen.errors).toEqual([])
  })

  test('prefers-reduced-motion: WebGL never mounts and nothing under /models/ is requested', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    const seen = watch(page)
    await arm(page)
    await page.goto('/?modeltest=1')
    await scrollWholePage(page)
    await page.waitForTimeout(1500)
    expect(seen.models()).toEqual([])
    await expect(html(page)).not.toHaveAttribute('data-gl', 'live')
    await expect(html(page)).not.toHaveAttribute('data-models', /.*/)
    await context.close()
  })
})

test.describe('a model in the lattice section', () => {
  test('loads on arrival within budget, leaves with the section, and returns the GPU to baseline on every loop', async ({ page }) => {
    const seen = watch(page)
    const glb: number[] = []
    await page.route(GLB_URL, (route) => {
      glb.push(CUBE.length)
      return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: CUBE })
    })
    await arm(page)
    await page.goto('/?modeltest=1')
    await goLive(page)
    await expect(html(page)).toHaveAttribute('data-models', '0')
    // Nothing is fetched before a section wants the model.
    expect(seen.models()).toEqual([])
    const baseline = await memory(page)
    expect(baseline).toBeDefined()

    for (let loop = 0; loop < 3; loop += 1) {
      await showFormation(page, 'lattice')
      await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 30_000 })
      // While it is on screen it owns GPU memory: at least its geometry and its texture.
      await expect.poll(async () => (await memory(page))?.geometries, { timeout: 15_000 }).toBeGreaterThan(baseline?.geometries ?? 0)
      await expect.poll(async () => (await memory(page))?.textures, { timeout: 15_000 }).toBeGreaterThan(baseline?.textures ?? 0)

      await scrollToTop(page)
      // Grace period is 2 s; allow a second of margin.
      await expect(html(page)).toHaveAttribute('data-models', '0', { timeout: 3_500 })
      await expect.poll(() => memory(page), { timeout: 10_000 }).toEqual(baseline)
    }

    // One fetch per visit is allowed (the browser may serve repeats from cache), never more than the loop count.
    expect(glb.length).toBeGreaterThanOrEqual(1)
    expect(glb.length).toBeLessThanOrEqual(3)
    for (const bytes of glb) expect(bytes).toBeLessThanOrEqual(MODEL_BUDGETS[2].bytes)
    await expect(html(page)).toHaveAttribute('data-models-failed', '0')
    expect(seen.errors).toEqual([])
  })

  test('an aborted GLB request leaves the page up, counts one failure and keeps the Assembly live', async ({ page }) => {
    const seen = watch(page)
    await page.route(GLB_URL, (route) => route.abort('failed'))
    await arm(page)
    await page.goto('/?modeltest=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models-failed', '1', { timeout: 30_000 })
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-gl', 'live')
    // No retry loop: leave and come back, still one.
    await scrollToTop(page)
    await showFormation(page, 'lattice')
    await page.waitForTimeout(1500)
    await expect(html(page)).toHaveAttribute('data-models-failed', '1')
    expect(seen.errors).toEqual([])
  })

  test('a GLB with one flipped byte is refused by its integrity hash, same as an abort', async ({ page }) => {
    const seen = watch(page)
    const tampered = Buffer.from(CUBE)
    const at = Math.floor(tampered.length * 0.75)
    tampered[at] = (tampered[at] ?? 0) ^ 0xff
    await page.route(GLB_URL, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: tampered }))
    await arm(page)
    await page.goto('/?modeltest=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models-failed', '1', { timeout: 30_000 })
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-gl', 'live')
    expect(seen.errors).toEqual([])
  })
})
