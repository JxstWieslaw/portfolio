import { Controller, Get, Inject, NotFoundException, UseInterceptors } from '@nestjs/common'
import type { Domain, Experience, Profile, SkillGroup } from '@repo/contracts'
import { PublicCacheInterceptor } from '../http/cache'
import { CONTENT_READER, type ContentReader } from './content.reader'

@Controller('v1')
@UseInterceptors(PublicCacheInterceptor)
export class ContentController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get('profile')
  async profile(): Promise<Profile> {
    const profile = await this.content.getProfile()
    if (profile === null) throw new NotFoundException('The profile has not been seeded yet.')
    return profile
  }

  @Get('domains')
  domains(): Promise<Domain[]> {
    return this.content.listDomains()
  }

  @Get('experience')
  experience(): Promise<Experience[]> {
    return this.content.listExperience()
  }

  @Get('skills')
  skills(): Promise<SkillGroup[]> {
    return this.content.listSkillGroups()
  }
}
