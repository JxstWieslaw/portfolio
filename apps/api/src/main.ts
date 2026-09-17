import 'reflect-metadata'
import { createApp } from './app'
import { InvalidEnvError, loadEnv } from './config/env'

async function main(): Promise<void> {
  const env = loadEnv(process.env)
  const app = await createApp(env)
  await app.listen(env.PORT, '0.0.0.0')
}

main().catch((error: unknown) => {
  // No logger exists yet on this path. Exit non-zero so Cloud Run marks the revision failed.
  console.error(error instanceof InvalidEnvError ? error.message : error)
  process.exit(1)
})
