import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * The cube pixel-parity spec only (tests/visual/cubes-parity.spec.ts), run in the pinned Playwright container by the
 * `cubes` job in .github/workflows/ci.yml and by visual-baselines.yml. Unlike the home visual suite it needs an app
 * built with NEXT_PUBLIC_MODEL_TEST=1 (the cube freeze seam), which the job sets for this config's own build.
 * One worker and no retries: software GL frames are heavy, and a retry must not be able to hide a flaky frame.
 */
const port = Number(process.env.CUBES_PORT ?? 3000)

export default defineConfig({
  ...base,
  testMatch: ['visual/cubes-parity.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  projects: (base.projects ?? []).filter((project) => project.name === 'desktop'),
  webServer: {
    command: `npm run build && npx next start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
