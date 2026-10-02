// @vitest-environment node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const eslint = new ESLint({ cwd: webRoot })

async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(webRoot, file) })
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax').map((m) => m.message)
}

const TOOLCHAIN = 'Build-time only: asset tooling must not reach the client bundle.'

describe('the asset toolchain cannot reach the client bundle', () => {
  const forbidden: [string, string][] = [
    ['sharp', `import sharp from 'sharp'\nexport const a = sharp\n`],
    ['a named gltf-transform import', `import { Document } from '@gltf-transform/core'\nexport const a = Document\n`],
    ['a gltf-transform subpath', `import { x } from '@gltf-transform/functions/dist/x'\nexport const a = x\n`],
    ['a sharp subpath', `import x from 'sharp/lib/index'\nexport const a = x\n`],
    ['meshoptimizer', `import { MeshoptEncoder } from 'meshoptimizer'\nexport const a = MeshoptEncoder\n`],
    ['a meshoptimizer subpath', `import x from 'meshoptimizer/meshopt_encoder.js'\nexport const a = x\n`],
    ['ktx-parse', `import { read } from 'ktx-parse'\nexport const a = read\n`],
    ['ndarray', `import nd from 'ndarray'\nexport const a = nd\n`],
    ['ndarray-ops', `import ops from 'ndarray-ops'\nexport const a = ops\n`],
    ['property-graph', `import { Graph } from 'property-graph'\nexport const a = Graph\n`],
    ['cwise-compiler', `import c from 'cwise-compiler'\nexport const a = c\n`],
    ['the scripts themselves', `import { runIngest } from '../scripts/assets/ingest'\nexport const a = runIngest\n`],
  ]

  it.each(forbidden)('app/ rejects a static import of %s', async (_label, code) => {
    const found = await lint('app/x.ts', code)
    expect(found.length).toBeGreaterThan(0)
  })

  it('rejects require() and dynamic import() of the toolchain, which a plain import rule would miss', async () => {
    expect(await lint('lib/x.ts', `const s = require('sharp')\nexport default s\n`)).toEqual([TOOLCHAIN])
    expect(await lint('lib/x.ts', `export const load = () => import('sharp')\n`)).toEqual([TOOLCHAIN])
    expect(await lint('lib/x.ts', `export const load = () => import('@gltf-transform/core')\n`)).toEqual([TOOLCHAIN])
    expect(await lint('lib/x.ts', `export const load = () => import('ndarray-pixels')\n`)).toEqual([TOOLCHAIN])
  })

  it('covers every app folder and any new top-level file, not a short list of folders', async () => {
    const code = `import sharp from 'sharp'\nexport const a = sharp\n`
    for (const file of ['components/z.tsx', 'lib/deep/er/x.ts', 'app/api/route.ts', 'middleware.ts', 'hooks/use-x.ts', 'src/anything.js', 'proxy.ts'])
      expect(await lint(file, code), file).toHaveLength(1)
  })

  it('leaves the build-time folders and config files free to use it', async () => {
    const code = `import sharp from 'sharp'\nexport const a = sharp\n`
    for (const file of ['scripts/assets/pipeline.ts', 'tests/unit/x.test.ts', 'next.config.ts', 'vitest.config.ts'])
      expect(await lint(file, code), file).toEqual([])
  })

  it('does not trip on look-alike names', async () => {
    expect(await lint('lib/x.ts', `import s from 'sharpen-text'\nexport default s\n`)).toEqual([])
    expect(await lint('lib/x.ts', `export const load = () => import('./sharp-mask')\n`)).toEqual([])
  })
})
