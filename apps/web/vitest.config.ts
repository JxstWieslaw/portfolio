import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    globals: true,
    // Locally the suite shares a machine with builds and other test runs, and forks that cannot start in time
    // fail a whole file ("Failed to start forks worker"). In CI the runner is the suite's own, so it stays uncapped.
    maxWorkers: process.env['CI'] ? undefined : '50%',
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
})
