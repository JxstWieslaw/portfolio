import { Controller, Get, Inject, NotFoundException, UseInterceptors } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { domainSchema, experienceSchema, profileSchema, skillGroupSchema } from '@repo/contracts'
import type { Domain, Experience, Profile, SkillGroup } from '@repo/contracts'
import { ApiProblem, zodToOpenApi } from '../openapi/openapi'
import { PublicCacheInterceptor } from '../http/cache'
import { CONTENT_READER, type ContentReader } from './content.reader'

@ApiTags('content')
@Controller('v1')
@UseInterceptors(PublicCacheInterceptor)
export class ContentController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get('profile')
  @ApiOkResponse({ schema: zodToOpenApi(profileSchema) })
  @ApiProblem(404)
  async profile(): Promise<Profile> {
    const profile = await this.content.getProfile()
    if (profile === null) throw new NotFoundException('The profile has not been seeded yet.')
    return profile
  }

  @Get('domains')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(domainSchema)) })
  domains(): Promise<Domain[]> {
    return this.content.listDomains()
  }

  @Get('experience')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(experienceSchema)) })
  experience(): Promise<Experience[]> {
    return this.content.listExperience()
  }

  @Get('skills')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(skillGroupSchema)) })
  skills(): Promise<SkillGroup[]> {
    return this.content.listSkillGroups()
  }
}
