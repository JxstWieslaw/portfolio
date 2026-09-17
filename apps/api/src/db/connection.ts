import { Logger } from '@nestjs/common'
import { Pool } from 'pg'

const logger = new Logger('Postgres')

/**
 * One pool per process. Neon closes idle connections server-side; without an `error` listener,
 * that surfaces as an unhandled 'error' event and kills the process.
 */
export function createPool(connectionString: string, max = 5): Pool {
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  })
  pool.on('error', (error) => {
    logger.warn(`Idle Postgres client error: ${error.message}`)
  })
  return pool
}
