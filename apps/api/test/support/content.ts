import { fileURLToPath } from 'node:url'

/** The repository's real `content/` — the same files apps/web builds from. */
export const REPO_CONTENT_DIR = fileURLToPath(new URL('../../../../content', import.meta.url))
