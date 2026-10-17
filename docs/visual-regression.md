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
