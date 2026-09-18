import { describe, expect, it } from 'vitest'
import { accessExclusiveStatements, splitStatements } from './locks'

describe('splitStatements', () => {
  it('splits on semicolons and ignores comments, including Drizzle breakpoints', () => {
    const sql = 'CREATE TABLE "a" (\n  "id" int\n);\n--> statement-breakpoint\n-- note; not a statement\nDROP TABLE "b";'
    expect(splitStatements(sql)).toEqual(['CREATE TABLE "a" ( "id" int )', 'DROP TABLE "b"'])
  })
})

describe('accessExclusiveStatements', () => {
  it.each([
    'ALTER TABLE "projects" ADD COLUMN "x" text',
    'DROP TABLE "projects"',
    'DROP INDEX "projects_sort_idx"',
    'TRUNCATE "events"',
    'LOCK TABLE "projects"',
    'VACUUM FULL "events"',
    'REINDEX TABLE "projects"',
    'CLUSTER "projects"',
    'REFRESH MATERIALIZED VIEW "rollup"',
  ])('flags %s', (statement) => {
    expect(accessExclusiveStatements(`${statement};`)).toEqual([statement])
  })

  it.each([
    'CREATE TABLE "a" ("id" int)',
    'CREATE INDEX CONCURRENTLY "i" ON "a" ("id")',
    'DROP INDEX CONCURRENTLY "i"',
    'REINDEX TABLE CONCURRENTLY "projects"',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY "rollup"',
    'INSERT INTO "a" VALUES (1)',
  ])('does not flag %s', (statement) => {
    expect(accessExclusiveStatements(`${statement};`)).toEqual([])
  })
})
