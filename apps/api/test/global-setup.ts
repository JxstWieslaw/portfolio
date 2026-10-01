import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

let container: StartedPostgreSqlContainer | undefined

/**
 * One Postgres for the whole integration run. CI sets TEST_DATABASE_URL to its service
 * container; locally Testcontainers starts the same major version Neon runs.
 */
export async function setup(project: TestProject): Promise<void> {
  let url = process.env['TEST_DATABASE_URL']
  if (url === undefined || url === '') {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    url = container.getConnectionUri()
  }
  project.provide('databaseUrl', url)
}

export async function teardown(): Promise<void> {
  await container?.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
