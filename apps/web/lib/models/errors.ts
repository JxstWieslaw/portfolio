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

/** Leaves `data-models-failed >= 1` and `data-models-last-error="slot-crashed"` behind after a crashed slot is disposed (dispose clears its own markers). */
export function markSlotCrashed(): void {
  const data = document.documentElement.dataset
  data.modelsFailed = String(Math.max(1, Number(data.modelsFailed) || 0))
  data.modelsLastError = 'slot-crashed'
}
