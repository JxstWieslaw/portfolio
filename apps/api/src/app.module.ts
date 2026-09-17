import { type DynamicModule, Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { ConfigModule } from './config/config.module'
import { ENV, type Env } from './config/env'
import { DbModule } from './db/db.module'
import { HealthController } from './health/health.controller'
import { pinoHttpOptions } from './http/logging'

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRootAsync({
          inject: [ENV],
          useFactory: (config: Env) => ({ pinoHttp: pinoHttpOptions(config) }),
        }),
        DbModule,
      ],
      controllers: [HealthController],
    }
  }
}
