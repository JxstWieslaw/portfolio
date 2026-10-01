import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** Content deploy history (spec §4). One row per seed run, dry runs included. */
export const seedRuns = pgTable('seed_runs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  gitSha: text('git_sha').notNull(),
  contentHash: text('content_hash').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  dryRun: boolean('dry_run').notNull(),
  result: jsonb('result').notNull(),
})
