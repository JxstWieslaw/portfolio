import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit only *generates* SQL into ./drizzle (committed as generator state). The runnable
 * migrations live in ./migrations with hand-written down.sql files — see migrations/README.md.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
})
