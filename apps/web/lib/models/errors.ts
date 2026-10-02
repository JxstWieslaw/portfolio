/**
 * Why a model did not load. The short code is published as
 * `html[data-models-last-error]` so a test (or a person with devtools) can tell
 * a bad hash from a dead network without reading logs.
 */
export type ModelErrorCode =
  | 'network'
  | 'integrity'
  | 'timeout'
  | 'size'
  | 'parse'
  | 'external-uri'
  | 'validation'
  | 'manifest'
  | 'missing'
  | 'compile'
  | 'unknown'

export class ModelLoadError extends Error {
  readonly code: ModelErrorCode
  constructor(code: ModelErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ModelLoadError'
    this.code = code
  }
}

export function errorCode(error: unknown): ModelErrorCode {
  return error instanceof ModelLoadError ? error.code : 'unknown'
}
