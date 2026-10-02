import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/** Modules that belong to the lazy `models` chunk, matched on path with either separator. */
const MODELS_CHUNK =
  /[\\/](?:components[\\/]three[\\/]models[\\/]ModelLoader\.ts|lib[\\/]models[\\/]manifest\.ts|public[\\/]models[\\/]manifest\.json|three[\\/]examples[\\/]jsm[\\/](?:loaders[\\/]GLTFLoader|libs[\\/]meshopt_decoder\.module|utils[\\/](?:BufferGeometryUtils|SkeletonUtils))\.js)$/

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
    /**
     * The model loaders (GLTFLoader, the Meshopt decoder), the manifest and the
     * `ModelLoader` that imports them are reachable only through one dynamic
     * import. Next's default cache groups would still shave them into a numbered
     * shared chunk beside a tiny named one, which is two files for `size-limit`
     * to tell apart. Forcing one async group named `models` keeps them in a
     * single `models.<hash>.js` whose size is the budget (platform spec § 4.2).
     */
    const splitChunks = config.optimization?.splitChunks
    if (splitChunks && typeof splitChunks === 'object') {
      splitChunks.cacheGroups = {
        ...splitChunks.cacheGroups,
        models: {
          name: 'models',
          chunks: 'async',
          enforce: true,
          priority: 60,
          test: MODELS_CHUNK,
        },
      }
    }
    return config
  },
  async headers() {
    return [
      {
        // Hashed file names (`<id>.t<tier>.<hash8>.glb`): a changed asset is a new file, so a year is safe.
        source: '/models/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default config
