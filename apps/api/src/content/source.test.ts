import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_CONTENT_DIR } from '../../test/support/content'
import { ContentIntegrityError, loadContentFromDir } from './source'

async function copyOfRepoContent(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'content-'))
  await cp(REPO_CONTENT_DIR, dir, { recursive: true })
  return dir
}

async function editJson(dir: string, file: string, edit: (value: unknown[]) => unknown[]): Promise<void> {
  const path = join(dir, file)
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown[]
  await writeFile(path, JSON.stringify(edit(value)))
}

describe('loadContentFromDir', () => {
  it("parses the repository's real content through the contracts", async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    expect(bundle.domains.length).toBeGreaterThan(0)
    expect(bundle.projects.length).toBeGreaterThan(0)
    expect(bundle.profile.kpis.every((kpi) => kpi.group === 'hero' || kpi.group === 'proof')).toBe(true)
  })

  it('names the file and field when content is malformed', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, ...rest]) => [{ ...(first as object), slug: 'Not Kebab' }, ...rest])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/projects\.json.*slug/)
  })

  it('rejects a project whose domain does not exist', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, ...rest]) => [{ ...(first as object), domain: 'nowhere' }, ...rest])
    await expect(loadContentFromDir(dir)).rejects.toThrow(ContentIntegrityError)
  })

  it('rejects duplicate slugs', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', (projects) => [...projects, projects[0]])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/duplicate project slug/i)
  })

  it('rejects duplicate project order, which pagination relies on', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, second, ...rest]) => [
      first,
      { ...(second as object), order: (first as { order: number }).order },
      ...rest,
    ])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/duplicate project order/i)
  })
})
