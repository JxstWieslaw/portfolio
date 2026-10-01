import { z } from 'zod'
import { slugSchema } from './content.js'

/**
 * Wire-level shapes of the public API. Response bodies are the content types themselves
 * (`Project`, `Profile`, …); this module holds only what exists because of HTTP.
 */

/** A page of results. `nextCursor` is opaque and `null` on the last page. */
export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable() })
}
export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

/** `GET /v1/projects` query. Strict: an unknown parameter is a 422, not silently ignored. */
export const projectListQuerySchema = z
  .object({
    domain: slugSchema.optional(),
    featured: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict()
export type ProjectListQuery = z.output<typeof projectListQuerySchema>

/** RFC 9457 Problem Details, as emitted by the API's global exception filter. */
export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().min(1),
  requestId: z.string().min(1),
  errors: z
    .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
    .optional(),
})
export type ProblemDetails = z.infer<typeof problemDetailsSchema>

export const healthSchema = z.object({ status: z.literal('ok') })

export const readinessSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  checks: z.object({ postgres: z.enum(['ok', 'failed']) }),
})
export type Readiness = z.infer<typeof readinessSchema>
