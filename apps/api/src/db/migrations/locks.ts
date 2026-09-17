/**
 * Statement splitting for *display and analysis only* — migrations always execute exactly as
 * written. The split is on `;` after stripping `--` comments, which is correct for the DDL this
 * repo writes; it is not a general SQL parser (a `;` inside a string or function body would
 * split early, which can only over-report, never hide, a lock).
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement !== '')
}

/**
 * Forms that take an ACCESS EXCLUSIVE lock, blocking reads on the table while they run.
 * Conservative: every `ALTER TABLE` is flagged, although a few forms take weaker locks.
 */
const ACCESS_EXCLUSIVE: readonly RegExp[] = [
  /^ALTER TABLE\b/i,
  /^DROP TABLE\b/i,
  /^DROP INDEX (?!CONCURRENTLY\b)/i,
  /^TRUNCATE\b/i,
  /^LOCK TABLE\b/i,
  /^CLUSTER\b/i,
  /^VACUUM FULL\b/i,
  /^REINDEX (?!.*\bCONCURRENTLY\b)/i,
  /^REFRESH MATERIALIZED VIEW (?!CONCURRENTLY\b)/i,
]

export function accessExclusiveStatements(sql: string): string[] {
  return splitStatements(sql).filter((statement) => ACCESS_EXCLUSIVE.some((pattern) => pattern.test(statement)))
}
