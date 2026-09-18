import { Controller, Get, Inject, NotFoundException, Param, Query, UseInterceptors } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { pageSchema, projectSchema, type Page, type Project, type ProjectListQuery, projectListQuerySchema, slugSchema } from '@repo/contracts'
import { ApiProblem, zodToOpenApi } from '../openapi/openapi'
import { PublicCacheInterceptor } from '../http/cache'
import { ZodValidationPipe } from '../http/validation'
import { CONTENT_READER, type ContentReader } from './content.reader'

const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$'

@ApiTags('content')
@Controller('v1/projects')
@UseInterceptors(PublicCacheInterceptor)
export class ProjectsController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get()
  @ApiOkResponse({ schema: zodToOpenApi(pageSchema(projectSchema)) })
  @ApiQuery({ name: 'domain', required: false, schema: { type: 'string', pattern: SLUG_PATTERN } })
  @ApiQuery({ name: 'featured', required: false, schema: { type: 'string', enum: ['true', 'false'] } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque; from a previous page', schema: { type: 'string' } })
  @ApiProblem(422)
  list(@Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery): Promise<Page<Project>> {
    return this.content.listProjects(query)
  }

  @Get(':slug')
  @ApiParam({ name: 'slug', schema: { type: 'string', pattern: SLUG_PATTERN } })
  @ApiOkResponse({ schema: zodToOpenApi(projectSchema) })
  @ApiProblem(404, 422)
  async get(@Param('slug', new ZodValidationPipe(slugSchema)) slug: string): Promise<Project> {
    const project = await this.content.getProject(slug)
    if (project === null) throw new NotFoundException(`No project named ${slug}.`)
    return project
  }
}
