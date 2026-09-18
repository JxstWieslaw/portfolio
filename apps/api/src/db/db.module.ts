import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { ENV, type Env } from '../config/env'
import { createPool } from './connection'
import { schema } from './schema'

export const PG_POOL = Symbol('PG_POOL')
export const DB = Symbol('DB')

export type Database = NodePgDatabase<typeof schema>

/** Closes the pool on SIGTERM so in-flight queries finish and Neon sees clean disconnects. */
@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env): Pool => createPool(env.DATABASE_URL, env.DB_POOL_MAX),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    PoolCloser,
  ],
  exports: [PG_POOL, DB],
})
export class DbModule {}
