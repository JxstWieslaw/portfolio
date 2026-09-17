import { Controller, Get, Inject, NotFoundException, Param, Query, UseInterceptors } from '@nestjs/common'
import { type Page, type Project, type ProjectListQuery, projectListQuerySchema, slugSchema } from '@repo/contracts'
import { PublicCacheInterceptor } from '../http/cache'
import { ZodValidationPipe } from '../http/validation'
import { CONTENT_READER, type ContentReader } from './content.reader'

@Controller('v1/projects')
@UseInterceptors(PublicCacheInterceptor)
export class ProjectsController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get()
  list(@Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery): Promise<Page<Project>> {
    return this.content.listProjects(query)
  }

  @Get(':slug')
  async get(@Param('slug', new ZodValidationPipe(slugSchema)) slug: string): Promise<Project> {
    const project = await this.content.getProject(slug)
    if (project === null) throw new NotFoundException(`No project named ${slug}.`)
    return project
  }
}
