import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/** Modules that belong to the lazy `models` chunk, matched on path with either separator. */
const MODELS_CHUNK =
  /[\\/](?:components[\\/]three[\\/]models[\\/]ModelLoader\.ts|lib[\\/]models[\\/]manifest\.ts|public[\\/]models[\\/]manifest\.json|three[\\/]examples[\\/]jsm[\\/](?:loaders[\\/]GLTFLoader|libs[\\/]meshopt_decoder\.module|utils[\\/](?:BufferGeometryUtils|SkeletonUtils))\.js)$/

/**
 * Modules that belong to the lazy `hero` chunk (the monolith engine, raw WebGL2, no three). `lib/hero/gate.ts`
 * is deliberately not here: the initial bundle's `AssemblyLayer` decides with it.
 */
const HERO_CHUNK =
  /[\\/](?:components[\\/]three[\\/]hero[\\/](?:HeroLayer\.tsx|HeroEngine\.ts|hero\.glsl\.ts)|lib[\\/]hero[\\/](?:geometry|progress|frame|governor|tiers)\.ts)$/

/**
 * The API origin for `connect-src`, or '' when the value is unusable. Only http(s) with a plain host is accepted, so a
 * value like `javascript:x` (origin "null"), `https://*.x.com` or one carrying `;` or `,` can never reach the header.
 * `URL.origin` drops userinfo, path, query and fragment.
 */
function apiOrigin(raw: string | undefined): string {
  try {
    const url = new URL((raw ?? '').trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return /^[a-z0-9.:-]+$/i.test(url.host) ? url.origin : ''
  } catch {
    return ''
  }
}

/**
 * The Content-Security-Policy, report-only for now (docs/security-headers.md). Built per call so the environment it
 * reads (preview or live, dev or production, the API origin) is the one the build or server runs with.
 *
 * Why each exception exists:
 * - `script-src 'unsafe-inline'`: the App Router streams inline bootstrap scripts, and these pages are static, so
 *   there is no per-request nonce to put on them. Enforcing without 'unsafe-inline' needs a nonce middleware, which
 *   makes every page dynamic; that trade is deliberately not made here.
 * - `'wasm-unsafe-eval'`: the Meshopt decoder instantiates WebAssembly. It permits wasm only, not eval().
 * - `style-src 'unsafe-inline'`: React inline `style` attributes and the `next/font` @font-face block.
 * - `img-src data: blob:` and `connect-src`: fetches are same-origin (models, content) plus the API origin, read
 *   from NEXT_PUBLIC_API_URL.
 * - Vercel's toolbar and comments widget load only on preview deployments (`VERCEL_ENV=preview`), never live.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== 'production'
  const preview = process.env.VERCEL_ENV === 'preview'
  const api = apiOrigin(process.env.NEXT_PUBLIC_API_URL)
  const live = preview ? ['https://vercel.live', 'https://vercel.com'] : []
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : []), ...live],
    'style-src': ["'self'", "'unsafe-inline'", ...live],
    'img-src': ["'self'", 'data:', 'blob:', ...live],
    'font-src': ["'self'", 'data:', ...live],
    'connect-src': ["'self'", ...(api ? [api] : []), ...(dev ? ['ws:', 'http:'] : []), ...(preview ? [...live, 'wss://ws-us3.pusher.com'] : [])],
    'frame-src': preview ? ["'self'", ...live] : ["'none'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'mailto:'],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

const PERMISSIONS_POLICY = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'serial',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ')

const config: NextConfig = {
  reactStrictMode: true,
  // Always defined, so the bundler inlines it either way and the model test seam
  // (`lib/models/test-seam.ts`) folds to `false` and is removed in a normal production build.
  // Only the e2e job's build sets NEXT_PUBLIC_MODEL_TEST=1; a Vercel (deployed) build never carries the seam,
  // whatever the dashboard's environment variables say.
  env: {
    NEXT_PUBLIC_MODEL_TEST: process.env.NEXT_PUBLIC_MODEL_TEST === '1' && !process.env.VERCEL ? '1' : '0',
    // The hero switch folds at build time (`monolith` or `off`; anything else is unset), so the `process.env` read in
    // lib/hero/mode.ts is a constant. Unset means the default, `HERO_DEFAULT_ON`.
    NEXT_PUBLIC_HERO: process.env.NEXT_PUBLIC_HERO === 'monolith' || process.env.NEXT_PUBLIC_HERO === 'off' ? process.env.NEXT_PUBLIC_HERO : '',
  },
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
        // Same trap, same fix: the hero engine's budget is the size of one named file.
        hero: {
          name: 'hero',
          chunks: 'async',
          enforce: true,
          priority: 60,
          test: HERO_CHUNK,
        },
      }
    }
    return config
  },
  async headers() {
    const safe = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ]
    return [
      {
        // Site-wide, and the CSP is report-only: it watches for violations and blocks nothing. The model rules
        // below set only their own keys (Cache-Control, CORP) plus the same nosniff value, so they do not clash.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
          { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy() },
        ],
      },
      {
        // Hashed file names (`<id>.t<tier>.<hash8>.glb`): a changed asset is a new file, so a year is safe.
        source: String.raw`/models/:file([a-z0-9-]+\.t[123]\.[0-9a-f]{8}\.glb)`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }, ...safe],
      },
      {
        // Content-hashed names (`hero-<orientation>-<state>.<sha8>.<ext>`): a new render is a new file.
        source: String.raw`/posters/:file(hero-[a-z]+-[a-z]+\.[0-9a-f]{8}\.(?:avif|webp))`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }, ...safe],
      },
      {
        source: String.raw`/og/:file(hero\.[0-9a-f]{8}\.png)`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }, { key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        // The manifest keeps its name across ingests, so it must always revalidate.
        source: '/models/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }, ...safe],
      },
      {
        source: '/posters/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }, ...safe],
      },
    ]
  },
}

export default config
