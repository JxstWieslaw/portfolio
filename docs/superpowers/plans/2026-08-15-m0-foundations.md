# M0 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete, publishable, accessible 2D portfolio site — every section of `/` rendered with real content and designed fallbacks — before a single shader or API endpoint exists.

**Architecture:** A pnpm/Turborepo monorepo with `apps/web` (Next.js App Router) and `packages/contracts` (Zod schemas that will later be shared with the API). Content lives as JSON in `content/` at the repo root, validated through the contracts schemas by a single loader module (`lib/content.ts`) which is the one seam that M3 changes when MDX case-study bodies arrive. The persistent 3D layer is represented in M0 by `PosterLayer` — a pure CSS/SVG background with a per-section variant — behind the same component boundary that M2's WebGL canvas will occupy.

**Tech Stack:** pnpm workspaces · Turborepo · Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 · Zod · Vitest + React Testing Library · Playwright (+ axe) · Lighthouse CI · size-limit · GitHub Actions

**Spec:** [`docs/superpowers/specs/2026-08-15-portfolio-website-design.md`](../specs/2026-08-15-portfolio-website-design.md) (companion: [API service spec](../specs/2026-08-15-api-service-design.md), [design brief](../../claude-design-brief.md))

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node** ≥ 22.11 LTS. **pnpm** ≥ 9. All commands run from the repo root unless stated.
- **Platform:** development happens on Windows. Never use `&` for background processes in npm scripts — use `concurrently`. Never use `NODE_ENV=x cmd` inline — use `cross-env`.
- **TypeScript strict** everywhere: `strict: true`, `noUncheckedIndexedAccess: true`. No `any`, no non-null `!` assertions outside tests.
- **Theme is dark-only in M0.** Token names are semantic so a light theme is a later token swap.
- **Exact brand tokens** (from spec §5 / design brief §3 — copy verbatim, do not invent values):
  `--color-bg-0 #0D1117` · `--color-bg-1 #11161D` · `--color-bg-2 #161B22` · `--color-line-1 #1F2937` · `--color-line-2 #30363D` · `--color-fg-0 #F0F6FC` · `--color-fg-1 #C9D1D9` · `--color-fg-2 #8B949E` · `--color-fg-3 #6E7681` · `--color-violet-500 #7C3AED` · `--color-violet-400 #A78BFA` · `--color-violet-300 #C4B5FD` · `--color-cyan-400 #22D3EE` · `--color-cyan-300 #67E8F9` · `--color-success #3FB950` · `--color-warning #D29922` · `--color-danger #F85149`
- **Semantic accent rule:** violet = leadership/architecture; cyan = craft/3D. Never mix within one component.
- **Fonts:** Bricolage Grotesque (display), Geist (body), JetBrains Mono (labels/numerics). Loaded via `next/font` only; `display: swap`.
- **Spacing scale** 4px base: 4/8/12/16/24/32/48/64/96/128/192. **Radii** 6/12/20/full. **Borders** 1px.
- **Breakpoints:** design and test at 390, 834, 1440, 2560. Content max-width 1440 (bento 1600).
- **Nothing empty:** every content slot renders real copy, placeholder copy, or a designed fallback. No blank containers at any breakpoint. Placeholder content carries `placeholder: true` and is reported by `pnpm lint:content`.
- **Testimonials are the one exception** — that block hides entirely unless a real quote exists. Never fabricate a quote.
- **Accessibility:** AA contrast, visible focus rings (cyan, 2px, 2px offset), ≥44px tap targets, headings in order, `prefers-reduced-motion` honoured by every animated element.
- **No API calls in M0.** The contact form ships its offline state (`mailto:`) as its only state. `NEXT_PUBLIC_API_URL` does not exist yet.
- **Commit after every task** using conventional commits. Never `--no-verify`.

### Deliberate refinements of the spec (agreed, with rationale)

1. **No Velite in M0.** Spec §4.1 lists Velite for content. M0's content has no MDX bodies — case-study prose lands in M3 — so M0 loads JSON through Zod directly (zero extra dependency, no zod-version coupling with Velite). `lib/content.ts` is the single seam; M3 introduces Velite behind it without touching any component.
2. **`PosterLayer` is CSS/SVG in M0, images in M2.** The spec's committed poster PNGs are renders *of the formations*, which do not exist until M2. M0 ships a designed gradient/grain stand-in behind the same component API, so no placeholder binaries enter the repo.
3. **`packages/config` holds tsconfig + eslint only.** The spec lists Tailwind presets there too; with exactly one consuming app that is premature, so tokens live in `apps/web/app/globals.css` until a second consumer exists.

---

## File Structure

| File | Responsibility |
|---|---|
| `pnpm-workspace.yaml`, `turbo.json`, root `package.json` | Workspace + task graph |
| `packages/config/` | Shared `tsconfig.base.json`, ESLint flat config |
| `packages/contracts/src/content.ts` | Zod schemas + inferred types for all content. Canonical; the API imports these in M1 |
| `content/*.json` | Content source of truth (profile, domains, projects, experience, skills, writing) |
| `apps/web/lib/content.ts` | The **only** module that reads `content/`. Validates through contracts, exposes typed getters + derived KPIs |
| `apps/web/lib/placeholders.ts` | Placeholder detection shared by the linter and the UI |
| `apps/web/scripts/lint-content.ts` | CLI reporting placeholder content |
| `apps/web/app/globals.css` | Design tokens (`@theme`), base layer, focus rings |
| `apps/web/app/layout.tsx` | Fonts, `PosterLayer`, `Nav`, `Footer`, skip link |
| `apps/web/app/page.tsx` | Composes the nine `/` sections in order |
| `apps/web/components/layout/` | `Container`, `Section`, `SkipLink` |
| `apps/web/components/three/PosterLayer.tsx` | Fixed decorative background; M2 replaces internals |
| `apps/web/components/ui/` | `Button`, `Chip`, `Badge`, `KpiTile`, `Monogram` |
| `apps/web/components/sections/` | One file per section — `Hero`, `ProofStrip`, `SelectedWork`, `HowILead`, `Craft`, `Stack`, `Timeline`, `Writing`, `Contact` |
| `apps/web/components/cards/` | `ProjectCard`, `Pillar`, `TimelineItem`, `ArticleCard` |
| `apps/web/tests/` | `unit/` (Vitest), `e2e/` (Playwright + axe), `visual/` |
| `.github/workflows/ci.yml` | typecheck · lint · unit · build · e2e · a11y · budgets |

---

## Task 1: Monorepo foundation

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.gitignore`, `.nvmrc`
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint.config.mjs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: workspace root with `pnpm -w` scripts `build`, `dev`, `lint`, `typecheck`, `test`; `@repo/config` exposing `tsconfig.base.json` and `eslint.config.mjs`

- [ ] **Step 1: Initialise the workspace root**

Run from `portfolio/`:

```bash
cd portfolio
git checkout -b feat/m0-foundations
```

Create `package.json`:

```json
{
  "name": "portfolio",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22.11.0", "pnpm": ">=9" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "lint:content": "turbo run lint:content"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.2",
    "prettier": "^3.4.2"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `.npmrc`:

```
auto-install-peers=true
strict-peer-dependencies=false
```

Create `.nvmrc` containing `22`.

Create `.gitignore`:

```
node_modules/
.next/
.turbo/
dist/
coverage/
test-results/
playwright-report/
*.tsbuildinfo
.env
.env.local
.DS_Store
```

- [ ] **Step 2: Create the shared config package**

Create `packages/config/package.json`:

```json
{
  "name": "@repo/config",
  "version": "0.0.0",
  "private": true,
  "files": ["tsconfig.base.json", "eslint.config.mjs"],
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint": "./eslint.config.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint": "^9.17.0"
  }
}
```

Create `packages/config/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true
  }
}
```

Create `packages/config/eslint.config.mjs`:

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/.turbo/**'] }
)
```

- [ ] **Step 3: Configure the Turborepo task graph**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "../../content/**"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e": { "dependsOn": ["build"], "outputs": ["playwright-report/**"] },
    "lint:content": { "inputs": ["../../content/**"] }
  }
}
```

- [ ] **Step 4: Verify the workspace resolves**

```bash
pnpm install
pnpm -w exec turbo run typecheck --dry=json
```

Expected: install succeeds; the dry run prints a JSON task graph containing `@repo/config` with no errors. There are no tasks to execute yet — an empty `tasks` array in the output is correct at this point.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .npmrc .nvmrc .gitignore packages/config
git commit -m "chore: scaffold pnpm/turborepo workspace with shared config"
```

---

## Task 2: Content schemas (`packages/contracts`)

These Zod schemas are the canonical definition of the content model. M1's NestJS service imports this same package, so field names chosen here are load-bearing.

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/content.ts`, `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/content.test.ts`

**Interfaces:**
- Consumes: `@repo/config/tsconfig.base.json` (Task 1)
- Produces: package `@repo/contracts` exporting schemas `profileSchema`, `domainSchema`, `projectSchema`, `experienceSchema`, `skillGroupSchema`, `writingSchema` and inferred types `Profile`, `Domain`, `Project`, `Experience`, `SkillGroup`, `Writing`, `Visibility`, `FormationId`, `SkillLevel`

- [ ] **Step 1: Create the package**

`packages/contracts/package.json`:

```json
{
  "name": "@repo/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": { "zod": "^3.24.1" },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "eslint": "^9.17.0"
  }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

Create `packages/contracts/eslint.config.mjs`:

```js
export { default } from '@repo/config/eslint'
```

- [ ] **Step 2: Write the failing test**

`packages/contracts/src/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { projectSchema, profileSchema, skillGroupSchema } from './content.js'

const validProject = {
  slug: 'heycreator',
  name: 'heycreator',
  domain: 'creator-economy',
  role: 'Senior Software Engineer',
  period: { from: '2024-01' },
  summary: 'Creator-discovery platform with automated enrichment pipelines.',
  stack: ['Next.js', 'TypeScript', 'Firebase'],
  visibility: 'private',
  featured: true,
  order: 1,
}

describe('projectSchema', () => {
  it('accepts a valid project and defaults placeholder to false', () => {
    const parsed = projectSchema.parse(validProject)
    expect(parsed.placeholder).toBe(false)
    expect(parsed.stack).toHaveLength(3)
  })

  it('rejects an unknown visibility', () => {
    expect(() => projectSchema.parse({ ...validProject, visibility: 'secret' })).toThrow()
  })

  it('rejects an empty stack, because a card with no chips would render empty', () => {
    expect(() => projectSchema.parse({ ...validProject, stack: [] })).toThrow()
  })

  it('rejects a slug that is not kebab-case', () => {
    expect(() => projectSchema.parse({ ...validProject, slug: 'Hey Creator' })).toThrow()
  })
})

describe('profileSchema', () => {
  it('requires at least one role and one KPI', () => {
    expect(() =>
      profileSchema.parse({
        name: 'Wieslaw Samushonga',
        headline: 'x',
        sub: 'y',
        location: 'Harare, Zimbabwe',
        email: 'a@b.com',
        availability: 'Open to consulting & collaboration',
        roles: [],
        links: [],
        kpis: [],
      })
    ).toThrow()
  })
})

describe('skillGroupSchema', () => {
  it('defaults a skill level to working', () => {
    const parsed = skillGroupSchema.parse({
      id: 'languages',
      label: 'Languages',
      items: [{ name: 'TypeScript' }],
    })
    expect(parsed.items[0]?.level).toBe('working')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @repo/contracts test
```

Expected: FAIL — `Failed to resolve import "./content.js"`.

- [ ] **Step 4: Write the schemas**

`packages/contracts/src/content.ts`:

```ts
import { z } from 'zod'

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case')
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'must be YYYY-MM')

export const visibilitySchema = z.enum(['public', 'private', 'client'])
export type Visibility = z.infer<typeof visibilitySchema>

export const formationIdSchema = z.enum([
  'monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring', 'badge',
])
export type FormationId = z.infer<typeof formationIdSchema>

export const skillLevelSchema = z.enum(['core', 'working', 'familiar'])
export type SkillLevel = z.infer<typeof skillLevelSchema>

export const domainSchema = z.object({
  id: slug,
  label: z.string().min(1),
  blurb: z.string().min(1),
  accent: z.enum(['violet', 'cyan']),
})
export type Domain = z.infer<typeof domainSchema>

const metricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  placeholder: z.boolean().default(false),
})

export const projectSchema = z.object({
  slug,
  name: z.string().min(1),
  domain: slug,
  role: z.string().min(1),
  period: z.object({ from: yearMonth, to: yearMonth.optional() }),
  summary: z.string().min(1).max(280),
  stack: z.array(z.string().min(1)).min(1, 'at least one stack chip is required'),
  visibility: visibilitySchema,
  featured: z.boolean(),
  order: z.number().int().nonnegative(),
  outcome: z.array(metricSchema).default([]),
  links: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).default([]),
  formation: formationIdSchema.default('badge'),
  placeholder: z.boolean().default(false),
})
export type Project = z.infer<typeof projectSchema>

export const experienceSchema = z.object({
  org: z.string().min(1),
  title: z.string().min(1),
  period: z.object({ from: yearMonth, to: yearMonth.optional() }),
  location: z.string().optional(),
  highlights: z.array(z.string().min(1)).min(1),
  placeholder: z.boolean().default(false),
})
export type Experience = z.infer<typeof experienceSchema>

export const skillGroupSchema = z.object({
  id: slug,
  label: z.string().min(1),
  items: z
    .array(z.object({ name: z.string().min(1), level: skillLevelSchema.default('working') }))
    .min(1),
})
export type SkillGroup = z.infer<typeof skillGroupSchema>

export const writingSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  source: z.enum(['medium', 'other']),
  excerpt: z.string().min(1),
  placeholder: z.boolean().default(false),
})
export type Writing = z.infer<typeof writingSchema>

export const profileSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  sub: z.string().min(1),
  location: z.string().min(1),
  email: z.string().email(),
  availability: z.string().min(1),
  roles: z.array(z.object({
    org: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url().optional(),
  })).min(1),
  links: z.array(z.object({
    label: z.string().min(1),
    url: z.string().url(),
    kind: z.enum(['primary', 'secondary', 'elsewhere']),
  })).min(1),
  kpis: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    derived: z.enum(['domainsShipped']).optional(),
    placeholder: z.boolean().default(false),
  })).min(1),
})
export type Profile = z.infer<typeof profileSchema>
```

`packages/contracts/src/index.ts`:

```ts
export * from './content.js'
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts typecheck
```

Expected: 6 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add Zod content schemas shared with the future API"
```

---

## Task 3: `apps/web` scaffold — Next.js, tokens, fonts

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/eslint.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/tests/setup.ts`
- Create: `apps/web/app/globals.css`, `apps/web/app/fonts.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
- Test: `apps/web/tests/unit/tokens.test.ts`

**Interfaces:**
- Consumes: `@repo/config` (Task 1), `@repo/contracts` (Task 2)
- Produces: a running Next.js app; font variables `--font-display`, `--font-body`, `--font-mono`; all colour/spacing/radius tokens as Tailwind v4 `@theme` custom properties; `pnpm --filter web dev` serving on port 3000

- [ ] **Step 1: Create the app package**

`apps/web/package.json`:

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint:content": "tsx scripts/lint-content.ts"
  },
  "dependencies": {
    "@repo/contracts": "workspace:*",
    "geist": "^1.3.1",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.17.0",
    "eslint-config-next": "^16.0.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typedRoutes: true,
  // @repo/contracts ships TypeScript source rather than a build step, so Next must
  // compile it. Without this the build fails with "Unexpected token 'export'".
  transpilePackages: ['@repo/contracts'],
}

export default config
```

`apps/web/postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`apps/web/eslint.config.mjs`:

```js
import base from '@repo/config/eslint'
import next from 'eslint-config-next'

export default [...base, ...next()]
```

- [ ] **Step 2: Define design tokens**

`apps/web/app/globals.css` — values copied verbatim from Global Constraints:

```css
@import "tailwindcss";

@theme {
  --color-bg-0: #0D1117;
  --color-bg-1: #11161D;
  --color-bg-2: #161B22;
  --color-line-1: #1F2937;
  --color-line-2: #30363D;
  --color-fg-0: #F0F6FC;
  --color-fg-1: #C9D1D9;
  --color-fg-2: #8B949E;
  --color-fg-3: #6E7681;
  --color-violet-500: #7C3AED;
  --color-violet-400: #A78BFA;
  --color-violet-300: #C4B5FD;
  --color-cyan-400: #22D3EE;
  --color-cyan-300: #67E8F9;
  --color-success: #3FB950;
  --color-warning: #D29922;
  --color-danger: #F85149;

  /* --font-geist-sans is fixed by the `geist` package; the other two are set in fonts.ts. */
  --font-display: var(--font-bricolage), ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;

  --radius-chip: 6px;
  --radius-card: 12px;
  --radius-panel: 20px;

  --text-display-1: clamp(2.75rem, 1.5rem + 5vw, 6.5rem);
  --text-display-2: clamp(2rem, 1.2rem + 3vw, 4rem);
  --text-h2: clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem);

  --spacing-section: clamp(4rem, 10vw, 10rem);
  --spacing-gutter: clamp(1rem, 4vw, 4rem);

  --ease-out-soft: cubic-bezier(.2, .8, .2, 1);
}

