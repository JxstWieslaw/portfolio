import { type DynamicModule, Global, Module } from '@nestjs/common'
import { ENV, type Env } from './env'

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] }
  }
}
