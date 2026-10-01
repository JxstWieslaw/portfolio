import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { pageSchema, problemDetailsSchema, projectListQuerySchema } from './api.js'

describe('projectListQuerySchema', () => {
  it('defaults limit to 20 and leaves filters unset', () => {
    expect(projectListQuerySchema.parse({})).toEqual({ limit: 20 })
  })

  it('coerces query-string values', () => {
    expect(projectListQuerySchema.parse({ featured: 'true', limit: '5', domain: 'healthcare' })).toEqual({
      featured: true,
      limit: 5,
      domain: 'healthcare',
    })
    expect(projectListQuerySchema.parse({ featured: 'false' }).featured).toBe(false)
  })

  it.each([
    ['limit above 50', { limit: '51' }],
    ['limit below 1', { limit: '0' }],
    ['a non-boolean featured', { featured: 'yes' }],
    ['a domain that is not kebab-case', { domain: 'Health Care' }],
    ['an unknown parameter', { sort: 'name' }],
  ])('rejects %s', (_label, query) => {
    expect(projectListQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe('pageSchema', () => {
  it('wraps items with a nullable cursor', () => {
    const page = pageSchema(z.string())
    expect(page.parse({ data: ['a'], nextCursor: null })).toEqual({ data: ['a'], nextCursor: null })
    expect(page.safeParse({ data: ['a'] }).success).toBe(false)
  })
})

describe('problemDetailsSchema', () => {
  it('accepts the RFC 9457 shape the API emits', () => {
    const problem = {
      type: 'https://api.example.dev/problems/validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: 'limit: Number must be less than or equal to 50',
      instance: '/v1/projects',
      requestId: '01J8Z3K4M5N6P7Q8R9S0T1V2W3',
      errors: [{ path: ['limit'], message: 'Number must be less than or equal to 50' }],
    }
    expect(problemDetailsSchema.parse(problem)).toEqual(problem)
  })
})
