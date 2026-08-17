import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // `@repo/contracts` ships TypeScript source rather than a build artefact
  // (`"main": "./src/index.ts"`), which is what lets a contract change fail this
  // app's typecheck in CI instead of at runtime. Next has to compile it.
  transpilePackages: ['@repo/contracts'],
  // Without this Next walks up past the monorepo and picks the user's home
  // directory as the workspace root, which poisons the build trace.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // `lint` is its own Turbo task; running ESLint again inside `build` would
  // double the work and couple two failure modes together.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    /**
     * `@repo/contracts` is ESM TypeScript, so its barrel does `export * from './content.js'`
     * — the extension the emitted JS will have, which is what Node's ESM resolver requires.
     * TypeScript understands that a `.js` specifier means the sibling `.ts`; webpack does not,
     * and fails with "Can't resolve './content.js'".
     *
     * `extensionAlias` teaches it the same rule. Fixing it here rather than dropping the
     * extension in the contracts barrel keeps that package correct for the API, which will
     * consume it as real ESM at runtime.
     */
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default config