@layer base {
  :root { color-scheme: dark; }

  html { scroll-behavior: smooth; }

  body {
    background-color: var(--color-bg-0);
    color: var(--color-fg-1);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  h1, h2, h3 { color: var(--color-fg-0); font-family: var(--font-display); }

  :focus-visible {
    outline: 2px solid var(--color-cyan-400);
    outline-offset: 2px;
    border-radius: 2px;
  }

  ::selection { background: var(--color-violet-500); color: var(--color-fg-0); }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}

@utility measure { max-width: 68ch; }
```

- [ ] **Step 3: Wire the three font families**

`apps/web/app/fonts.ts`:

```ts
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'

export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
  weight: ['400', '600', '700', '800'],
})

export const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  weight: ['400', '500'],
})

export const geist = GeistSans

export const fontVariables = `${bricolage.variable} ${jetbrains.variable} ${geist.variable}`
```

- [ ] **Step 4: Create the root layout and a temporary page**

`apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wieslaw Samushonga — Tech Lead & Senior Software Engineer',
  description:
    'I lead teams that ship production software — and I make the web move. Hospital operations, learning platforms, creator-discovery tooling, procurement systems.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
```

`apps/web/app/page.tsx` (temporary — replaced in Task 17):

```tsx
export default function HomePage() {
  return (
    <main>
      <h1 className="text-[length:var(--text-display-1)]">Wieslaw Samushonga</h1>
    </main>
  )
}
```

- [ ] **Step 5: Configure Vitest**

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
})
```

`apps/web/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 6: Write the failing token test**

`apps/web/tests/unit/tokens.test.ts` — guards against the single highest-risk regression in this codebase: a brand colour silently drifting.

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

const REQUIRED_TOKENS: Record<string, string> = {
  '--color-bg-0': '#0D1117',
  '--color-bg-1': '#11161D',
  '--color-bg-2': '#161B22',
  '--color-line-1': '#1F2937',
  '--color-line-2': '#30363D',
  '--color-fg-0': '#F0F6FC',
  '--color-fg-1': '#C9D1D9',
  '--color-fg-2': '#8B949E',
  '--color-fg-3': '#6E7681',
  '--color-violet-500': '#7C3AED',
  '--color-violet-400': '#A78BFA',
  '--color-violet-300': '#C4B5FD',
  '--color-cyan-400': '#22D3EE',
  '--color-cyan-300': '#67E8F9',
}

describe('design tokens', () => {
  it.each(Object.entries(REQUIRED_TOKENS))('defines %s as %s', (token, value) => {
    expect(css).toContain(`${token}: ${value};`)
  })

  it('honours prefers-reduced-motion in the base layer', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('defines a visible focus ring', () => {
    expect(css).toContain(':focus-visible')
    expect(css).toContain('outline-offset: 2px')
  })
})
```

- [ ] **Step 7: Run the test to verify it fails, then passes**

```bash
pnpm install
pnpm --filter web test
```

Expected: PASS once `globals.css` from Step 2 exists. If any token assertion fails, the CSS value was mistyped — fix the CSS, never the test.

- [ ] **Step 8: Verify the app builds and runs**

```bash
pnpm --filter web build
pnpm --filter web dev
```

Expected: build succeeds; `http://localhost:3000` renders the heading in Bricolage Grotesque on `#0D1117`. Stop the dev server before continuing.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js app with design tokens and font stack"
```

---

## Task 4: Content files and the typed loader

**Files:**
- Create: `content/profile.json`, `content/domains.json`, `content/projects.json`, `content/experience.json`, `content/skills.json`, `content/writing.json`
- Create: `apps/web/lib/content.ts`
- Test: `apps/web/tests/unit/content.test.ts`

**Interfaces:**
- Consumes: `@repo/contracts` schemas (Task 2)
- Produces: `lib/content.ts` exporting `getProfile(): Profile`, `getDomains(): Domain[]`, `getDomainById(id: string): Domain | undefined`, `getProjects(): Project[]`, `getFeaturedProjects(): Project[]`, `getExperience(): Experience[]`, `getSkillGroups(): SkillGroup[]`, `getWriting(): Writing[]`, `countDomainsShipped(): number`, `resolveKpiValue(kpi: Profile['kpis'][number]): string`. **Every section component in Tasks 11–17 consumes these and nothing else** — no component reads `content/` directly.

- [ ] **Step 1: Write the content files**

`content/domains.json` — the eight domains from spec §2:

```json
[
  { "id": "healthcare", "label": "Healthcare", "blurb": "Hospital operations platforms.", "accent": "violet" },
  { "id": "education", "label": "Education", "blurb": "Learning management and authoring.", "accent": "cyan" },
  { "id": "creator-economy", "label": "Creator economy", "blurb": "Discovery and enrichment pipelines.", "accent": "violet" },
  { "id": "procurement-erp", "label": "Procurement / ERP", "blurb": "Approval chains and generated documentation.", "accent": "cyan" },
  { "id": "social-services", "label": "Social services", "blurb": "Assistance platforms on typed backends.", "accent": "violet" },
  { "id": "developer-tooling", "label": "Developer tooling", "blurb": "Review-signal and delivery tooling.", "accent": "cyan" },
  { "id": "interactive-3d", "label": "Interactive 3D", "blurb": "Real-time WebGL experiences.", "accent": "cyan" },
  { "id": "ar-xr", "label": "AR / XR", "blurb": "Augmented reality product work.", "accent": "violet" }
]
```

`content/projects.json` — copy verbatim from spec §5.6 and design brief §10. The AR entry is a flagged placeholder pending owner input:

```json
[
  {
    "slug": "heycreator",
    "name": "heycreator",
    "domain": "creator-economy",
    "role": "Senior Software Engineer",
    "period": { "from": "2024-01" },
    "summary": "Creator-discovery platform with automated enrichment pipelines and reversible data migrations — dry-run, apply and rollback.",
    "stack": ["Next.js", "TypeScript", "Firebase", "Apify", "Puppeteer", "Playwright"],
    "visibility": "private",
    "featured": true,
    "order": 1
  },
  {
    "slug": "vantage-health-system",
    "name": "Vantage Health System",
    "domain": "healthcare",
    "role": "Lead Engineer",
    "period": { "from": "2023-03" },
    "summary": "Hospital operations platform: containerised services, structured logging, QR-coded records and generated reporting decks.",
    "stack": ["Node", "Express", "Docker", "Winston", "PptxGenJS"],
    "visibility": "private",
    "featured": true,
    "order": 2
  },
  {
    "slug": "gabar",
    "name": "gabar",
    "domain": "interactive-3d",
    "role": "Creator",
    "period": { "from": "2024-06" },
    "summary": "Real-time 3D web experience: rigid-body physics, spatial audio, mobile joystick controls, tuned to hold frame rate on mid-range devices.",
    "stack": ["Three.js", "React Three Fiber", "drei", "Rapier", "Howler"],
    "visibility": "private",
    "featured": true,
    "order": 3
  },
  {
    "slug": "learnx",
    "name": "learnx",
    "domain": "education",
    "role": "Lead Engineer",
    "period": { "from": "2023-08" },
    "summary": "Learning management system with rich-text authoring: drag-and-drop curriculum building, tables, code blocks and inline media.",
    "stack": ["React", "Express", "Firebase Admin", "TipTap", "dnd-kit", "Zustand"],
    "visibility": "private",
    "featured": true,
    "order": 4
  },
  {
    "slug": "ar-product-visualiser",
    "name": "AR Product Visualiser",
    "domain": "ar-xr",
    "role": "Engineer",
    "period": { "from": "2023-01" },
    "summary": "Augmented reality product visualisation letting customers place true-to-scale models in their own space before buying.",
    "stack": ["Unity", "ARCore", "ARKit", "C#"],
    "visibility": "client",
    "featured": true,
    "order": 5,
    "placeholder": true
  },
  {
    "slug": "pr-pulse",
    "name": "PR-Pulse",
    "domain": "developer-tooling",
    "role": "Creator",
    "period": { "from": "2025-02" },
    "summary": "Pull-request performance and review-signal tooling. Public.",
    "stack": ["TypeScript", "Next.js", "Vercel Blob", "Motion"],
    "visibility": "public",
    "featured": true,
    "order": 6,
    "links": [{ "label": "GitHub", "url": "https://github.com/JxstWieslaw/PR-Pulse" }]
  },
  {
    "slug": "we-assist-you",
    "name": "we-assist-you",
    "domain": "social-services",
    "role": "Senior Software Engineer",
    "period": { "from": "2024-03" },
    "summary": "Assistance platform on a typed backend with enforced security rules, conventional commits and staged builds; monitored in production.",
    "stack": ["TypeScript", "Firestore", "React", "TanStack Query", "Zod", "Sentry"],
    "visibility": "private",
    "featured": false,
    "order": 7
  },
  {
    "slug": "purchase-requisition",
    "name": "purchase-requisition",
    "domain": "procurement-erp",
    "role": "Engineer",
    "period": { "from": "2023-05" },
    "summary": "Procurement workflow system with approval chains and generated PDF documentation.",
    "stack": ["Next.js", "Supabase", "jsPDF"],
    "visibility": "private",
    "featured": false,
    "order": 8
  }
]
```

`content/profile.json`:

```json
{
  "name": "Wieslaw Samushonga",
  "headline": "I lead teams that ship production software — and I make the web move.",
  "sub": "Hospital operations, learning platforms, creator-discovery tooling, procurement systems. Technical direction, code review and mentorship by day; real-time 3D on the web that holds frame rate on a mid-range phone.",
  "location": "Harare, Zimbabwe",
  "email": "wieslawsamushonga01@gmail.com",
  "availability": "Open to consulting & collaboration",
  "roles": [
    { "org": "Data Age", "title": "Tech Lead" },
    { "org": "Rapidev Labs", "title": "Senior Software Engineer", "url": "https://rapidevlabs.com" }
  ],
  "links": [
    { "label": "Email", "url": "mailto:wieslawsamushonga01@gmail.com", "kind": "primary" },
    { "label": "LinkedIn", "url": "https://linkedin.com/in/wieslaw-samushonga-3b3913154", "kind": "primary" },
    { "label": "GitHub", "url": "https://github.com/JxstWieslaw", "kind": "primary" },
    { "label": "Rapidev Labs", "url": "https://rapidevlabs.com", "kind": "secondary" },
    { "label": "X", "url": "https://x.com/wiesysams1", "kind": "secondary" },
    { "label": "Medium", "url": "https://medium.com/@youngswiesysams", "kind": "secondary" },
    { "label": "Instagram", "url": "https://instagram.com/jxstwieslaw_", "kind": "elsewhere" },
    { "label": "Reddit", "url": "https://reddit.com/user/jxstWieslaw", "kind": "elsewhere" }
  ],
  "kpis": [
    { "label": "Experience", "value": "5+ years" },
    { "label": "Domains shipped", "value": "0", "derived": "domainsShipped" },
    { "label": "Specialism", "value": "WebGL / real-time 3D" },
    { "label": "Production platforms led", "value": "10", "placeholder": true }
  ]
}
```

`content/experience.json`:

```json
[
  {
    "org": "Data Age",
    "title": "Tech Lead",
    "period": { "from": "2025-01" },
    "location": "Harare, Zimbabwe",
    "highlights": [
      "Set technical direction and architecture standards across the engineering team.",
      "Run code review and mentor engineers as they grow.",
      "Accountable for how the work gets built, not only that it ships."
    ]
  },
  {
    "org": "Rapidev Labs",
    "title": "Senior Software Engineer",
    "period": { "from": "2024-01" },
    "location": "Harare, Zimbabwe",
    "highlights": [
      "Design and ship full-stack features end to end — data modelling through deployment.",
      "Own API design and the pipelines behind production releases."
    ]
  },
  {
    "org": "Earlier engineering roles",
    "title": "Software Engineer",
    "period": { "from": "2020-01", "to": "2023-12" },
    "highlights": [
      "Built and maintained production web platforms across healthcare, education and procurement."
    ],
    "placeholder": true
  }
]
```

`content/skills.json`:

```json
[
  { "id": "languages", "label": "Languages", "items": [
    { "name": "TypeScript", "level": "core" }, { "name": "JavaScript", "level": "core" },
    { "name": "Python", "level": "working" }, { "name": "Java", "level": "working" },
    { "name": "SQL", "level": "core" }
  ]},
  { "id": "frontend", "label": "Frontend", "items": [
    { "name": "Next.js", "level": "core" }, { "name": "React", "level": "core" },
    { "name": "Tailwind CSS", "level": "core" }, { "name": "Motion", "level": "working" },
    { "name": "Zustand", "level": "working" }, { "name": "TanStack Query", "level": "working" }
  ]},
  { "id": "backend", "label": "Backend & Data", "items": [
    { "name": "Node.js", "level": "core" }, { "name": "Express", "level": "core" },
    { "name": "PostgreSQL", "level": "core" }, { "name": "Firebase", "level": "core" },
    { "name": "Supabase", "level": "working" }, { "name": "Zod", "level": "core" },
    { "name": "Spring", "level": "familiar" }
  ]},
  { "id": "cloud", "label": "Cloud & DevOps", "items": [
    { "name": "Vercel", "level": "core" }, { "name": "Google Cloud", "level": "working" },
    { "name": "Docker", "level": "working" }, { "name": "GitHub Actions", "level": "working" },
    { "name": "Sentry", "level": "working" }, { "name": "AWS", "level": "familiar" }
  ]},
  { "id": "three-d", "label": "3D & Creative", "items": [
    { "name": "Three.js", "level": "core" }, { "name": "React Three Fiber", "level": "core" },
    { "name": "WebGL", "level": "core" }, { "name": "Rapier", "level": "working" },
    { "name": "GSAP", "level": "working" }, { "name": "Blender", "level": "familiar" }
  ]},
  { "id": "practice", "label": "Tooling & Practice", "items": [
    { "name": "Git", "level": "core" }, { "name": "Playwright", "level": "working" },
    { "name": "ESLint", "level": "core" }, { "name": "Postman", "level": "working" },
    { "name": "Linear", "level": "working" }, { "name": "Jira", "level": "working" }
  ]}
]
```

`content/writing.json` — three flagged placeholders until the Medium feed lands in M3:

```json
[
  {
    "title": "Reversible data migrations: dry-run, apply, rollback",
    "url": "https://medium.com/@youngswiesysams",
    "date": "2026-05-12",
    "source": "medium",
    "excerpt": "Why every destructive migration should ship with its own undo, and what that looks like in practice.",
    "placeholder": true
  },
  {
    "title": "Holding 60fps on a mid-range phone with WebGL",
    "url": "https://medium.com/@youngswiesysams",
    "date": "2026-03-04",
    "source": "medium",
    "excerpt": "Instancing, draw-call budgets and the performance work that makes real-time 3D viable on the web.",
    "placeholder": true
  },
  {
    "title": "What a tech lead actually does in code review",
    "url": "https://medium.com/@youngswiesysams",
    "date": "2026-01-19",
    "source": "medium",
    "excerpt": "Review as the main channel for technical direction and mentorship, not a defect-catching net.",
    "placeholder": true
  }
]
```

- [ ] **Step 2: Write the failing loader test**

`apps/web/tests/unit/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  countDomainsShipped, getDomains, getExperience, getFeaturedProjects,
  getProfile, getProjects, getSkillGroups, getWriting, resolveKpiValue,
} from '@/lib/content'

