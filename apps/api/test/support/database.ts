import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

export interface TestDatabase {
  url: string
  drop(): Promise<void>
}

async function onServer(baseUrl: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(statement)
  } finally {
    await client.end()
  }
}

/** A fresh, empty database per test file, so files never see each other's rows or schema. */
export async function createTestDatabase(baseUrl: string): Promise<TestDatabase> {
  // Generated from hex only, so it is safe to interpolate into DDL.
  const name = `test_${randomBytes(6).toString('hex')}`
  await onServer(baseUrl, `create database ${name}`)
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    drop: () => onServer(baseUrl, `drop database if exists ${name} with (force)`),
  }
}
