import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Writes migration directories into a fresh temp dir. Omit `down` to test the reversibility rule. */
export async function writeMigrations(files: Record<string, { up: string; down?: string }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'migrations-'))
  for (const [id, { up, down }] of Object.entries(files)) {
    await mkdir(join(root, id))
    await writeFile(join(root, id, 'up.sql'), up)
    if (down !== undefined) await writeFile(join(root, id, 'down.sql'), down)
  }
  return root
}
