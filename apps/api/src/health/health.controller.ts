import { Controller, Get, Header, Inject, Res } from '@nestjs/common'
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import type { Pool } from 'pg'
import type { z } from 'zod'
import type { Readiness } from '@repo/contracts'
import { healthSchema as healthResponse, readinessSchema } from '@repo/contracts'
import { PG_POOL } from '../db/db.module'
import { zodToOpenApi } from '../openapi/openapi'
import { probePostgres } from './readiness'

@ApiTags('operations')
@Controller('v1')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Liveness. Touches nothing, so a slow database never gets a healthy instance restarted. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'Liveness', schema: zodToOpenApi(healthResponse) })
  health(): z.infer<typeof healthResponse> {
    return { status: 'ok' }
  }

  /** Readiness. Postgres only in M1; GCS joins in M4 (plan refinement 5). */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'Ready to serve', schema: zodToOpenApi(readinessSchema) })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable', schema: zodToOpenApi(readinessSchema) })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const postgres = await probePostgres(this.pool)
    res.status(postgres ? 200 : 503)
    return { status: postgres ? 'ready' : 'unavailable', checks: { postgres: postgres ? 'ok' : 'failed' } }
  }
}
