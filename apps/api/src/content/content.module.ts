import { Module } from '@nestjs/common'
import { ContentController } from './content.controller'
import { CONTENT_READER, PostgresContentReader } from './content.reader'
import { ProjectsController } from './projects.controller'

@Module({
  controllers: [ContentController, ProjectsController],
  providers: [{ provide: CONTENT_READER, useClass: PostgresContentReader }],
})
export class ContentModule {}
