import { type DynamicModule, Module } from '@nestjs/common'
import { ConfigModule } from './config/config.module'
import type { Env } from './config/env'
import { HealthController } from './health/health.controller'

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(env)],
      controllers: [HealthController],
    }
  }
}
