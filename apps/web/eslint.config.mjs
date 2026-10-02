import base from '@repo/config/eslint'
import nextPlugin from '@next/eslint-plugin-next'

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
    // The asset toolchain is build-time only. Nothing it pulls in (the glTF-Transform
    // libraries, sharp, the Meshopt encoder) may be reachable from code that ships to the
    // browser, so app code cannot import it or the scripts that wrap it.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'sharp', message: 'Build-time only: asset tooling must not reach the client bundle.' },
            { name: 'meshoptimizer', message: 'Build-time only: asset tooling must not reach the client bundle.' },
          ],
          patterns: [
            { group: ['@gltf-transform/*'], message: 'Build-time only: asset tooling must not reach the client bundle.' },
            { group: ['**/scripts/assets/**'], message: 'Build-time only: scripts/assets is not importable from app code.' },
          ],
        },
      ],
    },
  },
  { ignores: ['.next/**', 'next-env.d.ts'] },
]
