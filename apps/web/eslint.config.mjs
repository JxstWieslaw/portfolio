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
  { ignores: ['.next/**', 'next-env.d.ts'] },
]
