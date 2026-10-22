# JS bundle budgets

What `apps/web/.size-limit.json` counts, what each entry measured on a clean build, and the chunks no budget counts on
purpose. CI runs both checks in the `budgets` job after `npm run build`: `npm run size` (each entry within its limit)
and `npm run size:coverage` (`apps/web/scripts/budgets/coverage.ts`: every emitted chunk counted by exactly one entry,
or on the never-downloaded list below, and no stale exclusion).

## Limits

Measured 2026-10-22 on `feat/plain-three-s3-s4` (develop 932d116 plus slices S3 and S4 of the plain-three migration,
PR #77) by CI's `budgets` job on Linux, which is the build the gate judges: `next build`, then `npm run size` (gzip;
size-limit 13 gzips the concatenation of an entry's files). A clean local build on Windows agrees to within 0.05 kB
(initial 118.89, route pages 3.26; the four lazy entries are byte-identical).
The rule from the migration spec (section 10): a limit is the measured value plus about 5 percent, rounded up to the
next 0.5 kB below 10 kB and the next 1 kB above, unless the limit is an owner decision.

| Entry | Measured | Limit | Headroom | Where the limit comes from |
|---|---|---|---|---|
| initial JS (non-3D) | 118.84 kB | 120 kB | 1.16 kB | Owner limit since M0. It now also counts `app/error` and `app/global-error` (2.63 kB, loaded on every page, uncounted until S3), so about 116.2 became 118.84: the code did not grow, the gate stopped missing them. Splitting it into "framework pinned, app budgeted" is the owner's call (migration spec section 15, question 2) |
| route pages (about, resume, work, work/[slug], not-found) | 3.27 kB | 3.5 kB | 0.23 kB | measured plus 5 percent (was 4 kB; not-found joined in S3) |
| assembly core (three + CSM + stage + scene, lazy) | 173.24 kB | 182 kB | 8.76 kB | measured plus 5 percent (181.9). Was 268.13 kB of 275 under React Three Fiber |
| late UI (contact form + Craft controls, lazy) | 3.68 kB | 4 kB | 0.32 kB | measured plus 5 percent (3.86) |
| assembly models (GLTFLoader + Meshopt + manifest, lazy) | 23.53 kB | 25 kB | 1.47 kB | measured plus 5 percent (24.7; was 26) |
| hero engine (raw WebGL2 monolith, lazy) | 13.93 kB | 14 kB | 0.07 kB | Owner limit (hero spec S4, migration spec section 15, question 3): unchanged here |

Lazy 3D total (core, models, hero): 210.70 kB, from 305.59 kB before the migration.

## Every emitted chunk and its budget

`npm run size:coverage` prints this table from the build it runs on. On the CI build above (33 chunks; gzip level 9 per
file, so the per-file figures do not sum exactly to the size-limit figures):

| Budget | Chunks |
|---|---|
| initial JS (non-3D) | `87c73c54-*` (React DOM, 54.24), `18-*` (Next runtime and shared app code, 46.40), `app/page-*` (9.07), `app/layout-*` (4.41), `webpack-*` (1.88), `app/global-error-*` (1.33), `app/error-*` (1.30), `main-app-*` (0.22) |
| route pages | `app/about/page-*`, `app/work/page-*`, `app/work/[slug]/page-*` (0.85 each), `app/resume/page-*` (0.43), `app/not-found-*`, `app/_not-found/page-*` (0.15 each) |
| assembly core | `9d78c252.*` (`three.module.js`, the renderer and its shader library, 84.55), `63d2ba32.*` (`three.core.js`, 65.47), `three.*` (the scene, the stage, CSM and `lib/assembly`, 22.05), `134.*` (`lib/models` residency and gate, 1.17) |
| late UI | `late-ui.*` (3.68) |
| assembly models | `models.*` (23.53) |
| hero engine | `hero.*` (13.93) |
| **none, never downloaded** | `framework-*` (68.68, the Pages Router's React DOM), `main-*` (36.89, the Pages Router runtime with its `_app` and `_error` code), `pages/_app-*`, `pages/_error-*`, `polyfills-*` (39.52, `noModule`), and the seven `app/**/route-*` stubs of the route handlers (OG images, robots, sitemap, manifest; 0.15 each, no client code) |

A Windows build emits two more never-downloaded chunks, `655.*` and `826.*`: it splits the Pages Router's `_app` and
`_error` code out of `main-*` (35.12 there) into async chunks with those pinned ids. The core entry excludes them by id
so a local measurement matches CI, and `size:coverage` checks those two exclusions only on Windows, where they must
match a file.

The prerendered `/` and `/about` HTML were checked: their `<script>` tags load only files of the initial entry (all
eight on `/`, all but `app/page-*` on `/about`) plus `polyfills-*` as `noModule`, and nothing else on the
never-downloaded list.

## The models chunk and the three it pulls into core

The GLTFLoader and its helpers import about 13.5 kB gz of `three` that the scene itself does not use (animation clips
and tracks, skinning, the texture and file loaders, and so on). Measured by building with the loader's dynamic import
removed (on the build before the `Timer` change, which added 0.09 kB): core 173.15 to 159.63 kB, all of it in
`63d2ba32.*` (65.40 to 53.16). So the models feature really costs
about 37 kB (23.53 in `models.*` plus about 13.5 in core), not 23.5.

Those bytes cannot move into `models.*` with a cache group. `three.core.js` is one webpack module: tree shaking keeps
the union of the exports the whole app uses, and a module lives in one chunk, so whatever the loader needs from it
ships with the scene. The only ways to move them would be a second copy of `three` for the loader (two copies of every
class, which breaks `instanceof` between the loader's meshes and the scene) or a smaller loader. Neither is worth it at
13.5 kB on a lazy chunk; the `models` cache group is left as it is.

## When a check fails

- `size` over a limit: find what grew with the chunk table above, before raising anything. A limit goes up in its own
  commit that says why, with the new measured value in this file.
- `size:coverage` "counted by no budget": a new chunk. Add its path to the entry it belongs to, or, if a browser never
  downloads it on this site, add a rule with the reason to `NOT_DOWNLOADED` in `scripts/budgets/coverage.ts`.
- `size:coverage` "exclusion matches no file (stale)": an exclusion no longer matches anything. On Windows this can be
  the Pages Router ids `655` and `826` after webpack renumbered them: find the new ids in the build (the files that
  start with the Pages Router `_app` and `_error` modules) and update `.size-limit.json`, `WINDOWS_ONLY_EXCLUSIONS` and
  the rule in `scripts/budgets/coverage.ts`. Anywhere else, remove the dead exclusion.
