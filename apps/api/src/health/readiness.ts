import type { Pool } from 'pg'

/** Readiness: can this instance serve reads right now? Bounded, so a hung pool fails fast. */
export async function probePostgres(pool: Pool, timeoutMs = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      pool.query('select 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs)
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
