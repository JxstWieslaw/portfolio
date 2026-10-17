import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * Visual regression only (tests/visual/home.spec.ts), run in the pinned Playwright container by
 * the `visual` job in .github/workflows/ci.yml and by visual-baselines.yml. Same projects and
 * web server as the main config; only the file selection and the reporter differ.
 */
export default defineConfig({
  ...base,
  testMatch: ['visual/home.spec.ts'],
  // actual/expected/diff PNGs land in test-results/, which CI uploads on failure.
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
})
