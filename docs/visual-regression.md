# Visual regression

`apps/web/tests/visual/home.spec.ts` screenshots the home page at 390, 834, 1440 and 2560 px
(`?nogl=1`, reduced motion, fonts awaited, canvas hidden) and compares it with committed baselines.
Only **Linux** baselines exist (`home-<width>-desktop-linux.png`): win32 and linux rasterise fonts
differently, so a Windows or macOS capture can never match CI. Never commit one.

CI runs it in the `visual` job, inside `mcr.microsoft.com/playwright:v<@playwright/test version>-noble`,
in parallel with e2e. A page that grew or shrank fails on dimensions; otherwise up to 0.2% of pixels may
differ (anti-aliasing noise). On failure the job uploads `visual-diffs` (expected, actual, diff).

## When to regenerate

When a change to the home page's layout or look is intended, or after bumping `@playwright/test`
(change both image tags in `ci.yml` and `visual-baselines.yml` to the same version first). A failing
visual job on a PR that did not intend a visual change is a regression: fix the code, not the baselines.

## How

1. Actions tab, "Update visual baselines", Run workflow, choose your branch.
2. Download the `visual-baselines` artifact, copy the four PNGs into
   `apps/web/tests/visual/home.spec.ts-snapshots/`, look at them, commit.

Shortcut: a failed `visual` run also uploads the new screenshots in `visual-diffs`. With Docker running,
the local equivalent is
`docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble sh -c "npm ci && npm run test:visual -w @repo/web -- --update-snapshots"`.

## Cube parity

`apps/web/tests/visual/cubes-parity.spec.ts` is the pixel gate for the cubes (the Assembly canvas), which the home
suite cannot see (it runs with `?nogl=1`). It exists so the plain-three migration (spec
`2026-10-21-plain-three-migration.md`, slices S1 and S2) can prove it changed no pixel.

- **Seam.** `?cubefreeze=<t>,<from>,<to>,<mix>` freezes a cube frame: `t` seconds on the scene clock (and the intro's
  elapsed time), `from` and `to` formation indices in the order monolith, stream, lattice, orbit, scatter, grid, ring,
  `mix` 0..1. The camera, look-at, light bias, drop, calm and scroll speed land on what they converge to, the idle ticker
  is off and the scroll listener cannot move the state. It exists only in a build with `NEXT_PUBLIC_MODEL_TEST=1` (never
  on Vercel); `scripts/check-no-model-seam.sh` greps the production chunks for `cubefreeze` and `__ASSEMBLY_FREEZE__`.
- **Frames, per viewport (1440x900 and 390x844, DPR 1).** Each formation at rest, three mixes for stream to lattice,
  orbit to scatter and grid to ring, three for the hero hand-over band (monolith to stream, engine off), and the on-load
  assembly at 0.5, 1.5 and 3 s. 22 frames, drawn twice in the same page.
- **What it asserts.** A blank capture can never pass (real draw calls and triangles, instanced cubes, lit pixels and luma
  spread). The two draws of each frame agree. Each draw matches its committed PNG within: mean absolute channel difference
  0.002, 99th-percentile 0.01, at most 0.05% of pixels off by more than 8/255. The rig, instance count, draw calls and
  triangles of every frame, and the programs linked after each pass, match a committed JSON exactly.
- **Why those tolerances.** SwiftShader is deterministic: 4 separate browser sessions on Windows, each drawing all 22 frames
  twice at both sizes (176 captures), differed by exactly 0 on all three measures. The tolerances are headroom for a
  different runner CPU, not for noise; a non-zero difference between two runs of the same build is a finding.
- **Runs** in the `cubes` job in ci.yml, its own job in the Playwright image, with its own build; it does not add to e2e.
  No retries.

Baselines are Linux only, `<frame>-<phone|desktop>-desktop-linux.png` and `state-<size>-desktop-linux.json` in
`apps/web/tests/visual/cubes-parity.spec.ts-snapshots/`. Regenerate from the Actions tab: "Update visual baselines", the
`cube-baselines` artifact. A first run with no baselines fails and uploads the captures in `cube-diffs` (`test-results/`,
files ending `-actual.png`/`-actual.json`): rename them to the names above after looking at them. Locally on Windows the
spec writes `-win32` files that never match CI: do not commit them.
