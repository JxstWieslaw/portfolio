import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { Profile, Project } from '@repo/contracts'

/**
 * Content tables — seeded from git, never written at runtime (spec §4). Every parent row carries
 * `content_hash`, so a seed run is idempotent and drift between git and the database is
 * detectable. Child rows (outcomes, skills) are covered by their parent's hash.
 */
const seeded = {
  contentHash: text('content_hash').notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
}

export const profile = pgTable(
  'profile',
  {
    id: smallint('id').primaryKey().default(1),
    name: text('name').notNull(),
    headline: text('headline').notNull(),
    sub: text('sub').notNull(),
    location: text('location').notNull(),
    email: text('email').notNull(),
    emailPlaceholder: boolean('email_placeholder').notNull().default(false),
    availability: text('availability').notNull(),
    roles: jsonb('roles').$type<Profile['roles']>().notNull(),
    links: jsonb('links').$type<Profile['links']>().notNull(),
    kpis: jsonb('kpis').$type<Profile['kpis']>().notNull(),
    ...seeded,
  },
  (t) => [check('profile_singleton', sql`${t.id} = 1`)],
)

export const domains = pgTable(
  'domains',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    blurb: text('blurb').notNull(),
    accent: text('accent').notNull(),
    position: integer('position').notNull(),
    ...seeded,
  },
  (t) => [check('domains_accent', sql`${t.accent} in ('violet', 'cyan')`)],
)

export const projects = pgTable(
  'projects',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id),
    role: text('role').notNull(),
    periodFrom: text('period_from').notNull(),
    periodTo: text('period_to'),
    summary: text('summary').notNull(),
    stack: text('stack').array().notNull(),
    visibility: text('visibility').notNull(),
    featured: boolean('featured').notNull(),
    sortOrder: integer('sort_order').notNull(),
    links: jsonb('links').$type<Project['links']>().notNull(),
    formation: text('formation').notNull(),
    placeholder: boolean('placeholder').notNull(),
    ...seeded,
  },
  (t) => [
    // `order` is unique in content (enforced by the seed), so it alone is the pagination key.
    uniqueIndex('projects_sort_order_key').on(t.sortOrder),
    index('projects_domain_idx').on(t.domainId),
    check('projects_visibility', sql`${t.visibility} in ('public', 'private', 'client')`),
  ],
)

export const projectOutcomes = pgTable(
  'project_outcomes',
  {
    projectSlug: text('project_slug')
      .notNull()
      .references(() => projects.slug, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    placeholder: boolean('placeholder').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectSlug, t.position] })],
)

export const experiences = pgTable('experiences', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  title: text('title').notNull(),
  periodFrom: text('period_from').notNull(),
  periodTo: text('period_to'),
  location: text('location'),
  highlights: text('highlights').array().notNull(),
  placeholder: boolean('placeholder').notNull(),
  position: integer('position').notNull(),
  ...seeded,
})

export const skillGroups = pgTable('skill_groups', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  position: integer('position').notNull(),
  ...seeded,
})

export const skills = pgTable(
  'skills',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => skillGroups.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    level: text('level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.position] }),
    check('skills_level', sql`${t.level} in ('core', 'working', 'familiar')`),
  ],
)
