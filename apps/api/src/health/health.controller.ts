import { Controller, Get, Header, Inject, Res } from '@nestjs/common'
import type { Response } from 'express'
import type { Pool } from 'pg'
import type { z } from 'zod'
import type { healthSchema, Readiness } from '@repo/contracts'
import { PG_POOL } from '../db/db.module'
import { probePostgres } from './readiness'

@Controller('v1')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Liveness. Touches nothing, so a slow database never gets a healthy instance restarted. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): z.infer<typeof healthSchema> {
    return { status: 'ok' }
  }

  /** Readiness. Postgres only in M1; GCS joins in M4 (plan refinement 5). */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const postgres = await probePostgres(this.pool)
    res.status(postgres ? 200 : 503)
    return { status: postgres ? 'ready' : 'unavailable', checks: { postgres: postgres ? 'ok' : 'failed' } }
  }
}
