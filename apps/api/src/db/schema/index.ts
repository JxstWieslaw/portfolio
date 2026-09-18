import * as content from './content'
import * as seedRunsModule from './seed-runs'

export * from './content'
export * from './seed-runs'

/** Every table, for `drizzle(pool, { schema })`. */
export const schema = { ...content, ...seedRunsModule }
