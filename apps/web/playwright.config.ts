import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end, accessibility and visual regression suite (Task 18).
 *
 * `testMatch` scopes Playwright to the `e2e` and `visual` subtrees of
 * `./tests` only. Vitest owns everything under `tests/unit` (see
 * `vitest.config.ts`'s `include`); this file's specs are all `*.spec.ts`, in
 * different directories, with a different file extension — the two runners
 * cannot collide.
 *
 * `baseURL` matches `apps/web`'s `start` script (`next start --port 3000`).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'ultrawide', use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1080 } } },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
