import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_BUDGETS } from '@repo/contracts'
import { expect, test, type Page } from '@playwright/test'

/**
 * The model slot in a real browser — model platform spec § 7.3.
 *
 * The seam tests below give the browser their own placement and manifest through the test seam (`?modeltest=1` plus
 * `window.__ASSEMBLY_MODELS_TEST__`), and the GLB is `tests/fixtures/cube.glb`,
 * served by `page.route`. The seam exists only in a build made with
 * `NEXT_PUBLIC_MODEL_TEST=1` (the CI e2e job sets it, and Playwright's web
 * server inherits it), so the file is skipped when the runner was not given
 * that variable.
 *
 * Chromium runs on SwiftShader, so there is a WebGL2 context without a GPU;
 * `html[data-gl="live"]` is the proof the Assembly mounted. WebKit has no such
 * launch flags (the launch itself fails), so only the Chromium-based `desktop`
 * and `mobile` projects run this file. The tests are independent of each other.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL; WebKit cannot launch with these flags')
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the model test seam)')

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
// Software GL is slow, and several workers share one CPU: be generous, not flaky.
test.describe.configure({ timeout: 150_000 })

const CUBE = readFileSync(join(process.cwd(), 'tests/fixtures/cube.glb'))
const INTEGRITY = `sha256-${createHash('sha256').update(CUBE).digest('base64')}`
const GLB_URL = /\/models\/fixture-cube\.t[12]\.[0-9a-f]{8}\.glb$/
const COMMITTED_GLB = /\/models\/(?:gyroscope|crystal-cluster|gate-complex)\.t[12]\.[0-9a-f]{8}\.glb$/

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
  await expect(html(page)).toHaveAttribute('data-gl', 'live', { timeout: 90_000 })
}

/** Centre a formation's section in the viewport (the scroll store keys on the viewport centre). */
async function showFormation(page: Page, formation: string): Promise<void> {
  await page.evaluate((id) => {
    document.querySelector(`main [data-formation="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, formation)
}

const scrollToTop = (page: Page): Promise<void> => page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
const memory = (page: Page) => page.evaluate(() => window.__ASSEMBLY_DEBUG__?.memory())

/** A scripted scroll the length of the page, ending back at the top. One frame per step, no fixed sleeps. */
async function scrollWholePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const step = window.innerHeight * 0.8
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await frame()
      await frame()
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    await frame()
  })
}

/**
 * For the "never mounts" cases there is no positive marker to wait for, so wait
 * until the layer's mount decision has certainly been made: the LCP has been
 * reported, its 500 ms quiet window has passed and the thread has been idle.
 */
async function decisionMade(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const quiet = () => setTimeout(() => requestIdleCallback(() => resolve(), { timeout: 3000 }), 1500)
        // The LCP entry is only readable through an observer; the layer itself gives up waiting after 8 s.
        const timer = setTimeout(quiet, 9000)
        try {
          new PerformanceObserver(() => (clearTimeout(timer), quiet())).observe({ type: 'largest-contentful-paint', buffered: true })
        } catch {
          // No LCP support: the layer waits for load instead, which has happened by now.
        }
      }),
  )
}

function watch(page: Page) {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  return {
    errors,
    models: () => requests.filter((url) => /\/models\//.test(url) || /\/_next\/static\/chunks\/models\./.test(url)),
    glbs: () => requests.filter((url) => GLB_URL.test(url)),
    /** Every .glb asked for from /models/ that is not the fixture: the committed models. */
    committed: () => requests.filter((url) => /\/models\/[a-z0-9-]+\.t[123]\.[0-9a-f]{8}\.glb$/.test(url) && !GLB_URL.test(url)),
  }
}

test.describe('no models, no requests', () => {
  test('?nomodels=1: the gate says why, and a full scroll asks for nothing under /models/ and loads no models chunk', async ({ page }) => {
    const seen = watch(page)
    await arm(page)
    await page.goto('/?modeltest=1&nomodels=1')
    await goLive(page)
    await scrollWholePage(page)
    await showFormation(page, 'lattice')
    // The seam placed a model in the lattice; the gate is consulted when it is wanted and refuses.
    await expect(html(page)).toHaveAttribute('data-models-gate', 'off:nomodels')
    expect(seen.models()).toEqual([])
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-models-failed', '0')
    expect(seen.errors).toEqual([])
  })

  test('?nogl=1: WebGL never mounts, no slot exists and nothing under /models/ is requested', async ({ page }) => {
    const seen = watch(page)
    await arm(page)
    await page.goto('/?modeltest=1&nogl=1')
    await expect(page.locator('canvas[data-f="monolith"]')).toBeAttached()
    await decisionMade(page)
    await scrollWholePage(page)
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
    await expect(page.locator('canvas[data-f="monolith"]')).toBeAttached()
    await decisionMade(page)
    await scrollWholePage(page)
    expect(seen.models()).toEqual([])
    await expect(html(page)).not.toHaveAttribute('data-gl', 'live')
    await expect(html(page)).not.toHaveAttribute('data-models', /.*/)
    await context.close()
  })

  test('the seam armed but without ?modeltest=1 does nothing: the real ledger rules, no fixture request, no debug hook', async ({ page }) => {
    const seen = watch(page)
    await arm(page)
    await page.goto('/')
    await goLive(page)
    await showFormation(page, 'lattice')
    await scrollWholePage(page)
    // A full scroll visits the three sections that host a committed model; nothing else may be requested.
    expect(seen.glbs()).toEqual([])
    expect(seen.committed().length).toBeGreaterThanOrEqual(1)
    for (const url of seen.committed()) expect(url).toMatch(COMMITTED_GLB)
    await expect(html(page)).not.toHaveAttribute('data-models-gate', 'off:nomodels')
    await expect(html(page)).toHaveAttribute('data-models-failed', '0')
    expect(await page.evaluate(() => window.__ASSEMBLY_DEBUG__)).toBeUndefined()
    expect(seen.errors).toEqual([])
  })
})

test.describe('a model in the lattice section', () => {
  test('loads on arrival within budget, leaves with the section, and the GPU returns to its warm baseline on every loop', async ({ page }) => {
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

    const visit = async (): Promise<void> => {
      await showFormation(page, 'lattice')
      await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 45_000 })
      await scrollToTop(page)
      // The grace period is 2 s and eviction is frame-driven, so the window is generous.
      await expect(html(page)).toHaveAttribute('data-models', '0', { timeout: 12_000 })
    }

    // One warm-up loop pays for one-off allocations (programs, the loader's own state).
    await visit()
    const warm = await memory(page)
    expect(warm).toBeDefined()

    for (let loop = 0; loop < 3; loop += 1) {
      await showFormation(page, 'lattice')
      await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 45_000 })
      // While it is on screen it owns GPU memory: more than the baseline.
      await expect.poll(async () => (await memory(page))?.geometries, { timeout: 15_000 }).toBeGreaterThan(warm?.geometries ?? 0)
      await expect.poll(async () => (await memory(page))?.textures, { timeout: 15_000 }).toBeGreaterThan(warm?.textures ?? 0)
      await scrollToTop(page)
      await expect(html(page)).toHaveAttribute('data-models', '0', { timeout: 12_000 })
      // After eviction nothing is left over: at or below the warm baseline, never above.
      await expect
        .poll(async () => {
          const now = await memory(page)
          return (now?.geometries ?? 0) <= (warm?.geometries ?? 0) && (now?.textures ?? 0) <= (warm?.textures ?? 0)
        }, { timeout: 15_000 })
        .toBe(true)
    }

    expect(glb.length).toBeGreaterThanOrEqual(1)
    for (const bytes of glb) expect(bytes).toBeLessThanOrEqual(MODEL_BUDGETS[2].bytes)
    // The variant asked for is the one the gate published: tier 2 on capable hardware, tier 1 on a
    // modest runner (4 cores or fewer reads as `reduced-instances`, which caps at tier 1).
    const gate = await html(page).getAttribute('data-models-gate')
    expect(gate).toMatch(/^on:[12]$/)
    const tier = gate?.slice(-1)
    expect(seen.glbs().every((url) => url.includes(`.t${tier}.`))).toBe(true)
    await expect(html(page)).toHaveAttribute('data-models-failed', '0')
    expect(seen.errors).toEqual([])
  })

  test('?tier=1 fetches the tier-1 variant', async ({ page }) => {
    const seen = watch(page)
    await page.route(GLB_URL, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: CUBE }))
    await arm(page)
    await page.goto('/?modeltest=1&tier=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 45_000 })
    expect(seen.glbs().length).toBeGreaterThanOrEqual(1)
    expect(seen.glbs().every((url) => /\.t1\./.test(url))).toBe(true)
    await expect(html(page)).toHaveAttribute('data-models-gate', 'on:1')
  })

  test('an aborted GLB request is a counted network failure: the page stays up and the Assembly stays live', async ({ page }) => {
    const seen = watch(page)
    await page.route(GLB_URL, (route) => route.abort('failed'))
    await arm(page)
    await page.goto('/?modeltest=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models-failed', '1', { timeout: 45_000 })
    await expect(html(page)).toHaveAttribute('data-models-last-error', 'network')
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-gl', 'live')
    // No retry loop: leave and come back, still one.
    await scrollToTop(page)
    await showFormation(page, 'lattice')
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(html(page)).toHaveAttribute('data-models-failed', '1')
    expect(seen.errors).toEqual([])
  })

  test('a GLB with one flipped byte is refused by its integrity hash, and says so', async ({ page }) => {
    const seen = watch(page)
    const tampered = Buffer.from(CUBE)
    const at = Math.floor(tampered.length * 0.75)
    tampered[at] = (tampered[at] ?? 0) ^ 0xff
    await page.route(GLB_URL, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: tampered }))
    await arm(page)
    await page.goto('/?modeltest=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models-failed', '1', { timeout: 45_000 })
    await expect(html(page)).toHaveAttribute('data-models-last-error', 'integrity')
    await expect(html(page)).toHaveAttribute('data-models', '0')
    await expect(html(page)).toHaveAttribute('data-gl', 'live')
    expect(seen.errors).toEqual([])
  })

  test('a file that is not a glTF at all (right hash, wrong content) is a counted parse failure', async ({ page }) => {
    const junk = Buffer.from('this is not a glb file, but its hash is right')
    const manifest = JSON.parse(JSON.stringify(SEAM.manifest)) as typeof SEAM.manifest
    for (const v of manifest.models[0]?.variants ?? []) {
      v.integrity = `sha256-${createHash('sha256').update(junk).digest('base64')}`
      v.bytes = junk.length
    }
    await page.route(GLB_URL, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: junk }))
    await page.addInitScript((seam) => {
      window.__ASSEMBLY_MODELS_TEST__ = seam as never
    }, { ...SEAM, manifest })
    await page.goto('/?modeltest=1')
    await goLive(page)
    await showFormation(page, 'lattice')
    await expect(html(page)).toHaveAttribute('data-models-failed', '1', { timeout: 45_000 })
    await expect(html(page)).toHaveAttribute('data-models-last-error', 'parse')
    await expect(html(page)).toHaveAttribute('data-gl', 'live')
  })
})

test.describe('the first models, from the committed ledger (no seam)', () => {
  const rows = [
    ['orbit', 'gyroscope'],
    ['scatter', 'crystal-cluster'],
    ['grid', 'gate-complex'],
  ] as const

  for (const [formation, asset] of rows) {
    test(`${formation} loads ${asset} within its tier budget, and it leaves with the section`, async ({ page }) => {
      const seen = watch(page)
      await page.goto('/')
      await goLive(page)
      await showFormation(page, formation)
      await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 60_000 })
      const tier = (await html(page).getAttribute('data-models-gate'))?.slice(-1)
      expect(tier === '1' || tier === '2').toBe(true)
      expect(seen.committed().filter((url) => url.includes(`/models/${asset}.t${tier}.`))).toHaveLength(1)
      expect(seen.committed().every((url) => url.includes(`.t${tier}.`))).toBe(true)
      await scrollToTop(page)
      await expect(html(page)).toHaveAttribute('data-models', '0', { timeout: 15_000 })
      await expect(html(page)).toHaveAttribute('data-models-failed', '0')
      await expect(html(page)).toHaveAttribute('data-gl', 'live')
      expect(seen.errors).toEqual([])
    })
  }

  test('?tier=1 asks for tier-1 variants only', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/?tier=1')
    await goLive(page)
    await showFormation(page, 'scatter')
    await expect(html(page)).toHaveAttribute('data-models', '1', { timeout: 60_000 })
    expect(seen.committed().length).toBeGreaterThanOrEqual(1)
    expect(seen.committed().every((url) => /\.t1\./.test(url))).toBe(true)
  })
})

test.describe('delivery headers', () => {
  test('the manifest always revalidates; hash-named models are immutable; both are nosniff and same-origin', async ({ request }) => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), 'public/models/manifest.json'), 'utf8')) as { models: Array<{ variants: Array<{ url: string }> }> }
    const manifest = await request.get('/models/manifest.json')
    expect(manifest.status()).toBe(200)
    const manifestHeaders = manifest.headers()
    expect(manifestHeaders['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(manifestHeaders['cache-control']).not.toContain('immutable')
    expect(manifestHeaders['x-content-type-options']).toBe('nosniff')
    expect(manifestHeaders['cross-origin-resource-policy']).toBe('same-origin')

    const url = committed.models[0]?.variants[0]?.url
    expect(url).toBeTruthy()
    const glb = await request.get(url ?? '')
    expect(glb.status()).toBe(200)
    const glbHeaders = glb.headers()
    expect(glbHeaders['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(glbHeaders['x-content-type-options']).toBe('nosniff')
    expect(glbHeaders['cross-origin-resource-policy']).toBe('same-origin')
  })
})
