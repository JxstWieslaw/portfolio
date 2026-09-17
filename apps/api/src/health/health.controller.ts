import { Controller, Get, Header } from '@nestjs/common'
import type { z } from 'zod'
import type { healthSchema } from '@repo/contracts'

@Controller('v1')
export class HealthController {
  /** Liveness. Touches nothing, so a slow database never gets a healthy instance restarted. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): z.infer<typeof healthSchema> {
    return { status: 'ok' }
  }
}
