import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // `emitDecoratorMetadata` in tsconfig.json makes tsup compile with SWC, which keeps
  // decorator metadata. Inlined: the workspace contracts (TypeScript source, not loadable by
  // Node at runtime) and pure-JS libraries, so the production node_modules holds only
  // framework packages.
  noExternal: [/^@repo\//, 'drizzle-orm', 'zod', 'zod-to-json-schema', 'ulid'],
})
