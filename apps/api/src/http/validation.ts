import type { PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

export interface ValidationIssue {
  path: (string | number)[]
  message: string
}

export class ValidationFailedError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; '),
    )
    this.name = 'ValidationFailedError'
  }
}

/**
 * Validates a param, query or body against a `@repo/contracts` schema — the same definition the
 * OpenAPI document and the web app use. Replaces `nestjs-zod` (see plan refinement 2).
 */
export class ZodValidationPipe<T extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value)
    if (result.success) return result.data
    throw new ValidationFailedError(
      result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    )
  }
}