describe('content loader', () => {
  it('validates and returns the profile', () => {
    const profile = getProfile()
    expect(profile.name).toBe('Wieslaw Samushonga')
    expect(profile.roles.length).toBeGreaterThanOrEqual(2)
  })

  it('returns projects sorted by order', () => {
    const orders = getProjects().map((p) => p.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('returns exactly the featured projects', () => {
    const featured = getFeaturedProjects()
    expect(featured.length).toBeGreaterThan(0)
    expect(featured.every((p) => p.featured)).toBe(true)
  })

  it('every project references a domain that exists', () => {
    const ids = new Set(getDomains().map((d) => d.id))
    for (const project of getProjects()) expect(ids.has(project.domain)).toBe(true)
  })

  it('counts domains shipped from non-placeholder projects only', () => {
    const expected = new Set(getProjects().filter((p) => !p.placeholder).map((p) => p.domain)).size
    expect(countDomainsShipped()).toBe(expected)
  })

  it('resolves a derived KPI to the computed value, not the stored one', () => {
    const kpi = getProfile().kpis.find((k) => k.derived === 'domainsShipped')
    expect(kpi).toBeDefined()
    if (!kpi) return
    expect(resolveKpiValue(kpi)).toBe(String(countDomainsShipped()))
  })

  it('loads experience, skills and writing without throwing', () => {
    expect(getExperience().length).toBeGreaterThan(0)
    expect(getSkillGroups().length).toBe(6)
    expect(getWriting().length).toBe(3)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter web test
```

Expected: FAIL — cannot resolve `@/lib/content`.

- [ ] **Step 4: Implement the loader**

`apps/web/lib/content.ts`:

```ts
import {
  domainSchema, experienceSchema, profileSchema, projectSchema,
  skillGroupSchema, writingSchema,
  type Domain, type Experience, type Profile, type Project,
  type SkillGroup, type Writing,
} from '@repo/contracts'
import { z } from 'zod'

import domainsJson from '../../../content/domains.json'
import experienceJson from '../../../content/experience.json'
import profileJson from '../../../content/profile.json'
import projectsJson from '../../../content/projects.json'
import skillsJson from '../../../content/skills.json'
import writingJson from '../../../content/writing.json'

function parse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(`content/${label} failed validation:\n${result.error.toString()}`)
  }
  return result.data
}

const profile = parse(profileSchema, profileJson, 'profile.json')
const domains = parse(z.array(domainSchema), domainsJson, 'domains.json')
const projects = parse(z.array(projectSchema), projectsJson, 'projects.json')
  .sort((a, b) => a.order - b.order)
const experience = parse(z.array(experienceSchema), experienceJson, 'experience.json')
const skillGroups = parse(z.array(skillGroupSchema), skillsJson, 'skills.json')
const writing = parse(z.array(writingSchema), writingJson, 'writing.json')

export function getProfile(): Profile { return profile }
export function getDomains(): Domain[] { return domains }
export function getProjects(): Project[] { return projects }
export function getFeaturedProjects(): Project[] { return projects.filter((p) => p.featured) }
export function getExperience(): Experience[] { return experience }
export function getSkillGroups(): SkillGroup[] { return skillGroups }
export function getWriting(): Writing[] { return writing }

/** Distinct domains across real (non-placeholder) projects. Shows 7 until the AR case study is real. */
export function countDomainsShipped(): number {
  return new Set(projects.filter((p) => !p.placeholder).map((p) => p.domain)).size
}

export function resolveKpiValue(kpi: Profile['kpis'][number]): string {
  if (kpi.derived === 'domainsShipped') return String(countDomainsShipped())
  return kpi.value
}

export function getDomainById(id: string): Domain | undefined {
  return domains.find((d) => d.id === id)
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: 7 tests pass. `countDomainsShipped()` returns **7** — the AR project is a placeholder and is correctly excluded.

- [ ] **Step 6: Commit**

```bash
git add content apps/web/lib/content.ts apps/web/tests/unit/content.test.ts
git commit -m "feat(web): add content files and Zod-validated typed loader"
```

---

## Task 5: Placeholder detection and the content linter

The spec's "nothing empty" rule allows placeholder copy everywhere except testimonials, but placeholders must never be mistaken for fact. This task builds the mechanism that keeps them visible to the owner and invisible to visitors.

**Files:**
- Create: `apps/web/lib/placeholders.ts`, `apps/web/scripts/lint-content.ts`
- Test: `apps/web/tests/unit/placeholders.test.ts`

**Interfaces:**
- Consumes: `lib/content.ts` getters (Task 4)
- Produces: `isPlaceholder(item)`, `collectPlaceholders(): PlaceholderReport[]` where `PlaceholderReport = { source: string; label: string }`; CLI `pnpm --filter web lint:content`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/placeholders.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectPlaceholders, isPlaceholder } from '@/lib/placeholders'

describe('isPlaceholder', () => {
  it('is true only when the flag is explicitly set', () => {
    expect(isPlaceholder({ placeholder: true })).toBe(true)
    expect(isPlaceholder({ placeholder: false })).toBe(false)
    expect(isPlaceholder({})).toBe(false)
  })
})

describe('collectPlaceholders', () => {
  const reports = collectPlaceholders()

  it('finds the flagged AR project', () => {
    expect(reports).toContainEqual({ source: 'projects.json', label: 'AR Product Visualiser' })
  })

  it('finds the flagged earlier-roles experience entry', () => {
    expect(reports.some((r) => r.source === 'experience.json')).toBe(true)
  })

  it('finds the three placeholder writing entries', () => {
    expect(reports.filter((r) => r.source === 'writing.json')).toHaveLength(3)
  })

  it('finds the placeholder KPI', () => {
    expect(reports).toContainEqual({
      source: 'profile.json', label: 'Production platforms led',
    })
  })

  it('does not report real content as placeholder', () => {
    expect(reports.some((r) => r.label === 'heycreator')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test placeholders
```

Expected: FAIL — cannot resolve `@/lib/placeholders`.

- [ ] **Step 3: Implement placeholder detection**

`apps/web/lib/placeholders.ts`:

```ts
import { getExperience, getProfile, getProjects, getWriting } from './content'

export type Placeholderish = { placeholder?: boolean }
export type PlaceholderReport = { source: string; label: string }

export function isPlaceholder(item: Placeholderish): boolean {
  return item.placeholder === true
}

export function collectPlaceholders(): PlaceholderReport[] {
  const reports: PlaceholderReport[] = []

  for (const p of getProjects()) {
    if (isPlaceholder(p)) reports.push({ source: 'projects.json', label: p.name })
    for (const o of p.outcome) {
      if (isPlaceholder(o)) reports.push({ source: 'projects.json', label: `${p.name} → ${o.label}` })
    }
  }
  for (const e of getExperience()) {
    if (isPlaceholder(e)) reports.push({ source: 'experience.json', label: `${e.org} — ${e.title}` })
  }
  for (const w of getWriting()) {
    if (isPlaceholder(w)) reports.push({ source: 'writing.json', label: w.title })
  }
  for (const k of getProfile().kpis) {
    if (isPlaceholder(k)) reports.push({ source: 'profile.json', label: k.label })
  }

  return reports
}
```

- [ ] **Step 4: Write the CLI**

`apps/web/scripts/lint-content.ts`:

```ts
import { collectPlaceholders } from '../lib/placeholders'

const reports = collectPlaceholders()

if (reports.length === 0) {
  console.log('✓ No placeholder content remaining.')
  process.exit(0)
}

console.log(`\n${reports.length} placeholder item(s) still in content:\n`)
const bySource = new Map<string, string[]>()
for (const { source, label } of reports) {
  bySource.set(source, [...(bySource.get(source) ?? []), label])
}
for (const [source, labels] of bySource) {
  console.log(`  ${source}`)
  for (const label of labels) console.log(`    · ${label}`)
}
console.log('\nThese render as finished copy but are not verified fact. Replace before launch (M5).\n')
// Exit 0 by design: placeholders must never block a deploy. The report is the signal.
process.exit(0)
```

- [ ] **Step 5: Run the tests and the CLI**

```bash
pnpm --filter web test placeholders
pnpm --filter web lint:content
```

Expected: 5 tests pass. The CLI lists 6 items — 1 project, 1 experience entry, 3 writing entries, 1 KPI — and exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/placeholders.ts apps/web/scripts/lint-content.ts apps/web/tests/unit/placeholders.test.ts
git commit -m "feat(web): report placeholder content via lint:content"
```

---

## Task 6: Layout primitives

**Files:**
- Create: `apps/web/components/layout/Container.tsx`, `apps/web/components/layout/Section.tsx`, `apps/web/components/layout/SkipLink.tsx`
- Test: `apps/web/tests/unit/layout.test.tsx`

**Interfaces:**
- Consumes: `FormationId` from `@repo/contracts` (Task 2)
- Produces:
  - `<Container width?: 'content' | 'bento'>` — max-width 1440 / 1600, gutter, centred
  - `<Section id: string, formation?: FormationId, labelledBy?: string>` — renders `<section id data-section={id} data-formation>`; **`data-section` is the attribute `useActiveSection` (Task 7) observes and M2's scroll store reuses**
  - `<SkipLink />` — first focusable element, targets `#main`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/layout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { SkipLink } from '@/components/layout/SkipLink'

describe('Section', () => {
  it('exposes id and data-section so the poster layer can observe it', () => {
    const { container } = render(<Section id="work" formation="lattice"><p>x</p></Section>)
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'work')
    expect(section).toHaveAttribute('data-section', 'work')
    expect(section).toHaveAttribute('data-formation', 'lattice')
  })

  it('associates its accessible name with a heading when labelledBy is given', () => {
    render(
      <Section id="lead" labelledBy="lead-heading">
        <h2 id="lead-heading">How I Lead</h2>
      </Section>
    )
    expect(screen.getByRole('region', { name: 'How I Lead' })).toBeInTheDocument()
  })
})

describe('Container', () => {
  it('renders children', () => {
    render(<Container><p>inside</p></Container>)
    expect(screen.getByText('inside')).toBeInTheDocument()
  })
})

describe('SkipLink', () => {
  it('links to the main landmark', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test layout
```

Expected: FAIL — cannot resolve `@/components/layout/Container`.

- [ ] **Step 3: Implement the primitives**

`apps/web/components/layout/Container.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Container({
  children, width = 'content', className = '',
}: {
  children: ReactNode
  width?: 'content' | 'bento'
  className?: string
}) {
  const max = width === 'bento' ? 'max-w-[1600px]' : 'max-w-[1440px]'
  return (
    <div className={`mx-auto w-full ${max} px-[var(--spacing-gutter)] ${className}`}>
      {children}
    </div>
  )
}
```

`apps/web/components/layout/Section.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { FormationId } from '@repo/contracts'

export function Section({
  id, formation, labelledBy, children, className = '',
}: {
  id: string
  formation?: FormationId
  labelledBy?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      data-section={id}
      data-formation={formation}
      aria-labelledby={labelledBy}
      className={`relative py-[var(--spacing-section)] ${className}`}
    >
      {children}
    </section>
  )
}
```

`apps/web/components/layout/SkipLink.tsx`:

```tsx
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-chip)] focus:bg-[var(--color-bg-2)] focus:px-4 focus:py-3 focus:text-[var(--color-fg-0)] focus:outline focus:outline-2 focus:outline-[var(--color-cyan-400)]"
    >
      Skip to content
    </a>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test layout
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout apps/web/tests/unit/layout.test.tsx
git commit -m "feat(web): add Container, Section and SkipLink layout primitives"
```

---

## Task 7: `PosterLayer` — the decorative background

This occupies the exact position M2's WebGL canvas will take. Its props and DOM position are the contract; only its internals change in M2.

**Files:**
- Create: `apps/web/lib/use-active-section.ts`, `apps/web/components/three/PosterLayer.tsx`
- Modify: `apps/web/app/layout.tsx` (Step 5 mounts the layer — Task 10 and Task 17 amend this file again later)
- Test: `apps/web/tests/unit/poster-layer.test.tsx`

**Interfaces:**
- Consumes: `data-section` attributes emitted by `Section` (Task 6)
- Produces: `useActiveSection(fallback: string): string` and `<PosterLayer />` — a fixed, `aria-hidden` background rendering a per-section gradient variant with a cross-fade. **M2 replaces the internals with `<PersistentCanvas>` and keeps `PosterLayer` as its fallback child.**

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/poster-layer.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PosterLayer } from '@/components/three/PosterLayer'

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
})

describe('PosterLayer', () => {
  it('is hidden from assistive technology because all content is real DOM elsewhere', () => {
    const { container } = render(<PosterLayer />)
    const layer = container.firstElementChild
    expect(layer).toHaveAttribute('aria-hidden', 'true')
  })

  it('is fixed and non-interactive so it never blocks clicks', () => {
    const { container } = render(<PosterLayer />)
    const layer = container.firstElementChild as HTMLElement
    expect(layer.className).toContain('fixed')
    expect(layer.className).toContain('pointer-events-none')
  })

  it('renders one variant per section formation, so no section has an empty background', () => {
    const { container } = render(<PosterLayer />)
    expect(container.querySelectorAll('[data-variant]').length).toBe(7)
  })

  it('marks exactly one variant active by default', () => {
    const { container } = render(<PosterLayer />)
    const active = container.querySelectorAll('[data-active="true"]')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAttribute('data-variant', 'hero')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test poster-layer
```

Expected: FAIL — cannot resolve `@/components/three/PosterLayer`.

- [ ] **Step 3: Implement the active-section hook**

`apps/web/lib/use-active-section.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'

/**
 * Tracks which `<Section>` currently dominates the viewport.
 * M0 uses IntersectionObserver only. M2 replaces this with the Zustand scroll
 * store, which additionally derives sectionProgress for formation morphing.
 */
export function useActiveSection(fallback: string): string {
  const [active, setActive] = useState(fallback)

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = visible?.target.getAttribute('data-section')
        if (id) setActive(id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )

    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return active
}
```

- [ ] **Step 4: Implement `PosterLayer`**

`apps/web/components/three/PosterLayer.tsx`:

```tsx
'use client'

import { useActiveSection } from '@/lib/use-active-section'

/**
 * Decorative background standing in for the M2 WebGL layer ("The Assembly").
 * One variant per section formation; cross-faded on section change.
 * Pure CSS — no binary assets enter the repo before real formation renders exist.
 */
const VARIANTS: { id: string; sections: string[]; background: string }[] = [
  { id: 'hero', sections: ['hero'], background:
    'radial-gradient(60% 55% at 50% 42%, rgba(124,58,237,.34), transparent 70%), radial-gradient(38% 40% at 62% 62%, rgba(34,211,238,.22), transparent 72%)' },
  { id: 'stream', sections: ['proof'], background:
    'linear-gradient(100deg, transparent 8%, rgba(124,58,237,.20) 38%, rgba(34,211,238,.20) 62%, transparent 92%)' },
  { id: 'lattice', sections: ['work'], background:
    'radial-gradient(46% 46% at 28% 38%, rgba(124,58,237,.24), transparent 70%), radial-gradient(40% 40% at 76% 66%, rgba(34,211,238,.18), transparent 72%)' },
  { id: 'orbit', sections: ['lead'], background:
    'radial-gradient(34% 34% at 50% 48%, rgba(167,139,250,.30), transparent 66%), radial-gradient(58% 58% at 50% 48%, rgba(124,58,237,.14), transparent 74%)' },
  { id: 'scatter', sections: ['craft'], background:
    'radial-gradient(52% 50% at 66% 44%, rgba(34,211,238,.30), transparent 70%), radial-gradient(36% 36% at 26% 68%, rgba(124,58,237,.18), transparent 72%)' },
  { id: 'grid', sections: ['stack', 'timeline', 'writing'], background:
    'linear-gradient(180deg, rgba(124,58,237,.14), transparent 55%), radial-gradient(46% 40% at 50% 22%, rgba(34,211,238,.14), transparent 74%)' },
  { id: 'ring', sections: ['contact'], background:
    'radial-gradient(closest-side, transparent 52%, rgba(34,211,238,.26) 63%, rgba(124,58,237,.20) 71%, transparent 80%)' },
]

export function PosterLayer() {
  const activeSection = useActiveSection('hero')
  const activeVariant =
    VARIANTS.find((v) => v.sections.includes(activeSection))?.id ?? 'hero'

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {VARIANTS.map((variant) => (
        <div
          key={variant.id}
          data-variant={variant.id}
          data-active={variant.id === activeVariant}
          className="absolute inset-0 opacity-0 transition-opacity duration-[900ms] ease-[var(--ease-out-soft)] data-[active=true]:opacity-100 motion-reduce:transition-none"
          style={{ background: variant.background }}
        />
      ))}
      {/* Grain: hides gradient banding on wide displays. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Add it to the root layout**

Modify `apps/web/app/layout.tsx` — replace the `<body>` contents:

```tsx
      <body>
        <SkipLink />
        <PosterLayer />
        {children}
      </body>
```

Add the imports at the top:

```tsx
import { PosterLayer } from '@/components/three/PosterLayer'
import { SkipLink } from '@/components/layout/SkipLink'
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter web test poster-layer
pnpm --filter web typecheck
```

Expected: 4 tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/use-active-section.ts apps/web/components/three apps/web/app/layout.tsx apps/web/tests/unit/poster-layer.test.tsx
git commit -m "feat(web): add PosterLayer background with per-section variants"
```

---

## Task 8: UI primitives

**Files:**
- Create: `apps/web/components/ui/Button.tsx`, `Chip.tsx`, `Badge.tsx`, `KpiTile.tsx`, `Monogram.tsx`
- Test: `apps/web/tests/unit/ui.test.tsx`

**Interfaces:**
- Consumes: nothing beyond tokens (Task 3)
- Produces:
  - `<Button variant?: 'primary' | 'secondary' | 'ghost', href?: string, ...>` — renders `<a>` when `href` is set, otherwise `<button>`
  - `<Chip accent?: 'violet' | 'cyan' | 'neutral', level?: 'core' | 'working' | 'familiar'>`
  - `<Badge visibility: Visibility>` — "Public" / "Client codebase" / "Private codebase"
  - `<KpiTile label: string, value: string, placeholder?: boolean>`
  - `<Monogram name: string, size?: number>` — the gradient initials tile used wherever an image is missing

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/ui.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { KpiTile } from '@/components/ui/KpiTile'
import { Monogram } from '@/components/ui/Monogram'

describe('Button', () => {
  it('renders a link when href is provided', () => {
    render(<Button href="#work">See the work</Button>)
    expect(screen.getByRole('link', { name: 'See the work' })).toHaveAttribute('href', '#work')
  })

  it('renders a button element otherwise', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('meets the 44px minimum tap target', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button').className).toContain('min-h-11')
  })
})

describe('Badge', () => {
  it.each([
    ['public', 'Public'],
    ['client', 'Client codebase'],
    ['private', 'Private codebase'],
  ] as const)('renders %s visibility as "%s"', (visibility, label) => {
    render(<Badge visibility={visibility} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('KpiTile', () => {
  it('renders label and value', () => {
    render(<KpiTile label="Domains shipped" value="7" />)
    expect(screen.getByText('Domains shipped')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('marks placeholder values in the DOM without changing what the visitor reads', () => {
    const { container } = render(<KpiTile label="Platforms" value="10" placeholder />)
    expect(container.querySelector('[data-placeholder="true"]')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeVisible()
  })
})

describe('Monogram', () => {
  it('derives initials from a full name', () => {
    render(<Monogram name="Wieslaw Samushonga" />)
    expect(screen.getByText('WS')).toBeInTheDocument()
  })

  it('is decorative when it stands in for a missing image', () => {
    const { container } = render(<Monogram name="Wieslaw Samushonga" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Chip', () => {
  it('renders its label', () => {
    render(<Chip>TypeScript</Chip>)
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test ui
```

Expected: FAIL — cannot resolve `@/components/ui/Badge`.

- [ ] **Step 3: Implement the primitives**

`apps/web/components/ui/Button.tsx`:

```tsx
import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-chip)] px-5 text-sm font-medium transition-colors duration-200 ease-[var(--ease-out-soft)] disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-fg-0)] text-[var(--color-bg-0)] hover:bg-[var(--color-violet-300)]',
  secondary:
    'border border-[var(--color-line-2)] text-[var(--color-fg-0)] hover:border-[var(--color-violet-400)] hover:text-[var(--color-violet-300)]',
  ghost: 'text-[var(--color-fg-1)] hover:text-[var(--color-fg-0)]',
}

type Props = {
  children: ReactNode
  variant?: Variant
  href?: string
  className?: string
} & Omit<ComponentProps<'button'>, 'className'>

export function Button({ children, variant = 'primary', href, className = '', ...rest }: Props) {
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`
  if (href) {
    return <a href={href} className={cls}>{children}</a>
  }
  return <button className={cls} {...rest}>{children}</button>
}
```

`apps/web/components/ui/Chip.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { SkillLevel } from '@repo/contracts'

const ACCENTS = {
  violet: 'border-[var(--color-violet-500)]/40 text-[var(--color-violet-300)]',
  cyan: 'border-[var(--color-cyan-400)]/40 text-[var(--color-cyan-300)]',
  neutral: 'border-[var(--color-line-2)] text-[var(--color-fg-2)]',
} as const

const LEVELS: Record<SkillLevel, string> = {
  core: 'bg-[var(--color-bg-2)] text-[var(--color-fg-0)] border-[var(--color-line-2)]',
  working: 'border-[var(--color-line-2)] text-[var(--color-fg-1)]',
  familiar: 'border-[var(--color-line-1)] text-[var(--color-fg-3)]',
}

export function Chip({
  children, accent = 'neutral', level, className = '',
}: {
  children: ReactNode
  accent?: keyof typeof ACCENTS
  level?: SkillLevel
  className?: string
}) {
  const tone = level ? LEVELS[level] : ACCENTS[accent]
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-chip)] border px-2.5 py-1 text-xs font-medium ${tone} ${className}`}
    >
      {children}
    </span>
  )
}
```

`apps/web/components/ui/Badge.tsx`:

```tsx
import type { Visibility } from '@repo/contracts'

const LABELS: Record<Visibility, string> = {
  public: 'Public',
  client: 'Client codebase',
  private: 'Private codebase',
}

export function Badge({ visibility }: { visibility: Visibility }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-chip)] border border-[var(--color-line-1)] bg-[var(--color-bg-1)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
      {LABELS[visibility]}
    </span>
  )
}
```

`apps/web/components/ui/KpiTile.tsx`:

```tsx
export function KpiTile({
  label, value, placeholder = false,
}: {
  label: string
  value: string
  placeholder?: boolean
}) {
  return (
    <div
      data-placeholder={placeholder}
      className="flex flex-col gap-1 border-l border-[var(--color-line-1)] pl-4"
    >
      <span className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-fg-0)]">
        {value}
      </span>
    </div>
  )
}
```

`apps/web/components/ui/Monogram.tsx`:

```tsx
export function Monogram({ name, size = 96 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-[var(--radius-card)] bg-[linear-gradient(135deg,var(--color-violet-500),var(--color-cyan-400))] font-[family-name:var(--font-display)] text-[var(--color-bg-0)]"
    >
      <span style={{ fontSize: size * 0.34 }}>{initials}</span>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test ui
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui apps/web/tests/unit/ui.test.tsx
git commit -m "feat(web): add Button, Chip, Badge, KpiTile and Monogram primitives"
```

---

## Task 9: Navigation with mobile bottom sheet

Uses a native `<dialog>` for the mobile sheet — this gives focus trapping, `Escape` to close and inert background for free, rather than hand-rolling a focus trap.

**Files:**
- Create: `apps/web/components/layout/Nav.tsx`, `apps/web/lib/nav-items.ts`
- Test: `apps/web/tests/unit/nav.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Monogram` (Task 8); `Container` (Task 6)
- Produces: `NAV_ITEMS: { href: string; label: string }[]` and `<Nav />` — sticky header that condenses past 80px of scroll; the mobile trigger opens a `<dialog>` bottom sheet

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/nav.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Nav } from '@/components/layout/Nav'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
})

describe('Nav', () => {
  it('renders a banner landmark with the monogram home link', () => {
    render(<Nav />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wieslaw samushonga — home/i })).toHaveAttribute('href', '#hero')
  })

  it('links to every major section', () => {
    render(<Nav />)
    const nav = screen.getByRole('navigation', { name: /primary/i })
    for (const href of ['#work', '#lead', '#craft', '#contact']) {
      expect(nav.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
  })

  it('opens the mobile sheet when the menu button is pressed', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })

  it('closes the sheet after a section link inside it is followed', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    const sheet = screen.getByRole('dialog', { name: /menu/i })
    const link = sheet.querySelector('a[href="#work"]')
    expect(link).not.toBeNull()
    if (link) await user.click(link)
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test nav
```

Expected: FAIL — cannot resolve `@/components/layout/Nav`.

- [ ] **Step 3: Implement the nav items and component**

`apps/web/lib/nav-items.ts`:

```ts
export const NAV_ITEMS = [
  { href: '#work', label: 'Work' },
  { href: '#lead', label: 'How I lead' },
  { href: '#craft', label: 'Craft' },
  { href: '#stack', label: 'Stack' },
  { href: '#timeline', label: 'Experience' },
  { href: '#contact', label: 'Contact' },
] as const
```

`apps/web/components/layout/Nav.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Monogram } from '@/components/ui/Monogram'
import { Container } from '@/components/layout/Container'
import { NAV_ITEMS } from '@/lib/nav-items'

export function Nav() {
  const [condensed, setCondensed] = useState(false)
  const sheetRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      role="banner"
      data-condensed={condensed}
      className="fixed inset-x-0 top-0 z-40 border-b border-transparent bg-[var(--color-bg-0)]/70 backdrop-blur-xl transition-[height,border-color] duration-200 ease-[var(--ease-out-soft)] data-[condensed=true]:border-[var(--color-line-1)]"
    >
      <Container className="flex h-18 items-center justify-between data-[condensed=true]:h-14">
        <a href="#hero" aria-label="Wieslaw Samushonga — home" className="inline-flex items-center">
          {/* Monogram is aria-hidden; the link carries the accessible name. */}
          <Monogram name="Wieslaw Samushonga" size={34} />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--color-fg-2)] transition-colors hover:text-[var(--color-fg-0)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button href="#contact" className="hidden sm:inline-flex">Let&rsquo;s talk</Button>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => sheetRef.current?.showModal()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-chip)] border border-[var(--color-line-2)] text-[var(--color-fg-1)] lg:hidden"
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </Container>

      <dialog
        ref={sheetRef}
        aria-label="Menu"
        className="m-0 mt-auto w-full max-w-none rounded-t-[var(--radius-panel)] border-t border-[var(--color-line-1)] bg-[var(--color-bg-1)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[var(--color-fg-1)] backdrop:bg-black/60"
      >
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => sheetRef.current?.close()}
              className="flex min-h-11 items-center rounded-[var(--radius-chip)] px-3 text-base text-[var(--color-fg-1)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-fg-0)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => sheetRef.current?.close()}
          className="mt-4 min-h-11 w-full rounded-[var(--radius-chip)] border border-[var(--color-line-2)] text-sm text-[var(--color-fg-2)]"
        >
          Close
        </button>
      </dialog>
    </header>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test nav
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/Nav.tsx apps/web/lib/nav-items.ts apps/web/tests/unit/nav.test.tsx
git commit -m "feat(web): add sticky nav with native dialog bottom sheet"
```

---

## Task 10: Footer

**Files:**
- Create: `apps/web/components/layout/Footer.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/tests/unit/footer.test.tsx`

**Interfaces:**
- Consumes: `getProfile()` (Task 4), `NAV_ITEMS` (Task 9), `Container` (Task 6)
- Produces: `<Footer />` — contentinfo landmark with section nav, primary/secondary links from `profile.links`, and the colophon

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/footer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from '@/components/layout/Footer'

describe('Footer', () => {
  it('renders a contentinfo landmark', () => {
    render(<Footer />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('renders the colophon claim that the site itself is the proof', () => {
    render(<Footer />)
    expect(screen.getByText(/holds 60 fps on a mid-range phone/i)).toBeInTheDocument()
  })

  it('links out to LinkedIn and GitHub', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href', expect.stringContaining('linkedin.com')
    )
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
  })

  it('opens external links safely', () => {
    render(<Footer />)
    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test footer
```

Expected: FAIL — cannot resolve `@/components/layout/Footer`.

- [ ] **Step 3: Implement the footer**

`apps/web/components/layout/Footer.tsx`:

```tsx
import { Container } from '@/components/layout/Container'
import { getProfile } from '@/lib/content'
import { NAV_ITEMS } from '@/lib/nav-items'

export function Footer() {
  const profile = getProfile()
  const external = profile.links.filter((l) => l.kind !== 'elsewhere')
  const elsewhere = profile.links.filter((l) => l.kind === 'elsewhere')

  return (
    <footer role="contentinfo" className="border-t border-[var(--color-line-1)] py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <nav aria-label="Footer sections" className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="text-sm text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]">
                {item.label}
              </a>
            ))}
          </nav>

          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {external.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--color-fg-1)] hover:text-[var(--color-cyan-300)]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--color-line-1)] pt-8 md:flex-row md:items-end md:justify-between">
          <p className="max-w-[52ch] font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--color-fg-3)]">
            Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {elsewhere.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--color-fg-3)] hover:text-[var(--color-fg-1)]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  )
}
```

- [ ] **Step 4: Mount `Nav` and `Footer` in the root layout**

Modify `apps/web/app/layout.tsx` so `<body>` reads exactly:

```tsx
      <body>
        <SkipLink />
        <PosterLayer />
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
```

Add the imports:

```tsx
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
```

- [ ] **Step 5: Run the tests and build**

```bash
pnpm --filter web test
pnpm --filter web build
```

Expected: all unit tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/layout/Footer.tsx apps/web/app/layout.tsx apps/web/tests/unit/footer.test.tsx
git commit -m "feat(web): add footer with colophon and mount layout chrome"
```

---

## Task 11: Hero and Proof strip sections

**Files:**
- Create: `apps/web/components/sections/Hero.tsx`, `apps/web/components/sections/ProofStrip.tsx`
- Test: `apps/web/tests/unit/sections-hero.test.tsx`

**Interfaces:**
- Consumes: `getProfile`, `getDomains`, `resolveKpiValue` (Task 4); `Section`, `Container` (Task 6); `Button`, `Chip`, `KpiTile` (Task 8)
- Produces: `<Hero />` (section id `hero`, formation `monolith`) and `<ProofStrip />` (section id `proof`, formation `stream`)

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-hero.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from '@/components/sections/Hero'
import { ProofStrip } from '@/components/sections/ProofStrip'
import { countDomainsShipped, getDomains } from '@/lib/content'

describe('Hero', () => {
  it('renders the headline as the only h1 on the page', () => {
    render(<Hero />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/I lead teams that ship production software/i)
  })

  it('names both roles and the location in the eyebrow', () => {
    render(<Hero />)
    expect(screen.getByText(/Tech Lead/)).toBeInTheDocument()
    expect(screen.getByText(/Senior Software Engineer/)).toBeInTheDocument()
    expect(screen.getByText(/Harare, Zimbabwe/)).toBeInTheDocument()
  })

  it('offers both calls to action', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /see the work/i })).toHaveAttribute('href', '#work')
    expect(screen.getByRole('link', { name: /let.s talk/i })).toHaveAttribute('href', '#contact')
  })

  it('shows the derived domain count rather than the stored placeholder zero', () => {
    render(<Hero />)
    const kpis = screen.getByTestId('hero-kpis')
    expect(within(kpis).getByText(String(countDomainsShipped()))).toBeInTheDocument()
    expect(within(kpis).queryByText('0')).not.toBeInTheDocument()
  })

  it('declares the monolith formation so the poster layer can match it', () => {
    const { container } = render(<Hero />)
    expect(container.querySelector('[data-section="hero"]')).toHaveAttribute('data-formation', 'monolith')
  })
})

describe('ProofStrip', () => {
  it('renders every domain as a chip — no domain is dropped at any breakpoint', () => {
    render(<ProofStrip />)
    for (const domain of getDomains()) {
      expect(screen.getByText(domain.label)).toBeInTheDocument()
    }
  })

  it('renders a KPI tile for each profile KPI', () => {
    render(<ProofStrip />)
    expect(screen.getAllByText(/domains shipped/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-hero
```

Expected: FAIL — cannot resolve `@/components/sections/Hero`.

- [ ] **Step 3: Implement `Hero`**

`apps/web/components/sections/Hero.tsx`:

```tsx
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/KpiTile'
import { getProfile, resolveKpiValue } from '@/lib/content'

export function Hero() {
  const profile = getProfile()
  const eyebrow = [
    ...profile.roles.map((role) => `${role.title} @ ${role.org}`),
    profile.location,
  ].join(' · ')

  return (
    <Section id="hero" formation="monolith" className="flex min-h-[100svh] items-end pb-24 pt-32 lg:items-center">
      <Container className="flex flex-col gap-8 2xl:max-w-[1600px] 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex max-w-[24ch] flex-col gap-6 2xl:max-w-[18ch]">
          <p className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase leading-relaxed tracking-[0.12em] text-[var(--color-fg-2)]">
            {eyebrow}
          </p>

          <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-display-1)] font-extrabold leading-[1.02] tracking-[-0.02em] text-[var(--color-fg-0)]">
            {profile.headline}
          </h1>

          <p className="measure text-lg leading-relaxed text-[var(--color-fg-1)]">
            {profile.sub}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button href="#work">See the work</Button>
            <Button href="#contact" variant="secondary">Let&rsquo;s talk</Button>
          </div>
        </div>

        <dl
          data-testid="hero-kpis"
          className="grid grid-cols-1 gap-6 sm:grid-cols-3 2xl:grid-cols-1 2xl:gap-8"
        >
          {profile.kpis.slice(0, 3).map((kpi) => (
            <div key={kpi.label}>
              <KpiTile label={kpi.label} value={resolveKpiValue(kpi)} placeholder={kpi.placeholder} />
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 4: Implement `ProofStrip`**

`apps/web/components/sections/ProofStrip.tsx`:

```tsx
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { Chip } from '@/components/ui/Chip'
import { KpiTile } from '@/components/ui/KpiTile'
import { getDomains, getProfile, resolveKpiValue } from '@/lib/content'

export function ProofStrip() {
  const domains = getDomains()
  const kpis = getProfile().kpis

  return (
    <Section
      id="proof"
      formation="stream"
      labelledBy="proof-heading"
      className="border-y border-[var(--color-line-1)] !py-12"
    >
      <Container className="flex flex-col gap-8">
        <h2 id="proof-heading" className="sr-only">Domains and figures at a glance</h2>

        <ul className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li key={domain.id}>
              <Chip accent={domain.accent}>{domain.label}</Chip>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label}>
              <KpiTile label={kpi.label} value={resolveKpiValue(kpi)} placeholder={kpi.placeholder} />
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test sections-hero
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/sections/Hero.tsx apps/web/components/sections/ProofStrip.tsx apps/web/tests/unit/sections-hero.test.tsx
git commit -m "feat(web): add hero and proof strip sections"
```

---

## Task 12: Selected Work section

**Files:**
- Create: `apps/web/components/cards/ProjectCard.tsx`, `apps/web/components/sections/SelectedWork.tsx`
- Test: `apps/web/tests/unit/sections-work.test.tsx`

**Interfaces:**
- Consumes: `getFeaturedProjects`, `getDomainById` (Task 4); `Chip`, `Badge` (Task 8)
- Produces: `<ProjectCard project: Project, featured?: boolean />` and `<SelectedWork />` (section id `work`, formation `lattice`). **`ProjectCard` is reused unchanged by M3's `/work` index.**

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-work.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectCard } from '@/components/cards/ProjectCard'
import { SelectedWork } from '@/components/sections/SelectedWork'
import { getFeaturedProjects, getProjects } from '@/lib/content'

const heycreator = getProjects().find((p) => p.slug === 'heycreator')
const arProject = getProjects().find((p) => p.slug === 'ar-product-visualiser')

describe('ProjectCard', () => {
  it('renders name, summary, domain and every stack chip', () => {
    if (!heycreator) throw new Error('fixture missing')
    render(<ProjectCard project={heycreator} />)
    expect(screen.getByRole('heading', { name: 'heycreator' })).toBeInTheDocument()
    expect(screen.getByText(/reversible data migrations/i)).toBeInTheDocument()
    expect(screen.getByText('Creator economy')).toBeInTheDocument()
    for (const tech of heycreator.stack) expect(screen.getByText(tech)).toBeInTheDocument()
  })

  it('labels a private codebase rather than implying the code is browsable', () => {
    if (!heycreator) throw new Error('fixture missing')
    render(<ProjectCard project={heycreator} />)
    expect(screen.getByText('Private codebase')).toBeInTheDocument()
  })

  it('renders a placeholder project as finished copy, flagged only in the DOM', () => {
    if (!arProject) throw new Error('fixture missing')
    const { container } = render(<ProjectCard project={arProject} />)
    expect(container.querySelector('[data-placeholder="true"]')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AR Product Visualiser' })).toBeVisible()
  })

  it('exposes a public repo link when one exists', () => {
    const prPulse = getProjects().find((p) => p.slug === 'pr-pulse')
    if (!prPulse) throw new Error('fixture missing')
    render(<ProjectCard project={prPulse} />)
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href', 'https://github.com/JxstWieslaw/PR-Pulse'
    )
  })
})

describe('SelectedWork', () => {
  it('renders every featured project and no unfeatured one', () => {
    render(<SelectedWork />)
    const grid = screen.getByTestId('work-grid')
    for (const project of getFeaturedProjects()) {
      expect(within(grid).getByRole('heading', { name: project.name })).toBeInTheDocument()
    }
    expect(within(grid).queryByRole('heading', { name: 'purchase-requisition' })).not.toBeInTheDocument()
  })

  it('declares the lattice formation', () => {
    const { container } = render(<SelectedWork />)
    expect(container.querySelector('[data-section="work"]')).toHaveAttribute('data-formation', 'lattice')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-work
```

Expected: FAIL — cannot resolve `@/components/cards/ProjectCard`.

- [ ] **Step 3: Implement `ProjectCard`**

`apps/web/components/cards/ProjectCard.tsx`:

```tsx
import type { Project } from '@repo/contracts'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { getDomainById } from '@/lib/content'

export function ProjectCard({ project, featured = false }: { project: Project; featured?: boolean }) {
  const domain = getDomainById(project.domain)
  const repoLink = project.links[0]

  return (
    <article
      data-placeholder={project.placeholder}
      data-featured={featured}
      className="group flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line-1)] bg-[var(--color-bg-1)]/70 p-6 backdrop-blur-md transition-colors duration-200 ease-[var(--ease-out-soft)] hover:border-[var(--color-violet-500)]/60 focus-within:border-[var(--color-violet-500)]/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {domain ? <Chip accent={domain.accent}>{domain.label}</Chip> : null}
        <Badge visibility={project.visibility} />
      </div>

      <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-fg-0)]">
        {project.name}
      </h3>

      <p className="measure flex-1 text-sm leading-relaxed text-[var(--color-fg-1)]">
        {project.summary}
      </p>

      <ul className="flex flex-wrap gap-1.5">
        {project.stack.map((tech) => (
          <li key={tech}><Chip>{tech}</Chip></li>
        ))}
      </ul>

      {repoLink ? (
        <a
          href={repoLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm text-[var(--color-cyan-300)] hover:text-[var(--color-cyan-400)]"
        >
          {repoLink.label} ↗
        </a>
      ) : (
        <p className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
          Architecture walkthrough on request
        </p>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Implement `SelectedWork`**

`apps/web/components/sections/SelectedWork.tsx`:

```tsx
import { ProjectCard } from '@/components/cards/ProjectCard'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { getFeaturedProjects } from '@/lib/content'

export function SelectedWork() {
  const projects = getFeaturedProjects()

  return (
    <Section id="work" formation="lattice" labelledBy="work-heading">
      <Container width="bento" className="flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <h2
            id="work-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
          >
            Selected work
          </h2>
          <p className="measure text-lg text-[var(--color-fg-1)]">
            Production platforms across eight domains. Several are client or internal codebases,
            so the code is not public — the architecture is.
          </p>
        </header>

        <div
          data-testid="work-grid"
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6"
        >
          {projects.map((project, index) => (
            <div
              key={project.slug}
              className={index < 2 ? 'xl:col-span-3' : 'xl:col-span-2'}
            >
              <ProjectCard project={project} featured={index < 2} />
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test sections-work
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/cards/ProjectCard.tsx apps/web/components/sections/SelectedWork.tsx apps/web/tests/unit/sections-work.test.tsx
git commit -m "feat(web): add selected work bento with reusable project card"
```

---

## Task 13: How I Lead section

The leadership proof. Content here is drawn from real practices in the profile README — never invent a metric or a quote.

**Files:**
- Create: `apps/web/components/cards/Pillar.tsx`, `apps/web/components/sections/HowILead.tsx`, `apps/web/lib/leadership.ts`
- Test: `apps/web/tests/unit/sections-lead.test.tsx`

**Interfaces:**
- Consumes: `Section`, `Container` (Task 6)
- Produces: `LEADERSHIP_PILLARS`, `PROCESS_STEPS` from `lib/leadership.ts`; `<Pillar title, practices />`; `<HowILead />` (section id `lead`, formation `orbit`)

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-lead.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HowILead } from '@/components/sections/HowILead'
import { LEADERSHIP_PILLARS, PROCESS_STEPS } from '@/lib/leadership'

describe('HowILead', () => {
  it('renders all three pillars', () => {
    render(<HowILead />)
    for (const pillar of LEADERSHIP_PILLARS) {
      expect(screen.getByRole('heading', { name: pillar.title })).toBeInTheDocument()
    }
  })

  it('renders every concrete practice, since the pillars are the leadership evidence', () => {
    render(<HowILead />)
    for (const pillar of LEADERSHIP_PILLARS) {
      for (const practice of pillar.practices) {
        expect(screen.getByText(practice)).toBeInTheDocument()
      }
    }
  })

  it('renders the five-step delivery process in order', () => {
    render(<HowILead />)
    const items = screen.getAllByTestId('process-step')
    expect(items).toHaveLength(5)
    expect(items.map((el) => el.textContent)).toEqual(
      PROCESS_STEPS.map((step, i) => `${String(i + 1).padStart(2, '0')}${step}`)
    )
  })

  it('renders no testimonial block, because no real quote exists yet', () => {
    render(<HowILead />)
    expect(screen.queryByTestId('testimonials')).not.toBeInTheDocument()
  })

  it('declares the orbit formation', () => {
    const { container } = render(<HowILead />)
    expect(container.querySelector('[data-section="lead"]')).toHaveAttribute('data-formation', 'orbit')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-lead
```

Expected: FAIL — cannot resolve `@/components/sections/HowILead`.

- [ ] **Step 3: Define the leadership content**

`apps/web/lib/leadership.ts`:

```ts
export const LEADERSHIP_PILLARS = [
  {
    id: 'direction',
    title: 'Technical direction',
    blurb: 'Setting the architecture standards a team can actually hold to.',
    practices: [
      'Architecture standards agreed up front, not discovered in review',
      'Reversible data migrations — dry-run, apply, rollback',
      'Honest error handling over silent fallbacks',
    ],
  },
  {
    id: 'review',
    title: 'Code review & standards',
    blurb: 'Review as the main channel for direction, not a defect net.',
    practices: [
      'Typed backends with enforced security rules',
      'Conventional commits and staged builds',
      'Code the next engineer can read without a handover',
    ],
  },
  {
    id: 'mentorship',
    title: 'Mentorship & delivery',
    blurb: 'Accountable for how the work gets built, not only that it ships.',
    practices: [
      'Engineers grow through review, with context attached',
      'Delivery cadence the team sets and sustains',
      'Production ownership after launch, not handoff',
    ],
  },
] as const

export const PROCESS_STEPS = [
  'Discovery',
  'Architecture',
  'Delivery cadence',
  'Launch',
  'Operate',
] as const
```

- [ ] **Step 4: Implement `Pillar` and `HowILead`**

`apps/web/components/cards/Pillar.tsx`:

```tsx
export function Pillar({
  title, blurb, practices,
}: {
  title: string
  blurb: string
  practices: readonly string[]
}) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line-1)] bg-[var(--color-bg-1)]/70 p-6 backdrop-blur-md">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-violet-300)]">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--color-fg-2)]">{blurb}</p>
      <ul className="flex flex-col gap-2.5 border-t border-[var(--color-line-1)] pt-4">
        {practices.map((practice) => (
          <li key={practice} className="flex gap-2.5 text-sm leading-relaxed text-[var(--color-fg-1)]">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-violet-400)]" />
            {practice}
          </li>
        ))}
      </ul>
    </article>
  )
}
```

`apps/web/components/sections/HowILead.tsx`:

```tsx
import { Pillar } from '@/components/cards/Pillar'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { LEADERSHIP_PILLARS, PROCESS_STEPS } from '@/lib/leadership'

export function HowILead() {
  return (
    <Section id="lead" formation="orbit" labelledBy="lead-heading">
      <Container className="flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <h2
            id="lead-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
          >
            How I lead
          </h2>
          <p className="measure text-lg text-[var(--color-fg-1)]">
            Technical direction, code review and mentorship — the parts of the job that decide
            whether a team ships something maintainable or merely ships.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {LEADERSHIP_PILLARS.map((pillar) => (
            <Pillar key={pillar.id} title={pillar.title} blurb={pillar.blurb} practices={pillar.practices} />
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--color-line-1)] pt-8">
          <h3 className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
            How I run a project
          </h3>
          <ol className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {PROCESS_STEPS.map((step, index) => (
              <li
                key={step}
                data-testid="process-step"
                className="flex flex-col gap-2 border-t border-[var(--color-violet-500)]/40 pt-3"
              >
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-violet-400)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm text-[var(--color-fg-1)]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test sections-lead
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/leadership.ts apps/web/components/cards/Pillar.tsx apps/web/components/sections/HowILead.tsx apps/web/tests/unit/sections-lead.test.tsx
git commit -m "feat(web): add How I Lead section with pillars and process strip"
```

---

## Task 14: Craft and Stack sections

The Craft section's 3D controls exist in M0 as **correctly disabled** controls with an explanatory note — never as buttons that silently do nothing. M2 and M4 enable them.

**Files:**
- Create: `apps/web/components/sections/Craft.tsx`, `apps/web/components/sections/Stack.tsx`
- Test: `apps/web/tests/unit/sections-craft.test.tsx`

**Interfaces:**
- Consumes: `getSkillGroups` (Task 4); `Chip`, `Button` (Task 8)
- Produces: `<Craft />` (section id `craft`, formation `scatter`) and `<Stack />` (section id `stack`, formation `grid`)

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-craft.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Craft } from '@/components/sections/Craft'
import { Stack } from '@/components/sections/Stack'
import { getSkillGroups } from '@/lib/content'

describe('Craft', () => {
  it('makes the 60fps claim the site itself has to honour', () => {
    render(<Craft />)
    expect(screen.getByText(/60 fps on a mid-range phone/i)).toBeInTheDocument()
  })

  it('disables the 3D controls rather than shipping buttons that do nothing', () => {
    render(<Craft />)
    expect(screen.getByRole('button', { name: /enable physics/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /view in ar/i })).toBeDisabled()
  })

  it('explains why the controls are inactive, so the section never looks broken', () => {
    render(<Craft />)
    expect(screen.getByText(/interactive demo arrives with the 3d layer/i)).toBeInTheDocument()
  })

  it('declares the scatter formation', () => {
    const { container } = render(<Craft />)
    expect(container.querySelector('[data-section="craft"]')).toHaveAttribute('data-formation', 'scatter')
  })
})

describe('Stack', () => {
  it('renders all six skill groups with every item', () => {
    render(<Stack />)
    const groups = getSkillGroups()
    expect(groups).toHaveLength(6)
    for (const group of groups) {
      const region = screen.getByTestId(`skill-group-${group.id}`)
      expect(within(region).getByRole('heading', { name: group.label })).toBeInTheDocument()
      for (const item of group.items) {
        expect(within(region).getByText(item.name)).toBeInTheDocument()
      }
    }
  })

  it('explains the default stack and when it is departed from', () => {
    render(<Stack />)
    expect(screen.getByText(/TypeScript, Next.js, Node and Postgres/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-craft
```

Expected: FAIL — cannot resolve `@/components/sections/Craft`.

- [ ] **Step 3: Implement `Craft`**

`apps/web/components/sections/Craft.tsx`:

```tsx
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { Button } from '@/components/ui/Button'

export function Craft() {
  return (
    <Section id="craft" formation="scatter" labelledBy="craft-heading">
      <Container className="flex flex-col gap-8 lg:max-w-[46ch] lg:pl-0">
        <h2
          id="craft-heading"
          className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-cyan-300)]"
        >
          Craft: 3D &amp; AR
        </h2>

        <p className="text-lg leading-relaxed text-[var(--color-fg-1)]">
          The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone.
          Rigid-body physics, spatial audio, mobile joystick controls — and the performance
          budgets that make it viable.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled>Enable physics</Button>
          <Button variant="secondary" disabled>View in AR</Button>
        </div>

        <p className="font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--color-fg-3)]">
          The interactive demo arrives with the 3D layer. The background you are looking at is
          its stand-in — same position, same fallback path.
        </p>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 4: Implement `Stack`**

`apps/web/components/sections/Stack.tsx`:

```tsx
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { Chip } from '@/components/ui/Chip'
import { getSkillGroups } from '@/lib/content'

export function Stack() {
  const groups = getSkillGroups()

  return (
    <Section id="stack" formation="grid" labelledBy="stack-heading">
      <Container className="flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <h2
            id="stack-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
          >
            Stack
          </h2>
          <p className="measure text-lg text-[var(--color-fg-1)]">
            The default is TypeScript, Next.js, Node and Postgres/Firebase. I depart from it when
            the domain earns it — containerised services where operations matter, Firestore where
            offline-first does.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <section key={group.id} data-testid={`skill-group-${group.id}`} className="flex flex-col gap-3">
              <h3 className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
                {group.label}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <li key={item.name}><Chip level={item.level}>{item.name}</Chip></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test sections-craft
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/sections/Craft.tsx apps/web/components/sections/Stack.tsx apps/web/tests/unit/sections-craft.test.tsx
git commit -m "feat(web): add craft and stack sections with disabled 3D controls"
```

---

## Task 15: Timeline and Writing sections

**Files:**
- Create: `apps/web/components/cards/TimelineItem.tsx`, `apps/web/components/cards/ArticleCard.tsx`, `apps/web/components/sections/Timeline.tsx`, `apps/web/components/sections/Writing.tsx`, `apps/web/lib/format-period.ts`
- Test: `apps/web/tests/unit/sections-timeline.test.tsx`

**Interfaces:**
- Consumes: `getExperience`, `getWriting`, `getProfile` (Task 4)
- Produces: `formatPeriod({ from, to? }): string` (e.g. `"Jan 2025 — Present"`); `<TimelineItem experience />`; `<ArticleCard article />`; `<Timeline />` (section id `timeline`); `<Writing />` (section id `writing`)

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-timeline.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline } from '@/components/sections/Timeline'
import { Writing } from '@/components/sections/Writing'
import { formatPeriod } from '@/lib/format-period'
import { getExperience, getWriting } from '@/lib/content'

describe('formatPeriod', () => {
  it('renders an open-ended period as Present', () => {
    expect(formatPeriod({ from: '2025-01' })).toBe('Jan 2025 — Present')
  })

  it('renders a closed period with both endpoints', () => {
    expect(formatPeriod({ from: '2020-01', to: '2023-12' })).toBe('Jan 2020 — Dec 2023')
  })
})

describe('Timeline', () => {
  it('renders every role with its highlights', () => {
    render(<Timeline />)
    for (const entry of getExperience()) {
      expect(screen.getByRole('heading', { name: `${entry.title} · ${entry.org}` })).toBeInTheDocument()
      for (const highlight of entry.highlights) {
        expect(screen.getByText(highlight)).toBeInTheDocument()
      }
    }
  })

  it('flags the placeholder earlier-roles entry in the DOM only', () => {
    const { container } = render(<Timeline />)
    expect(container.querySelectorAll('[data-placeholder="true"]')).toHaveLength(1)
  })
})

describe('Writing', () => {
  it('renders a card per article with an external link', () => {
    render(<Writing />)
    const articles = getWriting()
    expect(screen.getAllByRole('article')).toHaveLength(articles.length)
    for (const article of articles) {
      expect(screen.getByRole('link', { name: article.title })).toHaveAttribute('href', article.url)
    }
  })

  it('renders the elsewhere links so the section is never bare', () => {
    render(<Writing />)
    expect(screen.getByRole('link', { name: /medium/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-timeline
```

Expected: FAIL — cannot resolve `@/lib/format-period`.

- [ ] **Step 3: Implement the period formatter**

`apps/web/lib/format-period.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatYearMonth(value: string): string {
  const [year, month] = value.split('-')
  const index = Number(month) - 1
  return `${MONTHS[index] ?? '???'} ${year}`
}

export function formatPeriod(period: { from: string; to?: string }): string {
  return `${formatYearMonth(period.from)} — ${period.to ? formatYearMonth(period.to) : 'Present'}`
}
```

- [ ] **Step 4: Implement the cards and sections**

`apps/web/components/cards/TimelineItem.tsx`:

```tsx
import type { Experience } from '@repo/contracts'
import { formatPeriod } from '@/lib/format-period'

export function TimelineItem({ experience }: { experience: Experience }) {
  return (
    <li
      data-placeholder={experience.placeholder}
      className="relative flex flex-col gap-3 border-l border-[var(--color-line-1)] pb-10 pl-6 last:pb-0"
    >
      <span
        aria-hidden="true"
        className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-[var(--color-violet-400)]"
      />
      <div className="flex flex-col gap-1">
        <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-fg-0)]">
          {experience.title} · {experience.org}
        </h3>
        <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-3)]">
          {formatPeriod(experience.period)}
          {experience.location ? ` · ${experience.location}` : ''}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {experience.highlights.map((highlight) => (
          <li key={highlight} className="measure text-sm leading-relaxed text-[var(--color-fg-1)]">
            {highlight}
          </li>
        ))}
      </ul>
    </li>
  )
}
```

`apps/web/components/cards/ArticleCard.tsx`:

```tsx
import type { Writing as Article } from '@repo/contracts'

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article
      data-placeholder={article.placeholder}
      className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-line-1)] bg-[var(--color-bg-1)]/70 p-5 backdrop-blur-md transition-colors hover:border-[var(--color-cyan-400)]/50"
    >
      <p className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
        {new Date(article.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
      </p>
      <h3 className="font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--color-fg-0)]">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-cyan-300)]">
          {article.title}
        </a>
      </h3>
      <p className="flex-1 text-sm leading-relaxed text-[var(--color-fg-2)]">{article.excerpt}</p>
    </article>
  )
}
```

`apps/web/components/sections/Timeline.tsx`:

```tsx
import { TimelineItem } from '@/components/cards/TimelineItem'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { getExperience } from '@/lib/content'

export function Timeline() {
  return (
    <Section id="timeline" labelledBy="timeline-heading">
      <Container className="flex flex-col gap-12">
        <h2
          id="timeline-heading"
          className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
        >
          Experience
        </h2>
        <ol className="flex flex-col">
          {getExperience().map((entry) => (
            <TimelineItem key={`${entry.org}-${entry.title}`} experience={entry} />
          ))}
        </ol>
      </Container>
    </Section>
  )
}
```

`apps/web/components/sections/Writing.tsx`:

```tsx
import { ArticleCard } from '@/components/cards/ArticleCard'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { getProfile, getWriting } from '@/lib/content'

export function Writing() {
  const articles = getWriting()
  const elsewhere = getProfile().links.filter((l) => l.kind !== 'primary')

  return (
    <Section id="writing" labelledBy="writing-heading">
      <Container className="flex flex-col gap-12">
        <h2
          id="writing-heading"
          className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
        >
          Writing &amp; elsewhere
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.title} article={article} />
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--color-line-1)] pt-8">
          {elsewhere.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test sections-timeline
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/format-period.ts apps/web/components/cards apps/web/components/sections/Timeline.tsx apps/web/components/sections/Writing.tsx apps/web/tests/unit/sections-timeline.test.tsx
git commit -m "feat(web): add experience timeline and writing sections"
```

---

## Task 16: Contact section

M0 has no API, so the form ships its **offline state as its only state** — exactly the fallback the spec requires when the API is unreachable. M3 adds the `POST /v1/contact` path in front of this same component, keeping `mailto:` as the failure path.

**Files:**
- Create: `apps/web/components/sections/Contact.tsx`
- Test: `apps/web/tests/unit/sections-contact.test.tsx`

**Interfaces:**
- Consumes: `getProfile` (Task 4); `Button` (Task 8)
- Produces: `<Contact />` (section id `contact`, formation `ring`) — a labelled form that composes a `mailto:` URL, plus a copy-email control

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/sections-contact.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Contact } from '@/components/sections/Contact'
import { getProfile } from '@/lib/content'

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('Contact', () => {
  it('states availability as consulting, not job-hunting', () => {
    render(<Contact />)
    expect(screen.getByText(/open to consulting & collaboration/i)).toBeInTheDocument()
  })

  it('labels every field', () => {
    render(<Contact />)
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('builds a mailto link from what the visitor typed', async () => {
    const user = userEvent.setup()
    render(<Contact />)
    await user.type(screen.getByLabelText(/your name/i), 'Ada')
    await user.type(screen.getByLabelText(/message/i), 'Lets build something')
    const submit = screen.getByRole('link', { name: /send message/i })
    expect(submit.getAttribute('href')).toContain(`mailto:${getProfile().email}`)
    expect(submit.getAttribute('href')).toContain('Ada')
  })

  it('copies the address to the clipboard', async () => {
    const user = userEvent.setup()
    render(<Contact />)
    await user.click(screen.getByRole('button', { name: /copy email/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(getProfile().email)
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('declares the ring formation', () => {
    const { container } = render(<Contact />)
    expect(container.querySelector('[data-section="contact"]')).toHaveAttribute('data-formation', 'ring')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test sections-contact
```

Expected: FAIL — cannot resolve `@/components/sections/Contact`.

- [ ] **Step 3: Implement `Contact`**

`apps/web/components/sections/Contact.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Container } from '@/components/layout/Container'
import { Section } from '@/components/layout/Section'
import { getProfile } from '@/lib/content'

const FIELD =
  'min-h-11 w-full rounded-[var(--radius-chip)] border border-[var(--color-line-2)] bg-[var(--color-bg-1)] px-3 py-2.5 text-sm text-[var(--color-fg-0)] placeholder:text-[var(--color-fg-3)]'

export function Contact() {
  const profile = getProfile()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const mailto =
    `mailto:${profile.email}` +
    `?subject=${encodeURIComponent(`Enquiry from ${name || 'the portfolio site'}`)}` +
    `&body=${encodeURIComponent(`${message}\n\n— ${name}${email ? ` (${email})` : ''}`)}`

  async function copyEmail() {
    await navigator.clipboard.writeText(profile.email)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Section id="contact" formation="ring" labelledBy="contact-heading">
      <Container className="flex flex-col gap-12 lg:flex-row lg:justify-between">
        <header className="flex max-w-[38ch] flex-col gap-4">
          <h2
            id="contact-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-fg-0)]"
          >
            {profile.availability}
          </h2>
          <p className="text-lg leading-relaxed text-[var(--color-fg-1)]">
            Leading a build, untangling an architecture, or making something run at 60 fps — if
            it&rsquo;s an interesting problem, I&rsquo;d like to hear about it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyEmail}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-chip)] border border-[var(--color-line-2)] px-4 text-sm text-[var(--color-fg-1)] hover:border-[var(--color-cyan-400)]"
            >
              Copy email
            </button>
            <span aria-live="polite" className="text-sm text-[var(--color-cyan-300)]">
              {copied ? 'Copied' : ''}
            </span>
          </div>
        </header>

        <form className="flex w-full max-w-md flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-name" className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
              Your name
            </label>
            <input id="contact-name" className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-email" className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
              Email
            </label>
            <input id="contact-email" type="email" className={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-message" className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
              Message
            </label>
            <textarea id="contact-message" rows={5} className={`${FIELD} resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <a
            href={mailto}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-chip)] bg-[var(--color-fg-0)] px-5 text-sm font-medium text-[var(--color-bg-0)] transition-colors hover:bg-[var(--color-violet-300)]"
          >
            Send message
          </a>

          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-3)]">
            Opens your mail client. Direct submission arrives with the API.
          </p>
        </form>
      </Container>
    </Section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test sections-contact
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sections/Contact.tsx apps/web/tests/unit/sections-contact.test.tsx
git commit -m "feat(web): add contact section with mailto fallback as its only state"
```

---

## Task 17: Page assembly, metadata, JSON-LD, sitemap

**Files:**
- Modify: `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`
- Create: `apps/web/lib/seo.ts`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`
- Test: `apps/web/tests/unit/seo.test.ts`, `apps/web/tests/unit/page.test.tsx`

**Interfaces:**
- Consumes: every section component (Tasks 11–16); `getProfile`, `getProjects` (Task 4)
- Produces: `SITE_URL`, `buildPersonJsonLd(): object`; `/` composing the nine sections in spec order; `sitemap.ts` and `robots.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/unit/seo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildPersonJsonLd } from '@/lib/seo'
import { getProfile } from '@/lib/content'

describe('buildPersonJsonLd', () => {
  const jsonLd = buildPersonJsonLd() as Record<string, unknown>

  it('declares a schema.org Person', () => {
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@type']).toBe('Person')
    expect(jsonLd.name).toBe('Wieslaw Samushonga')
  })

  it('lists both job titles, so seniority is machine-readable', () => {
    expect(jsonLd.jobTitle).toEqual(['Tech Lead', 'Senior Software Engineer'])
  })

  it('lists both employers as organisations', () => {
    expect(jsonLd.worksFor).toEqual([
      { '@type': 'Organization', name: 'Data Age' },
      { '@type': 'Organization', name: 'Rapidev Labs', url: 'https://rapidevlabs.com' },
    ])
  })

  it('exposes every profile link as sameAs', () => {
    const sameAs = jsonLd.sameAs as string[]
    const httpLinks = getProfile().links.filter((l) => l.url.startsWith('http'))
    expect(sameAs).toHaveLength(httpLinks.length)
  })
})
```

`apps/web/tests/unit/page.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import HomePage from '@/app/page'

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  })
})

const EXPECTED_ORDER = [
  'hero', 'proof', 'work', 'lead', 'craft', 'stack', 'timeline', 'writing', 'contact',
]

describe('home page', () => {
  it('renders all nine sections in the order the narrative requires', () => {
    const { container } = render(<HomePage />)
    const ids = Array.from(container.querySelectorAll('[data-section]')).map((el) =>
      el.getAttribute('data-section')
    )
    expect(ids).toEqual(EXPECTED_ORDER)
  })

  it('has exactly one h1', () => {
    const { container } = render(<HomePage />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })

  it('gives every section an accessible name or an explicit sr-only heading', () => {
    const { container } = render(<HomePage />)
    for (const section of Array.from(container.querySelectorAll('section[data-section]'))) {
      const labelled = section.getAttribute('aria-labelledby')
      const hasHeading = section.querySelector('h1, h2') !== null
      expect(Boolean(labelled) || hasHeading).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter web test seo
```

Expected: FAIL — cannot resolve `@/lib/seo`.

- [ ] **Step 3: Implement SEO helpers**

`apps/web/lib/seo.ts`:

```ts
import { getProfile } from './content'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wieslaw.dev'

export function buildPersonJsonLd(): object {
  const profile = getProfile()
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    url: SITE_URL,
    jobTitle: profile.roles.map((role) => role.title),
    worksFor: profile.roles.map((role) => ({
      '@type': 'Organization',
      name: role.org,
      ...(role.url ? { url: role.url } : {}),
    })),
    address: { '@type': 'PostalAddress', addressLocality: 'Harare', addressCountry: 'ZW' },
    knowsAbout: [
      'Software architecture', 'Technical leadership', 'TypeScript', 'Next.js',
      'WebGL', 'Real-time 3D', 'Augmented reality',
    ],
    sameAs: profile.links.filter((l) => l.url.startsWith('http')).map((l) => l.url),
  }
}
```

- [ ] **Step 4: Compose the page**

Replace `apps/web/app/page.tsx` entirely:

```tsx
import { Contact } from '@/components/sections/Contact'
import { Craft } from '@/components/sections/Craft'
import { Hero } from '@/components/sections/Hero'
import { HowILead } from '@/components/sections/HowILead'
import { ProofStrip } from '@/components/sections/ProofStrip'
import { SelectedWork } from '@/components/sections/SelectedWork'
import { Stack } from '@/components/sections/Stack'
import { Timeline } from '@/components/sections/Timeline'
import { Writing } from '@/components/sections/Writing'

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProofStrip />
      <SelectedWork />
      <HowILead />
      <Craft />
      <Stack />
      <Timeline />
      <Writing />
      <Contact />
    </>
  )
}
```

- [ ] **Step 5: Complete the root layout metadata and JSON-LD**

Replace `apps/web/app/layout.tsx` entirely:

```tsx
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'
import { Nav } from '@/components/layout/Nav'
import { SkipLink } from '@/components/layout/SkipLink'
import { PosterLayer } from '@/components/three/PosterLayer'
import { getProfile } from '@/lib/content'
import { buildPersonJsonLd, SITE_URL } from '@/lib/seo'
import { fontVariables } from './fonts'
import './globals.css'

const profile = getProfile()

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${profile.name} — Tech Lead & Senior Software Engineer`,
    template: `%s — ${profile.name}`,
  },
  description: profile.sub,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'profile',
    url: SITE_URL,
    title: `${profile.name} — ${profile.headline}`,
    description: profile.sub,
    siteName: profile.name,
  },
  twitter: { card: 'summary_large_image', creator: '@wiesysams1' },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <SkipLink />
        <PosterLayer />
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <script
          type="application/ld+json"
          // JSON-LD is built from validated content, so this is not user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildPersonJsonLd()) }}
        />
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Add sitemap and robots**

`apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: 'monthly', priority: 1 }]
}
```

`apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/admin' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

- [ ] **Step 7: Run all tests and build**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web dev
```

Expected: every unit test passes; build succeeds; `http://localhost:3000` shows all nine sections with the poster background shifting as you scroll. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app apps/web/lib/seo.ts apps/web/tests/unit/seo.test.ts apps/web/tests/unit/page.test.tsx
git commit -m "feat(web): compose home page with metadata, JSON-LD, sitemap and robots"
```

---

## Task 18: End-to-end, accessibility and visual regression

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/tests/e2e/home.spec.ts`, `apps/web/tests/e2e/a11y.spec.ts`, `apps/web/tests/visual/home.spec.ts`
- Modify: `apps/web/package.json` (devDependencies)

**Interfaces:**
- Consumes: the built app from Task 17
- Produces: `pnpm --filter web test:e2e` running Chromium desktop, WebKit, Pixel 5 and a 2560px ultrawide project; axe assertions; masked visual snapshots at 390/834/1440/2560

- [ ] **Step 1: Install Playwright and axe**

```bash
pnpm --filter web add -D @playwright/test @axe-core/playwright
pnpm --filter web exec playwright install --with-deps chromium webkit
```

- [ ] **Step 2: Configure Playwright**

`apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'ultrawide', use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1080 } } },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

- [ ] **Step 3: Write the end-to-end spec**

`apps/web/tests/e2e/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const SECTIONS = ['hero', 'proof', 'work', 'lead', 'craft', 'stack', 'timeline', 'writing', 'contact']

test.describe('home page', () => {
  test('renders every section with visible content at this viewport', async ({ page }) => {
    await page.goto('/')
    for (const id of SECTIONS) {
      const section = page.locator(`[data-section="${id}"]`)
      await expect(section).toBeVisible()
      const box = await section.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThan(80)
    }
  })

  test('never scrolls horizontally', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('the skip link is the first thing keyboard users reach', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeFocused()
  })

  // The primary nav is `hidden lg:flex`, so this only applies at >= 1024px.
  // Below that the bottom sheet carries navigation and is covered by its own test.
  test('nav anchors move the viewport to the target section', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 0
    test.skip(width < 1024, 'primary nav is hidden below the lg breakpoint')

    await page.goto('/')
    await page.locator('nav[aria-label="Primary"] a[href="#work"]').click()
    await expect(page).toHaveURL(/#work$/)
    await expect(page.locator('[data-section="work"]')).toBeInViewport({ ratio: 0.2 })
  })

  test('the poster layer never intercepts pointer events', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'See the work' }).click()
    await expect(page).toHaveURL(/#work$/)
  })

  test('with reduced motion, no section is missing and the background is still painted', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    for (const id of SECTIONS) await expect(page.locator(`[data-section="${id}"]`)).toBeVisible()
    await expect(page.locator('[data-variant="hero"]')).toHaveCount(1)
    await context.close()
  })

  test('with JavaScript disabled, all content is still present', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    for (const id of SECTIONS) await expect(page.locator(`[data-section="${id}"]`)).toBeVisible()
    await context.close()
  })
})

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the bottom sheet opens, navigates and closes', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /open menu/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    await expect(sheet).toBeVisible()
    await sheet.locator('a[href="#work"]').click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/#work$/)
  })
})
```

- [ ] **Step 4: Write the accessibility spec**

`apps/web/tests/e2e/a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('home page has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  ).toEqual([])
})

test('the decorative background contributes nothing to the accessibility tree', async ({ page }) => {
  await page.goto('/')

  // The layer exists and carries all seven variants...
  await expect(page.locator('[data-variant]')).toHaveCount(7)

  // ...but every one of them sits inside an aria-hidden subtree, so a screen reader
  // never announces it. All content is real DOM elsewhere on the page.
  const exposed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-variant]')).filter(
      (el) => el.closest('[aria-hidden="true"]') === null
    ).length
  )
  expect(exposed).toBe(0)
})

test('every interactive element is reachable by keyboard', async ({ page }) => {
  await page.goto('/')
  const interactive = await page.locator('a[href], button:not([disabled]), input, textarea').count()
  expect(interactive).toBeGreaterThan(20)

  const focusable = await page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea')
    return Array.from(nodes).filter((n) => n.tabIndex >= 0).length
  })
  expect(focusable).toBe(interactive)
})
```

- [ ] **Step 5: Write the visual regression spec**

`apps/web/tests/visual/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const WIDTHS = [390, 834, 1440, 2560] as const

// This file sets its own viewport per test, so running it under all five Playwright
// projects would produce 20 near-identical baselines. One engine is enough.
test.skip(({ browserName }) => browserName !== 'chromium', 'visual baselines are chromium-only')

for (const width of WIDTHS) {
  test(`home page layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveScreenshot(`home-${width}.png`, {
      fullPage: true,
      // The gradient background is intentionally excluded: M2 replaces its internals
      // with WebGL, and this suite must not fail on that planned change.
      mask: [page.locator('[aria-hidden="true"]').first()],
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    })
  })
}
```

- [ ] **Step 6: Run the suites**

```bash
pnpm --filter web test:e2e --project=desktop
pnpm --filter web test:e2e --project=mobile
```

Expected: all e2e and a11y tests pass. Visual tests fail on the first run with "snapshot doesn't exist" — that is correct. Generate the baselines, inspect them, then re-run:

```bash
pnpm --filter web test:e2e --project=desktop --update-snapshots
pnpm --filter web test:e2e --project=desktop
```

Expected: PASS. Open `apps/web/tests/visual/home.spec.ts-snapshots/` and confirm each image shows a complete page with no empty regions before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/tests/e2e apps/web/tests/visual apps/web/package.json
git commit -m "test(web): add e2e, accessibility and visual regression suites"
```

---

## Task 19: CI pipeline with enforced budgets

**Files:**
- Create: `.github/workflows/ci.yml`, `apps/web/.size-limit.json`, `apps/web/lighthouserc.json`
- Modify: root `package.json`, `apps/web/package.json`

**Interfaces:**
- Consumes: every prior task's script (`typecheck`, `lint`, `test`, `build`, `test:e2e`, `lint:content`)
- Produces: a CI workflow that fails on typecheck, lint, unit, e2e, a11y or budget regressions, and reports placeholder content without failing

- [ ] **Step 1: Add the budget tooling**

```bash
pnpm --filter web add -D size-limit @size-limit/file @lhci/cli
```

`apps/web/.size-limit.json` — the JS budget from spec §6:

```json
[
  {
    "name": "initial JS (non-3D)",
    "path": ".next/static/chunks/**/*.js",
    "limit": "120 kB",
    "gzip": true
  }
]
```

`apps/web/lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm start",
      "url": ["http://localhost:3000/"],
      "numberOfRuns": 3,
      "settings": { "preset": "mobile" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 0.95 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2000 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Add to `apps/web/package.json` scripts:

```json
"size": "size-limit",
"lighthouse": "lhci autorun"
```

- [ ] **Step 2: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Typecheck, lint, unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - name: Report placeholder content (never fails the build)
        run: pnpm lint:content

  budgets:
    name: Build and budgets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Enforce JS bundle budget
        run: pnpm --filter web size
      - name: Enforce Lighthouse budgets
        run: pnpm --filter web lighthouse

  e2e:
    name: E2E, accessibility and visual
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web exec playwright install --with-deps chromium webkit
      - run: pnpm --filter web test:e2e
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Verify every CI command passes locally**

Run the exact commands CI will run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm lint:content
pnpm build
pnpm --filter web size
pnpm --filter web test:e2e
```

Expected: all green. `pnpm lint:content` prints the 6 placeholder items and exits 0. If `size` fails, inspect with `pnpm --filter web exec next build --profile` before raising the limit — the budget is the deliverable, not an obstacle.

- [ ] **Step 4: Commit and open the pull request**

```bash
git add .github apps/web/.size-limit.json apps/web/lighthouserc.json apps/web/package.json
git commit -m "ci: enforce typecheck, tests, a11y and performance budgets"
git push -u origin feat/m0-foundations
gh pr create --base develop --title "M0: foundations — publishable site with poster background" --body "Implements docs/superpowers/plans/2026-08-15-m0-foundations.md

Delivers a complete, accessible, indexable portfolio at \`/\` — nine sections, real content, designed fallbacks — before any WebGL or API exists.

- Turborepo monorepo: \`apps/web\` + \`packages/contracts\` + \`packages/config\`
- Zod-validated content loader; \`lint:content\` reports 6 placeholders
- \`PosterLayer\` occupies the position M2's WebGL canvas will take
- Contact ships its offline (\`mailto:\`) state, which stays the API failure path in M3
- CI enforces typecheck, lint, unit, e2e, axe, bundle size and Lighthouse budgets

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Definition of done for M0

Every box below must be checked before M1 begins.

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass from a clean `pnpm install --frozen-lockfile`
- [ ] `pnpm --filter web test:e2e` passes on desktop, webkit, mobile, tablet and ultrawide projects
- [ ] Lighthouse ≥ 95 in all four categories; LCP ≤ 2.0 s; CLS ≤ 0.05
- [ ] Initial non-3D JS ≤ 120 KB gzipped
- [ ] No horizontal scroll at 360, 390, 834, 1024, 1440, 1920 or 2560 px
- [ ] Every section renders non-empty with JavaScript disabled and with reduced motion enabled
- [ ] axe reports zero serious or critical violations
- [ ] `pnpm lint:content` lists exactly 6 placeholders and exits 0
- [ ] The site is deployed to a Vercel preview URL and opened on a real mid-range Android handset

**Explicitly NOT in M0** (do not build these here): any WebGL or `three` dependency · any API call or `NEXT_PUBLIC_API_URL` · `/work`, `/lab`, `/about`, `/resume`, `/admin` routes · MDX case-study bodies · Velite · Lenis smooth scroll · Motion animation library · OG image generation.

