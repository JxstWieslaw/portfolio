import { inArray, sql } from 'drizzle-orm'
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { Database } from '../db/db.module'
import {
  domains,
  experiences,
  profile,
  projectOutcomes,
  projects,
  type schema,
  seedRuns,
  skillGroups,
  skills,
} from '../db/schema'
import { contentHash } from './hash'
import { type SeedRows, toRows } from './rows'
import type { ContentBundle } from './source'

/** A database handle or a transaction — both expose the query builders the seed uses. */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>

export type SeedTable = 'profile' | 'domains' | 'projects' | 'experiences' | 'skill_groups'

export interface TablePlan {
  inserted: string[]
  updated: string[]
  deleted: string[]
  unchanged: number
}

export type SeedPlan = Record<SeedTable, TablePlan>

export interface SeedOutcome {
  plan: SeedPlan
  contentHash: string
  seedRunId: number
  dryRun: boolean
}

function diff(desired: { key: string; hash: string }[], existing: { key: string; hash: string }[]): TablePlan {
  const current = new Map(existing.map((row) => [row.key, row.hash]))
  const wanted = new Set(desired.map((row) => row.key))
  const plan: TablePlan = { inserted: [], updated: [], deleted: [], unchanged: 0 }
  for (const { key, hash } of desired) {
    const found = current.get(key)
    if (found === undefined) plan.inserted.push(key)
    else if (found !== hash) plan.updated.push(key)
    else plan.unchanged += 1
  }
  plan.deleted = existing.map((row) => row.key).filter((key) => !wanted.has(key)).sort()
  return plan
}

export async function planSeed(db: DbExecutor, rows: SeedRows): Promise<SeedPlan> {
  const [profileRows, domainRows, projectRows, experienceRows, groupRows] = await Promise.all([
    db.select({ key: sql<string>`${profile.id}::text`, hash: profile.contentHash }).from(profile),
    db.select({ key: domains.id, hash: domains.contentHash }).from(domains),
    db.select({ key: projects.slug, hash: projects.contentHash }).from(projects),
    db.select({ key: experiences.id, hash: experiences.contentHash }).from(experiences),
    db.select({ key: skillGroups.id, hash: skillGroups.contentHash }).from(skillGroups),
  ])
  return {
    profile: diff([{ key: '1', hash: rows.profile.contentHash }], profileRows),
    domains: diff(rows.domains.map((d) => ({ key: d.id, hash: d.contentHash })), domainRows),
    projects: diff(rows.projects.map((p) => ({ key: p.row.slug, hash: p.row.contentHash })), projectRows),
    experiences: diff(rows.experiences.map((e) => ({ key: e.id, hash: e.contentHash })), experienceRows),
    skill_groups: diff(rows.skillGroups.map((g) => ({ key: g.row.id, hash: g.row.contentHash })), groupRows),
  }
}

export function hasChanges(plan: SeedPlan): boolean {
  return Object.values(plan).some((t) => t.inserted.length + t.updated.length + t.deleted.length > 0)
}

function changedKeys(plan: TablePlan): Set<string> {
  return new Set([...plan.inserted, ...plan.updated])
}

const touched = { seededAt: sql`now()` }

async function applyPlan(tx: DbExecutor, rows: SeedRows, plan: SeedPlan): Promise<void> {
  if (changedKeys(plan.profile).size > 0) {
    await tx
      .insert(profile)
      .values(rows.profile)
      .onConflictDoUpdate({ target: profile.id, set: { ...rows.profile, ...touched } })
  }

  const domainChanges = changedKeys(plan.domains)
  for (const row of rows.domains.filter((d) => domainChanges.has(d.id))) {
    await tx.insert(domains).values(row).onConflictDoUpdate({ target: domains.id, set: { ...row, ...touched } })
  }

  const projectChanges = changedKeys(plan.projects)
  for (const { row, outcomes } of rows.projects.filter((p) => projectChanges.has(p.row.slug))) {
    await tx.insert(projects).values(row).onConflictDoUpdate({ target: projects.slug, set: { ...row, ...touched } })
    await tx.delete(projectOutcomes).where(inArray(projectOutcomes.projectSlug, [row.slug]))
    if (outcomes.length > 0) await tx.insert(projectOutcomes).values(outcomes)
  }
  // Projects go before domains: a removed domain may still be referenced by a removed project.
  if (plan.projects.deleted.length > 0) {
    await tx.delete(projects).where(inArray(projects.slug, plan.projects.deleted))
  }
  if (plan.domains.deleted.length > 0) {
    await tx.delete(domains).where(inArray(domains.id, plan.domains.deleted))
  }

  const experienceChanges = changedKeys(plan.experiences)
  for (const row of rows.experiences.filter((e) => experienceChanges.has(e.id))) {
    await tx
      .insert(experiences)
      .values(row)
      .onConflictDoUpdate({ target: experiences.id, set: { ...row, ...touched } })
  }
  if (plan.experiences.deleted.length > 0) {
    await tx.delete(experiences).where(inArray(experiences.id, plan.experiences.deleted))
  }

  const groupChanges = changedKeys(plan.skill_groups)
  for (const { row, skills: items } of rows.skillGroups.filter((g) => groupChanges.has(g.row.id))) {
    await tx
      .insert(skillGroups)
      .values(row)
      .onConflictDoUpdate({ target: skillGroups.id, set: { ...row, ...touched } })
    await tx.delete(skills).where(inArray(skills.groupId, [row.id]))
    if (items.length > 0) await tx.insert(skills).values(items)
  }
  if (plan.skill_groups.deleted.length > 0) {
    await tx.delete(skillGroups).where(inArray(skillGroups.id, plan.skill_groups.deleted))
  }
}

/**
 * Plans and (unless dry) applies the seed in one transaction, then records the run in
 * `seed_runs`. Idempotent: unchanged rows are not written, so `seeded_at` means "last changed".
 */
export async function runSeed(
  db: Database,
  bundle: ContentBundle,
  options: { gitSha: string; dryRun: boolean },
): Promise<SeedOutcome> {
  const rows = toRows(bundle)
  const hash = contentHash(bundle)
  return db.transaction(async (tx) => {
    const plan = await planSeed(tx, rows)
    if (!options.dryRun) await applyPlan(tx, rows, plan)
    const [run] = await tx
      .insert(seedRuns)
      .values({ gitSha: options.gitSha, contentHash: hash, dryRun: options.dryRun, result: plan })
      .returning({ id: seedRuns.id })
    if (run === undefined) throw new Error('seed_runs insert returned no row')
    return { plan, contentHash: hash, seedRunId: run.id, dryRun: options.dryRun }
  })
}

/** True when the database no longer matches git. */
export async function detectDrift(db: DbExecutor, bundle: ContentBundle): Promise<boolean> {
  return hasChanges(await planSeed(db, toRows(bundle)))
}
