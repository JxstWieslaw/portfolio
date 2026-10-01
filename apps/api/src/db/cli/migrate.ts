import { runMigrateCli } from '../migrations/cli'

runMigrateCli(
  process.argv.slice(2),
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
  process.env,
).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
