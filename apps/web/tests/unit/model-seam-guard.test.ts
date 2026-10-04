// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/** The CI guard's positive control: it must catch a leak, pass a clean build, and refuse to pass when it cannot look. */
const script = join(process.cwd(), 'scripts/check-no-model-seam.sh')
const run = (dir: string) => spawnSync('bash', [script, dir], { encoding: 'utf8' })
const bashAvailable = spawnSync('bash', ['-c', 'true']).status === 0
const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'seam-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chunks'))
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe.skipIf(!bashAvailable)('check-no-model-seam.sh', () => {
  it('passes a clean build', () => {
    const dir = temp()
    writeFileSync(join(dir, 'chunks', 'a.js'), 'console.log("clean")')
    expect(run(dir).status).toBe(0)
  })

  it.each(['__ASSEMBLY_MODELS_TEST__', '__ASSEMBLY_DEBUG__'])('fails when %s is in a chunk', (marker) => {
    const dir = temp()
    writeFileSync(join(dir, 'chunks', 'a.js'), `window.${marker}={}`)
    const result = run(dir)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('a.js')
  })

  it('fails (does not pass) when the directory is missing', () => {
    expect(run(join(tmpdir(), 'does-not-exist-seam')).status).toBe(1)
  })
})
