// @vitest-environment node
/** `npm run size:coverage`: every emitted chunk is counted by exactly one budget, or is one a browser never downloads. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { checkCoverage, main, NOT_DOWNLOADED, WINDOWS_ONLY_EXCLUSIONS, type SizeLimitEntry } from '../../scripts/budgets/coverage'

const tmp = mkdtempSync(path.join(tmpdir(), 'coverage-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** The chunks a real Windows build emits that no budget counts, one per `NOT_DOWNLOADED` rule. */
const NEVER_DOWNLOADED = [
  'framework-42c8ac84ce402d49.js',
  'main-63ead8bdb46983ac.js',
  'pages/_app-3ded232aab453b40.js',
  '655.da897ed6c3886fd7.js',
  '826.ee0081b43a818bd9.js',
  'polyfills-42372ed130431b0a.js',
  'app/robots.txt/route-178cca95fd1b094f.js',
]

const BUDGETS: SizeLimitEntry[] = [
  {
    name: 'initial',
    path: [
      '.next/static/chunks/*.js',
      '.next/static/chunks/app/page-*.js',
      '!.next/static/chunks/framework-*.js',
      '!.next/static/chunks/polyfills-*.js',
      '!.next/static/chunks/main-!(app)*.js',
      '!.next/static/chunks/*.*.js',
    ],
  },
  { name: 'core', path: ['.next/static/chunks/*.*.js', '!.next/static/chunks/655.*.js', '!.next/static/chunks/826.*.js', '!.next/static/chunks/models.*.js'] },
  { name: 'models', path: '.next/static/chunks/models.*.js' },
]

let n = 0
/** A web root with `.size-limit.json` and the given chunk files under `.next/static/chunks`. */
function webRoot(chunks: readonly string[], budgets: readonly SizeLimitEntry[] = BUDGETS): string {
  const root = path.join(tmp, `case-${n++}`)
  for (const name of chunks) {
    const file = path.join(root, '.next', 'static', 'chunks', ...name.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `/* ${name} */ console.log(${JSON.stringify(name)})`)
  }
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, '.size-limit.json'), JSON.stringify(budgets))
  return root
}

const BUDGETED = ['webpack-1a.js', 'main-app-2b.js', 'app/page-3c.js', '63d2ba32.4d.js', 'three.5e.js', 'models.6f.js']

describe('checkCoverage', () => {
  it('passes a build where every chunk has one budget or is never downloaded, and says which', async () => {
    const report = await checkCoverage(webRoot([...BUDGETED, ...NEVER_DOWNLOADED]), 'win32')
    expect(report.problems).toEqual([])
    const owner = Object.fromEntries(report.rows.map((row) => [row.file, row.budgets.join('+') || 'none']))
    expect(owner).toMatchObject({
      'webpack-1a.js': 'initial',
      'main-app-2b.js': 'initial',
      'app/page-3c.js': 'initial',
      '63d2ba32.4d.js': 'core',
      'three.5e.js': 'core',
      'models.6f.js': 'models',
      'main-63ead8bdb46983ac.js': 'none',
      '655.da897ed6c3886fd7.js': 'none',
    })
    expect(report.rows.every((row) => row.gzipBytes > 0)).toBe(true)
  })

  it('fails on a chunk no budget counts, such as an App Router error boundary', async () => {
    const report = await checkCoverage(webRoot([...BUDGETED, ...NEVER_DOWNLOADED, 'app/error-7a.js']), 'win32')
    expect(report.problems).toEqual(['app/error-7a.js is counted by no budget'])
  })

  it('fails on a chunk two budgets count', async () => {
    const overlapping = [...BUDGETS, { name: 'everything lazy', path: '.next/static/chunks/*.*.js' }]
    const report = await checkCoverage(webRoot([...BUDGETED, ...NEVER_DOWNLOADED], overlapping), 'win32')
    expect(report.problems).toContain('three.5e.js is counted by 2 budgets: core, everything lazy')
  })

  it('on Windows, fails when webpack renumbers the Pages Router chunks: the pinned exclusion is stale and the new id joins core', async () => {
    const renumbered = NEVER_DOWNLOADED.filter((file) => !file.startsWith('826.'))
    const report = await checkCoverage(webRoot([...BUDGETED, ...renumbered, '901.aa.js']), 'win32')
    expect(report.problems).toEqual(['exclusion matches no file (stale): core: !.next/static/chunks/826.*.js'])
  })

  it('on Linux, where the Pages Router code stays in main-*, passes without the 655 and 826 chunks', async () => {
    const linux = NEVER_DOWNLOADED.filter((file) => !/^(?:655|826)\./.test(file))
    expect((await checkCoverage(webRoot([...BUDGETED, ...linux]), 'linux')).problems).toEqual([])
    // Any other stale exclusion still fails there.
    const noPolyfills = linux.filter((file) => !file.startsWith('polyfills-'))
    expect((await checkCoverage(webRoot([...BUDGETED, ...noPolyfills]), 'linux')).problems).toContain(
      'exclusion matches no file (stale): initial: !.next/static/chunks/polyfills-*.js',
    )
  })

  it('names only the Pages Router ids as Windows-only', () => {
    expect([...WINDOWS_ONLY_EXCLUSIONS]).toEqual(['.next/static/chunks/655.*.js', '.next/static/chunks/826.*.js'])
  })

  it('fails when a never-downloaded rule no longer matches anything', async () => {
    const report = await checkCoverage(webRoot([...BUDGETED, ...NEVER_DOWNLOADED.filter((file) => !file.startsWith('polyfills-'))]), 'win32')
    expect(report.problems).toEqual([
      'exclusion matches no file (stale): initial: !.next/static/chunks/polyfills-*.js',
      expect.stringMatching(/^never-downloaded rule .*polyfills.* matches no chunk/),
    ])
  })

  it('fails when there is no build to check', async () => {
    const report = await checkCoverage(webRoot([]))
    expect(report.problems).toEqual([expect.stringMatching(/no chunks under .*run `npm run build` first/)])
  })

  it('has one test chunk per never-downloaded rule', () => {
    for (const [pattern] of NOT_DOWNLOADED) expect(NEVER_DOWNLOADED.some((file) => pattern.test(file))).toBe(true)
  })
})

describe('main', () => {
  it('exits 0 on a covered build and 1 on a gap, printing the table either way', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await main(webRoot([...BUDGETED, ...NEVER_DOWNLOADED]))).toBe(0)
    expect(await main(webRoot([...BUDGETED, ...NEVER_DOWNLOADED, 'app/global-error-8b.js']))).toBe(1)
    expect(log.mock.calls.at(-1)?.[0]).toContain('FAIL app/global-error-8b.js is counted by no budget')
    log.mockRestore()
  })

  it('fails closed when there is no .size-limit.json', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = path.join(tmp, 'no-config')
    mkdirSync(root, { recursive: true })
    expect(await main(root)).toBe(1)
    error.mockRestore()
  })
})
