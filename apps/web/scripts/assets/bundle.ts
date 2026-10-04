/**
 * `npm run check:bundle` (entry: `bundle.cli.ts`)
 *
 * Fails when any JavaScript file the browser can download contains asset tooling. The ESLint
 * `no-restricted-imports` / `no-restricted-syntax` rules stop an import, a `require('sharp')` and an
 * `import('sharp')`, but a computed specifier (`require(`${a}sharp`)`) is out of their reach. This
 * looks at what was actually emitted, after the build, whatever the source looked like.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** What the toolchain leaves behind in a bundle. `sharp` is matched as a module name, not as the English word. */
export const FORBIDDEN: readonly (readonly [label: string, pattern: RegExp])[] = [
  ['@gltf-transform', /@gltf-transform\//],
  ['sharp', /(?:require|import)\s*\(\s*["'`]sharp["'`]|from\s*["']sharp["']|@img\/sharp|sharp-(?:libvips|win32|linux|darwin)|["'`]sharp\/lib/],
  ['meshoptimizer', /meshoptimizer/],
]

export interface BundleFinding {
  readonly file: string
  readonly label: string
}

function jsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsFiles(full))
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full)
  }
  return out
}

/** Every file under `staticDir` (the build's `.next/static`) that carries toolchain code, with what was found. */
export function scanBundle(staticDir: string): { readonly files: number; readonly findings: BundleFinding[] } {
  const files = existsSync(staticDir) ? jsFiles(staticDir) : []
  const findings: BundleFinding[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [label, pattern] of FORBIDDEN) if (pattern.test(text)) findings.push({ file: path.relative(staticDir, file).split(path.sep).join('/'), label })
  }
  return { files: files.length, findings }
}

export function main(webRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')): number {
  const staticDir = path.join(webRoot, '.next', 'static')
  const { files, findings } = scanBundle(staticDir)
  if (files === 0) {
    console.error(`check:bundle found no JavaScript under ${staticDir}: run \`npm run build\` first`)
    return 1
  }
  for (const f of findings) console.error(`[BUNDLE] ${f.file}: contains ${f.label}`)
  if (findings.length > 0) {
    console.error(`check:bundle failed: ${findings.length} client file(s) carry asset tooling`)
    return 1
  }
  console.log(`check:bundle ok: ${files} client JavaScript file(s), none carries asset tooling`)
  return 0
}
