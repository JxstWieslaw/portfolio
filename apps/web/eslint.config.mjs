import base from '@repo/config/eslint'
import nextPlugin from '@next/eslint-plugin-next'

const TOOLCHAIN = 'Build-time only: asset tooling must not reach the client bundle.'
const TOOLCHAIN_RE = '/^(sharp|meshoptimizer|ktx-parse|property-graph|cwise-compiler|ndarray|@gltf-transform)(\\/|-|$)/'

// `eslint-config-next` at v15 still ships a legacy (eslintrc) config object with
// no flat-config export, so the Next rules are wired in from the plugin directly
// rather than through FlatCompat.
export default [
  ...base,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // `.cjs` config files (lighthouserc.cjs) are plain CommonJS regardless of this
    // package's `"type": "module"`, so they use `module`/`require`, not ESM globals.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // The asset toolchain is build-time only. Nothing it pulls in (the glTF-Transform libraries,
    // sharp, the Meshopt encoder, and their transitive helpers) may be reachable from code that
    // ships to the browser. The scope is everything except the folders that legitimately use it,
    // so a new top-level folder or file is covered by default.
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['scripts/**', 'tests/**', '**/*.config.*', '.next/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'sharp', message: TOOLCHAIN },
            { name: 'meshoptimizer', message: TOOLCHAIN },
            { name: 'ktx-parse', message: TOOLCHAIN },
            { name: 'property-graph', message: TOOLCHAIN },
            { name: 'cwise-compiler', message: TOOLCHAIN },
          ],
          patterns: [
            { group: ['@gltf-transform/*'], message: TOOLCHAIN },
            { group: ['sharp/**', 'meshoptimizer/**', 'ktx-parse/**', 'property-graph/**', 'cwise-compiler/**', 'ndarray*'], message: TOOLCHAIN },
            { group: ['**/scripts/assets/**'], message: 'Build-time only: scripts/assets is not importable from app code.' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: `CallExpression[callee.name='require'][arguments.0.value=${TOOLCHAIN_RE}]`, message: TOOLCHAIN },
        { selector: `ImportExpression[source.value=${TOOLCHAIN_RE}]`, message: TOOLCHAIN },
      ],
    },
  },
  { ignores: ['.next/**', 'next-env.d.ts'] },
]
