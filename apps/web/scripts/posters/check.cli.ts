import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkPosters } from './check'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const problems = await checkPosters(webRoot)
if (problems.length > 0) {
  for (const problem of problems) console.error(`posters:check: ${problem}`)
  process.exit(1)
}
console.log('posters:check: the hero posters match their sources, hashes, sizes and budgets')
