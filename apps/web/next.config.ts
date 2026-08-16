import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Without this Next walks up past the monorepo and picks the user's home
  // directory as the workspace root, which poisons the build trace.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // `lint` is its own Turbo task; running ESLint again inside `build` would
  // double the work and couple two failure modes together.
  eslint: { ignoreDuringBuilds: true },
}

export default config
