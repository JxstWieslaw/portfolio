# Plain three: scoping the migration off React Three Fiber, with measurements

> Status: **done, 2026-10-22.** All five slices merged or in review: S0 #72, S1 #75, S2 #76, S3 and S4 together in #PR_S3S4. The outcome, measured, is in the section "Outcome" below; the rest of this document is the decision-ready spec as written on 2026-10-21 (base `origin/develop` 95b20a2) and is kept as the record of why.
> Read with `2026-10-01-assembly-journey.md` (the Assembly, section 6 tripwire, D3), `2026-10-06-hero-monolith.md` (section 9 "Plain three", S4 and S5) and `2026-10-02-model-platform.md` (the model slot).
> Every number below was measured on 2026-10-21 in a clean worktree (`C:\tmp\p3a`): `npm ci`, `.next` wiped before each build, `next build`, `npm run size` (size-limit, gzip). Attribution inside a chunk comes from the production source maps (bytes per source module, scaled to the chunk's gzip size, so a per-module gz figure is good to about plus or minus 0.2 kB, a per-package figure to about plus or minus 2 kB). Scratch code and scripts are not in this PR (they lived in `C:\tmp\p3a-out`).

---

## Outcome (2026-10-22)

| Slice | PR | What landed | Proof |
|---|---|---|---|
| S0 | #72 | The cube parity harness: `?cubefreeze`, `cubes-parity.spec.ts`, 22 frames per viewport with Linux baselines made under R3F, the `cubes` CI job | determinism self-check, seam guard |
| S1 | #75 | `components/three/stage/` over R3F's `createRoot`, no `<Canvas>`, no `extend(THREE)` | parity job zero-diff against the S0 baselines |
| S2 | #76 | The stage over plain three (`WebGLRenderer`, `PerspectiveCamera`, the R3F defaults and loop); R3F removed from `package.json` and the lockfile; frame errors to `onError` | parity job zero-diff, unchanged baselines; stage unit tests for every section 8 row |
| S3 | #PR_S3S4 | Budgets re-measured and re-pinned; the App Router error boundaries (2.63 kB, loaded on every page) counted in the initial budget for the first time; `npm run size:coverage` in CI so no chunk escapes a budget; the models chunk's `three` measured and left where webpack must put it | `npm run size`, `npm run size:coverage` |
| S4 | #PR_S3S4 | Comments and docs swept; `THREE.Clock` (deprecated since r183, warned on every page with WebGL) replaced by `Timer` in the stage | parity job unchanged, no re-baselining |

**Budget picture, measured** (clean build, `npm run size`, gzip; the living table is `docs/bundle-budgets.md`):

| Entry | Before (section 1) | After | Limit |
|---|---|---|---|
| initial JS (non-3D) | 119.51 | 118.89 (116.25 plus the 2.63 kB of error boundaries the old globs missed; #73's cheap wins are why it is lower) | 120 (owner) |
| route pages (now with not-found) | 2.97 | 3.26 | 3.5 (was 4) |
| assembly core | **268.13** | **173.24** (minus 94.89, 35 percent) | 182 (was 275) |
| late UI (new in #73) | n/a | 3.68 | 4 |
| assembly models | 23.53 | 23.53 | 25 (was 26) |
| hero engine | 13.93 | 13.93 | 14 (owner) |
| lazy 3D total | 305.59 | **210.70** | |

Against the prediction in section 11: core landed at 173.24, inside the expected 172 to 180 and 1.4 kB above the bare prototype (the full stage with context, error and StrictMode handling). The open question in section 14 about the GLTFLoader's extra `three` modules is answered: about 13.5 kB of `three.core.js` is there only for the loader, and it stays in the core chunk because webpack keeps one module in one chunk (measured by building without the loader: core 159.63; details in `docs/bundle-budgets.md`). The initial gate was not split (section 5 item 6 and section 15 question 2 are still the owner's), and the hero limit is unchanged (question 3).

Still unmeasured, as section 14 says: real-device parse cost and real-GPU colour. They stay on the hero S4 device pass.

---

## 0. Summary

1. **The initial bundle is not a three problem, and migrating three will not move it.** Of the 119.5 kB gz that `initial JS (non-3D)` counts, **about 103 kB (86 percent) is React DOM and the Next runtime**, which the app does not control. The app's own code in it is about **16.8 kB** (route page 12.3, layout 4.4). A real plain-three prototype left the initial figure at 119.46 kB (it was 119.51). The "0.53 kB of headroom" is mostly a property of how the gate is drawn, not of the code. The cheapest available wins are worth about 1 kB measured and 3 to 6 kB estimated; section 5.
2. **The lazy core is where the weight is, and the measured saving is large.** Core is 268.13 kB: three is about 185 kB of it (69 percent), R3F with its six small dependencies about 55 kB (21 percent), three-custom-shader-material 4.5 kB, the app's own scene code about 17 kB. There is no drei and no postprocessing. R3F pulls the whole `three` namespace because its `<Canvas>` component runs `extend(THREE)` (verified in `node_modules/@react-three/fiber/dist/react-three-fiber.esm.js`, line 40). The scene uses **no R3F JSX element at all** (`Scene` returns `null`; everything is imperative through `useThree` and `useFrame`), so R3F is doing very little for 55 kB.
3. **Two real prototypes, measured with the production build:**
   - **Option A, keep R3F but mount it through `createRoot` instead of `<Canvas>`:** core **268.13 to 224.62 kB (minus 43.5)**.
   - **Option B, drop R3F for a small stage over plain three:** core **268.13 to 171.80 kB (minus 96.3, 36 percent)**. Models (23.53) and hero (13.93) unchanged. The lazy 3D total goes from 305.6 to 209.3 kB.
4. **Recommendation: B, delivered in five slices, passing through A's shape as slice 1.** First build a deterministic cube parity harness (it does not exist today for the cubes; the hero has one, the cubes have none), then put the scene behind a small `stage` module with the same three-function surface the scene uses today, then swap its implementation. Expected: core about 175 kB (pin 182), initial unchanged at about 119.5, models 23.5 to 27, hero 13.93. About 4 to 5 builder-days across five PRs.
5. **What the owner must decide** is in section 11. The three that matter: (a) accept B (and its rollback story), (b) whether to redraw the initial gate as "framework pinned, app-owned budgeted" so the 120 kB number stops lying about headroom, (c) the hero's 14 kB limit for S4.

---

## 1. Measured baseline

Production build of `develop` at 95b20a2, Next 15.5.x, three 0.186.1, R3F 9.8.1, three-custom-shader-material 6.4.

| Budget (size-limit, gzip) | Measured | Limit | Headroom |
|---|---|---|---|
| initial JS (non-3D) | **119.51 kB** (the brief says 119.47; the 0.04 is build noise) | 120 | 0.49 |
| route pages (about, resume, work, work/[slug]) | 2.97 | 4 | 1.03 |
| assembly core (three + R3F + CSM + scene, lazy) | **268.13** | 275 | 6.87 |
| assembly models (GLTFLoader + Meshopt + manifest, lazy) | 23.53 | 26 | 2.47 |
| hero engine (raw WebGL2, lazy) | 13.93 | 14 | 0.07 |

What the `initial` glob actually counts (read `.size-limit.json`): the single-dot files under `.next/static/chunks/*.js`, plus `app/page-*` and `app/layout-*`. It **excludes** `framework-*` (that file is the Pages Router's; the App Router ships React DOM inside `87c73c54`), `polyfills-*` (loaded `noModule`, never downloaded by a modern browser) and anything with two dots. Anything with two dots that is not `models`, `hero`, `655` or `826` lands in the **core** glob, which matters in section 5.

---

## 2. What the initial 119.5 kB is made of

Per file, gzip level 9, with attribution from source maps:

| Owner | File | gz kB | Share | Controllable by the app |
|---|---|---|---|---|
| React DOM (Next's compiled copy) | `87c73c54-*.js` | 54.1 | 45 percent | No |
| Next client runtime: router, RSC client, app-router reducer, plus its compiled `react`, `scheduler`, `react-server-dom-webpack` (about 6.1) | `18-*.js` | 46.5 | 39 percent | No |
| Webpack runtime | `webpack-*.js` | 1.95 | 1.6 percent | No |
| `main-app` | `main-app-*.js` | 0.25 | 0.2 percent | No |
| **Framework subtotal** | | **102.8** | **86 percent** | |
| App: route page (`app/page-*`) | `app/page-*.js` | 12.33 | 10 percent | Yes |
| App: layout (`app/layout-*`) | `app/layout-*.js` | 4.45 | 4 percent | Yes |
| **App subtotal** | | **16.8** | **14 percent** | |

The app's 16.8 kB, by owner module (gz, estimated from source-map bytes):

| Owner module | Where | gz kB | Notes |
|---|---|---|---|
| `sections/ContactForm.tsx` | page | 2.0 | form state, mailto hand-off, copy button; below the fold |
| `lib/formations/` (`render`, `generators`, `config`, `fallback`) | page | 2.6 | the 2D poster painter plus `readCapabilities`/`instanceKeep` that `AssemblyLayer` needs |
| `layout/Nav.tsx` | layout | 1.9 | needed at first paint |
| `sections/CraftControls.tsx` | page | 1.0 | physics toggle and HUD disclosure, mid-page |
| `ui/Reveal.tsx` | page | 0.9 | needed (reveal on scroll) |
| `layout/BottomSheet.tsx` | layout | 0.9 | the mobile menu dialog; only used after a tap |
| `three/AssemblyLayer.tsx` + `FieldCanvas.tsx` | page | 1.4 | the lazy shell and the 2D canvases |
| `next/dynamic` shell (`loadable`, `app-dynamic`, `preload-chunks`, `dynamic-bailout`, `async-local-storage`) | page | about 1.1 | exists only because `AssemblyLayer` uses `next/dynamic` |
| `lib/assembly/` (`lcp`, `capabilities`, `attractor-store`) | page | 0.9 | needed to gate the lazy chunk |
| `sections/AttractorField.tsx` | page | 0.5 | |
| `ui/Button.tsx`, `lib/accent.ts`, `lib/cx.ts`, `ui/Eyebrow.tsx` | **both** page and layout | about 0.8 each time counted twice, so about 0.7 of pure duplication | App Router does not dedupe modules across the layout and page entries |
| Everything else | | about 2.7 | |

**Reading:** to gain 1 kB of headroom the app has to delete 6 percent of its own initial code. To gain it from the framework it has to wait for a Next or React release. This is why "every new eager feature fights for it": the gate is a ceiling drawn 0.5 kB above a floor the team does not control.

---

## 3. What is in the lazy core (268.13 kB)

Chunks matched by the core glob, per file, with attribution:

| Owner | File(s) | gz kB | Share of core |
|---|---|---|---|
| **three** (whole namespace) | `63d2ba32` 100.6 + `9d78c252` 88.0 (about 99.0 + 86.4 of it three by source map) | **about 185** | **69 percent** |
| **@react-three/fiber** (reconciler, events, store, loop) | `c50242f1` | about 51 | 19 percent |
| R3F's small dependencies (its-fine, react-use-measure, zustand, suspend-react, use-sync-external-store, scheduler) | inside `845` | about 4 | 1.5 percent |
| three-custom-shader-material | inside `845` | 4.5 | 1.7 percent |
| App: scene, artefact, material, GLSL strings, `lib/assembly` maths | `three-*` | 16.2 | 6 percent |
| App: `lib/models` residency and gate | `134` | 1.2 | 0.5 percent |

(The per-chunk gz figures sum to 266.8; size-limit reports 268.13 because it gzips the concatenation.) The models chunk (23.5) separately holds `GLTFLoader`, the Meshopt decoder, `BufferGeometryUtils`/`SkeletonUtils` and the manifest; it shares `three` with the core, which is why it is small.

**Which three modules does the scene use?** Greps of `from 'three'` in `components/` and `lib/` show one small set (value imports only):

`ACESFilmicToneMapping, AdditiveBlending, AnimationMixer, BackSide, Box3, BoxGeometry, BufferAttribute, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, InstancedBufferAttribute, InstancedBufferGeometry, LoadingManager, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator, PlaneGeometry, PointLight, Scene, TorusGeometry, Vector2, Vector3, Vector4`

plus what a stage has to create itself: `WebGLRenderer`, `PerspectiveCamera`, `Clock`. The model chunk adds `GLTFLoader`, the Meshopt decoder and the helpers (and their own `three` imports).

**Tree-shaken cost of exactly that set** (esbuild, minified, gzip level 9, `three` as installed; scripts were scratch):

| Experiment | gz kB |
|---|---|
| `import * as THREE` (what R3F forces) | 185.9 |
| The 28 names above, no renderer | 83.9 |
| The 28 names + `WebGLRenderer`, `PerspectiveCamera`, `Clock` (the plain-three floor) | **137.7** |
| ... + three-custom-shader-material | 141.3 |
| ... + GLTFLoader + Meshopt decoder (the models chunk's code included) | 168.7 |
| R3F with `<Canvas>` (`extend(THREE)`) + CSM + the 28 names | 247.9 (the real core is 268.13 with 17 kB of app code, so the model agrees with reality to within 2 percent) |
| R3F through `createRoot`, no `<Canvas>`, + CSM + the 28 names | 194.5 |

In the esbuild bundle of the floor, `three.module.js` (the renderer and the whole `ShaderChunk`/`ShaderLib` text library) is 355 kB raw of 557 kB. **That is the irreducible part**: the renderer needs its shader library and three does not offer a partial build. Roughly 138 kB gz is the honest floor for any three-based stage; the 185 kB we ship is 48 kB above it. Webpack plus Terser (what Next uses) tree-shakes slightly worse than esbuild: the measured three in the prototype below is 149 kB, including the GLTFLoader's own three dependencies.

---

## 4. Measured prototypes (production builds, not estimates)

Both prototypes were built in the scratch worktree against `AssemblyCanvas.tsx` with only the `Canvas`/`useThree`/`useFrame` import changed, then reverted. They are throwaway: the stage was about 100 lines and did not yet have context-loss, give-up, visibility or error handling.

| Prototype | core gz | change vs 268.13 | models | hero | initial |
|---|---|---|---|---|---|
| Baseline | 268.13 | | 23.53 | 13.93 | 119.51 |
| **A**: R3F kept, `createRoot` + a 40-line canvas wrapper replacing `<Canvas>` (no `extend(THREE)`) | **224.62** | **minus 43.5** | 23.53 | 13.93 | unchanged |
| **B**: no R3F, a ~100-line stage over `WebGLRenderer` with the same `useThree`/`useFrame` surface | **171.80** | **minus 96.3** | 23.53 | 13.93 | 119.46 |

In B, chunk by chunk: the two `three` chunks went from 100.6 + 88.0 to 64.9 + 84.2 gz, the 51 kB R3F chunk disappeared, and the app's `three-*` chunk grew from 16.2 to 20.6 (it now holds CSM 4.5 and the stage). The type-check passed in both (`next build` includes it).

A barrel alias (`resolve.alias` of `three` to a hand-written barrel for R3F) was not built. It would need to export every `THREE.*` name R3F's core references explicitly (`WebGLRenderer`, `Raycaster`, `Clock`, `Layers`, the shadow-map constants, the cameras...) and would break silently when R3F adds one. `createRoot` removes the cause instead of papering over it, and the comment in R3F's own source says to do exactly that ("users can extend their own elements by using the createRoot API instead").

---

## 5. Cheap wins available now (initial bundle, no migration)

**Honest answer: they exist, but they are small, and the biggest lever is the gate, not the code.**

| # | Win | Evidence | gz | Risk | Do it? |
|---|---|---|---|---|---|
| 1 | Replace `next/dynamic` in `AssemblyLayer` with `React.lazy` + `Suspense fallback={null}` (the layer already mounts only after an effect, so SSR is irrelevant) | In a build with items 1 and 2 together, initial 119.51 to **118.50 (minus 1.0)** | about minus 0.3 to 0.6 by itself (not separable in my builds) | low; the two `vi.mock('next/dynamic')` unit tests change; the type of the give-up fallback needs a small cast | yes |
| 2 | Lazy-load `ContactForm` and `CraftControls` behind small `'use client'` wrappers that call `next/dynamic` | same build; a new 3.98 kB raw (about 1.7 gz) chunk appeared | about minus 0.7 for both | medium: a below-the-fold form hydrating late; the form must still work before it loads (SSR HTML stays, the mailto hand-off needs JS). **Calling `dynamic()` directly inside the server components `Contact`/`Craft` did nothing (no chunk is emitted, page chunk shrank by 1 kB raw only); it has to be a client wrapper** | owner call; ship only if the form degrades gracefully |
| 3 | Open-on-demand `BottomSheet` | estimated from source map | about minus 0.9 | medium: the closed `<dialog id>` is the target of `aria-controls`; E2E and the a11y spec read it | later |
| 4 | Remove the layout/page duplicate modules (`Button`, `accent`, `cx`, `Eyebrow`) by moving shared client bits into one shared chunk, or by making one of the entries import-only | estimated | about minus 0.7 | low, but Next controls the chunk graph | later |
| 5 | Defer the 2D poster painter (`lib/formations/render`, `generators`, `config`) until after the LCP gate | estimated from source map | about minus 2.0 to 2.6 | **high**: those 2D canvases are the first paint and the fallback on every no-WebGL path (journey spec 5.7) | no, unless the owner wants it |
| 6 | Redraw the gate | n/a | n/a | none to users | **yes, see below** |

Sum if 1 to 4 are done: **about 3 to 4 kB**; with 5, about 6. That moves the initial figure from 119.5 to roughly 115.5 to 116.5.

**Two cautions the owner should know before spending on this:**

- **A chunk moved out of the initial bundle is counted in the core glob** unless excluded. In the measured build the new lazy chunk took core from 268.13 to 269.82. Any slice that code-splits UI must add a path exclusion (or a new entry, "deferred UI chunks") to `.size-limit.json`, or it just shifts bytes between two gates.
- **None of these helps the real user much.** The framework bytes (103 kB) are on the critical path either way. The honest user-facing lever is the Next or React upgrade (`docs/next-16-upgrade-notes.md`), and I have not measured what Next 16 would do to the 103 kB (unmeasured).

**Item 6, the gate (recommended, needs the owner).** Replace the single `initial JS (non-3D)` 120 kB entry with two:

| New entry | Counts | Limit now | Why |
|---|---|---|---|
| `framework (React DOM + Next runtime + webpack runtime)` | `87c73c54-*`, `18-*`, `webpack-*`, `main-app-*` | pinned at measured plus 2 percent (about 105) | changes only on a Next or React bump, and then the PR says so |
| `app initial (page + layout)` | `app/page-*`, `app/layout-*` | 20 kB (measured 16.8) | **3.2 kB of real headroom for eager features**, instead of 0.5 |

This changes no code and no user-visible behaviour; it states the budget in terms the team can act on. Hash-named chunk filenames make the framework glob fragile (the `87c73c54` prefix is a Next-internal split name); the entry should be defined as "every single-dot file in `chunks/` except the app ones" with a comment, and re-checked when Next is upgraded.

---

## 6. Options

| | A: keep R3F, `createRoot` | B: plain three, own stage | C: share more between hero engine and cubes |
|---|---|---|---|
| What | Replace `<Canvas>` with a wrapper that calls `createRoot(canvas).configure(...)`; `useThree`/`useFrame` still from R3F | Replace `Canvas`/`useThree`/`useFrame` with a ~120-line stage (renderer, camera, scene, clock, demand loop, resize, DPR, subscribers by priority) over plain three; drop `@react-three/fiber` | Move the canvas lifecycle, governor, clock, context-loss and gating code that `HeroLayer` and the cube canvas both need into a shared module |
| Core saving (gz) | **minus 43.5, measured** | **minus 96.3, measured** (prototype) | **0 to minus 2, estimated, unmeasured**; the two engines live in separate chunks by design, so shared code either duplicates or has to ship in the initial chunk |
| Initial effect | none | none (119.46) | risk of plus 1 to 2 kB if the shared code lands in an eager chunk, and the hero chunk is at 13.93 of 14 |
| Behaviour risk | low: R3F still owns the loop, resize and priority-1 render; only the DOM wrapper is ours | medium: we now own what R3F did silently (loop coalescing, priority rules, resize, DPR, error routing); every one is listed in section 8 | medium: touches the hero, which just shipped |
| Keeps the R3F peer constraint (`react >=19 <19.4`) | yes | **no**, which removes a blocker for future React and Next bumps | yes |
| Removes dependencies | none | R3F and its 9 transitive packages (its-fine, react-use-measure, zustand, suspend-react, use-sync-external-store, scheduler, buffer, base64-js; the reconciler itself is bundled into R3F) | none |
| Effort | 0.5 to 1 day | 3 to 4 days including the harness | 1 to 2 days, not recommended now |
| Needed for a later Phase 3 `/lab` | `/lab` would need its own R3F or plain-three decision anyway | a reusable stage is exactly what `/lab` wants | n/a |

**Rejected, with reasons.**

- **Alias `three` to a barrel (A prime):** equal saving to A at worse maintainability (section 4).
- **Drop three-custom-shader-material for `onBeforeCompile` patches** (a further 4.5 kB): rejected for this migration. The golden fixtures (`assembly-bundles.golden.json`, `assembly-cube-output.golden.json`) and the program-key behaviour depend on CSM's patching; changing the shader plumbing and the renderer in the same slice would make a parity failure impossible to attribute. A separate, later option.
- **Move the hero onto three** (to share code): rejected. The hero is deliberately independent of the 170 to 268 kB core so it paints before that chunk is requested (hero spec section 9). C cannot change that.
- **Do nothing:** the hero spec's tripwire was core above 300 kB or a long task above 100 ms on a Moto G-class device. Core is at 268 and the device pass is unmeasured. Doing nothing is a legitimate choice only if the owner is content with 6.9 kB of core headroom for S4, `/lab` and the model platform. The migration is justified by room, parse cost on phones (unmeasured, the raw core is about 1 MB) and the dependency exit, not by a tripwire.

---

## 7. Recommendation

**B, delivered through A's shape.** The first code slice introduces a `stage` module whose public surface is exactly what `AssemblyCanvas` uses today (`Canvas`, `useThree` returning `gl, scene, camera, size, invalidate, clock`, `useFrame(fn, priority)`), implemented first over R3F's `createRoot` (A: minus 43.5 kB, nothing else changes) and then reimplemented over plain three (B: minus 96.3). Both slices are visually identical by construction, and the second is a rewrite of one file behind an interface that the first already proved.

Reasons, in order:

1. The scene never uses an R3F element, so R3F is a 55 kB event loop and a `ResizeObserver`.
2. B is the only option that moves the number the owner is worried about by an amount that matters (core 268 to about 175; 3D total 305 to about 209).
3. The risk is concentrated in one 868-line file (`AssemblyCanvas.tsx` is the only importer of R3F, verified) and is testable, if we first build the harness the cubes lack.
4. It removes the R3F peer range from the Next or React upgrade path.

Not recommended: starting with C, and doing B inside the hero's S4 PR. The hero's S4 is a device pass; it should not carry a renderer swap.

---

## 8. Behaviours the stage must reproduce (the parity checklist)

Each is something R3F does today that the app relies on, found by reading `AssemblyCanvas.tsx` and R3F's `events-*.esm.js`.

| Behaviour today | Where | Plain-three stage must |
|---|---|---|
| `frameloop="demand"`: `invalidate()` schedules one frame via `requestAnimationFrame`, repeated calls in one frame coalesce | `Canvas`, `Scene` (many `invalidate` callers, the 20 fps `BREATH_FPS` ticker) | one pending rAF, one pass per frame |
| `useFrame(fn, 1)`: a subscriber with priority above 0 turns R3F's automatic render off; the app ends every passing frame with `gl.render` | the "priority-1" frame, before and after `compileAsync` | no automatic render at all; the frame calls subscribers in priority order; nothing draws until `compiled` is true |
| `state.clock.elapsedTime` and `delta` span idle gaps (the app clamps `dt` to 0.1) | `useFrame` body | `Clock.getDelta()` per executed frame, `elapsedTime` accumulates, same as R3F |
| `dpr={[1, 1.5]}` | `Canvas` | `setPixelRatio(min(max(devicePixelRatio, 1), 1.5))` |
| `resize={{ debounce: { scroll: 50, resize: 150 } }}`, size via `react-use-measure` | `Canvas` | `ResizeObserver` with the 150 ms trailing debounce; `size` published as React state; a resize re-runs the camera effect exactly as today |
| `gl={{ alpha: true, antialias: true, powerPreference: 'default' }}` plus R3F's own defaults (`alpha`, `antialias`, and `powerPreference` that the app overrides) | `Canvas` | the same constructor options; same canvas CSS box (`display:block; width:100%; height:100%` inside the absolute wrapper) |
| `camera={{ fov, near: 0.1, far: 100, position }}`, `lookAt(0,0,0)` by default, aspect set on resize | `Canvas`, camera effect | `PerspectiveCamera`, same values, `updateProjectionMatrix` on resize |
| `onCreated`: ACES tone mapping, exposure 1.1, clear colour `0x000000` alpha 0 | `Canvas` | same, same order (before the first `prepare`) |
| Colour management and output colour space (three defaults, which R3F leaves on) | implicit | leave at three's defaults; add a test that asserts `ColorManagement.enabled` and `outputColorSpace` |
| `compileAsync` gating and the PMREM bake order: bake, set `scene.environment`, then `compileAsync(scene, camera)`, then `compiled=true`, then the first draw | `prepare` | unchanged; it only touches `gl`, `scene`, `camera`, which the stage still provides |
| Context loss: `webglcontextlost` is `preventDefault`ed by the app; restore re-bakes; a second loss gives up | effect on `gl.domElement` | unchanged (the app owns this already; the stage must not add handlers that preventDefault or rebuild the renderer) |
| Errors: R3F's `Canvas` has an error boundary that rethrows to `AssemblyBoundary`, which gives up for the session | `AssemblyLayer` | errors in React render still reach `AssemblyBoundary`; **errors inside the rAF callback do not reach React**, so the stage wraps the frame in try/catch and calls an `onError` prop wired to `giveUp` (stricter than today, called out in the PR) |
| StrictMode double effects: mount, cleanup, mount must leave a live slot, markers and a live renderer | `Scene` effects | the stage creates the renderer in a layout effect and disposes it in cleanup; a test mounts it under `StrictMode` |
| Disposal: `rig.dispose()`, model slot dispose, environment target dispose | cleanup | unchanged; add `gl.dispose()` in the stage and assert `gl.info.memory` returns to zero through the existing `__ASSEMBLY_DEBUG__` seam |
| `getBoundingClientRect`/pointer maths use `size` and `camera` | `rayAtPlane` caller | unchanged; `size` keeps the same meaning (the wrapper's CSS box) |

Test seams that must keep working untouched: `window.__ASSEMBLY_VELOCITY__`, `__ASSEMBLY_CUBES__`, `__ASSEMBLY_FADE__`, `__ASSEMBLY_RIG__`, `__ASSEMBLY_DEBUG__`, `__ASSEMBLY_MODELS_TEST__` with `?modeltest=1`, and the production guard `scripts/check-no-model-seam.sh` (new seams must be added to its grep list). They live in `AssemblyCanvas`/`ModelSlot`, not in R3F, so they should not move.

---

## 9. Parity gate (the thing that makes this safe)

**What exists:** unit tests for the maths and the golden shader fixtures (`tests/fixtures/assembly-bundles.golden.json`, `assembly-cube-output.golden.json`, pure TypeScript, untouched by a renderer swap), E2E specs that read the `__ASSEMBLY_*` seams, a hero pixel-parity spec under SwiftShader (`tests/visual/hero-parity.spec.ts`, `?freeze=<t>,<s>`), and a full-page visual suite that runs with `?nogl=1`. **What does not exist: any pixel test of the cubes.** `home.spec.ts` hides the canvas by design. So the first slice builds the gate, and it must pass against the unmodified R3F code before anything else is touched.

**The harness (slice 0):**

1. A cube freeze seam, same guard as the others (`SEAM_ENABLED`, folds to `false` in a deployed build, listed in `check-no-model-seam.sh`): `?cubefreeze=<t>` fixes `state.clock.elapsedTime` to `t`, disables the idle ticker, and applies a given scroll state, so a frame is a pure function of `(t, scroll, viewport)`. The intro (`resolveAssembly`) already depends only on `elapsed`, so freezing `t` freezes it.
2. A Playwright spec `tests/visual/cubes-parity.spec.ts`, Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (the hero-parity pattern), test-seam build, `desktop` project, own contexts at DPR 1: 1440x900 and 390x844.
3. Frames: each of the seven formations at its scroll position at a settled `t` (for example 20 s), plus three transition mixes (0.25, 0.5, 0.75) between two neighbouring formations, plus the on-load assembly at `t` = 0.5, 1.5, 3 s, plus one frame with a model loaded through `?modeltest=1` (the cube GLB fixture). About 13 frames per viewport.
4. Baselines are PNGs generated from `develop` before the migration and committed under `tests/visual/cubes-parity.spec.ts-snapshots/`, Linux only, regenerated by the existing "Update visual baselines" workflow (the same rule as `docs/visual-regression.md`: a win32 capture never matches CI).
5. **Tolerance: much tighter than the hero's tier parity**, because the shaders, geometry and draw calls are identical and only the host changes: mean absolute channel difference at most 0.002, 99th-percentile difference at most 0.01, no more than 0.05 percent of pixels differing by over 8/255 (anti-aliasing noise). SwiftShader is deterministic, so the expected result is zero; any non-zero diff is a finding.
6. State invariants read through the existing seams on the same frames: `__ASSEMBLY_RIG__` deep-equals the baseline, `gl.info.render.calls`, `triangles` and `programs.length` equal (add the three numbers to `__ASSEMBLY_DEBUG__`), `gl.info.memory.geometries/textures` return to baseline after unmount.
7. A determinism self-check: the baseline job renders each frame twice and fails if the two differ by more than zero (it catches an unseeded random or a wall-clock leak in the harness before it produces a flaky gate).

**Done for the whole migration** requires: the parity spec green, `npm test` green (unit tests, including the two `AssemblyLayer` tests), the e2e job green (including `models.spec.ts`, `velocity.spec.ts`, `hero-handover.spec.ts`), `npm run check:bundle` and the seam guard green, and `npm run size` within the new pins.

**Not covered by any automated gate, and needing a human on a phone** (unmeasured): real-GPU colour (SwiftShader is not an ANGLE/Adreno pipeline), first-frame jank with the new bundle, and the Moto G-class long-task budget. These stay on the hero S4 device pass.

---

## 10. Slice plan

Each slice is one PR into `develop`, ships behind identical behaviour, passes the parity gate, and has its own budget target and rollback. Budgets are pinned at measured plus 5 percent, the repo's existing convention.

| Slice | What | Done when | Budget target (gz) | Rollback |
|---|---|---|---|---|
| **S0: the cube parity harness** | The `?cubefreeze` seam, the extra `__ASSEMBLY_DEBUG__` counters, `cubes-parity.spec.ts`, baselines from `develop`, seam guard updated, `docs/visual-regression.md` section | Spec green on current code, twice, bit-identical; E2E green; the seam is absent from a deployed build (guard) | No change: core 268.13, initial 119.5 | revert the PR (test-only plus a gated seam) |
| **S1: the stage seam over R3F `createRoot` (option A)** | New `components/three/stage/` exporting `Canvas`, `useThree`, `useFrame` with the surface in section 8, implemented over `createRoot`; `AssemblyCanvas` imports from it; nothing else changes | Parity gate zero-diff; `grep -r "@react-three/fiber" apps/web/components apps/web/lib` finds only `stage/`; no `extend(THREE)` in the core chunk (grep the build) | **core at most 232** (measured 224.62; pin 232), the rest unchanged | revert the PR |
| **S2: the stage over plain three (option B)** | Reimplement `stage/` over `WebGLRenderer`, `PerspectiveCamera`, `Clock`; remove R3F from `package.json` and the lockfile; frame try/catch to `onError`; StrictMode and disposal tests | Parity gate zero-diff; all section 8 rows covered by a test or a stated reason; `npm ls @react-three/fiber` empty; core measured | **core at most 182** (measured prototype 171.8, plus about 3 for context handling and errors, plus about 5 percent; pin 182), models 26 unchanged | revert the PR (S1's R3F-backed stage is one `git revert` away, lockfile included). Optional belt and braces: a build-time `NEXT_PUBLIC_STAGE=r3f|plain` constant folded like `NEXT_PUBLIC_HERO`, so a Vercel env change can restore R3F for one release; costs a slice of complexity, only worth it if the owner wants a no-redeploy-of-code rollback |
| **S3: budgets and the models chunk** | Decide where the GLTFLoader's extra `three` modules live (they landed in the core glob in the prototype; core 171.8 already includes them), tidy the `models` cache group and the glob, split the gate if the owner agreed (section 5 item 6), pin all entries at measured plus 5 percent | `npm run size` passes with the new pins; models at most 27 (pin with a justified bump only if the loader's modules move there) | core pinned at measured plus 5 percent (about 180), models 26 to 29, hero 14 to the owner's S4 decision | revert the PR (config only) |
| **S4: docs and cleanup** | Amend the journey spec (section 6 tripwire, D3) and hero spec (section 9, S5) with the measured outcome; remove the R3F notes; update `AssemblyCanvas`'s header comment ("R3F's Canvas rethrows...") and `AssemblyLayer`'s | docs and comments match the code; a grep for "R3F" in `apps/web` finds only history | none | revert the PR |

Total: about 4 to 5 builder-days (S0 1 day, S1 0.5 to 1, S2 1.5 to 2, S3 0.5, S4 0.5). S1 can ship on its own and the saving is real (minus 43.5); S2 is the larger half.

---

## 11. Resulting budget picture

| Entry (gz) | Now | After S1 | After S2 and S3 (expected) | Notes |
|---|---|---|---|---|
| initial JS (non-3D) | 119.51 of 120 | 119.5 | **119.5** (no change from this migration) | relief comes from section 5, item 6, not from three |
| framework only (if the gate is split) | 102.8 | 102.8 | 102.8 (pin about 105) | moves only with a Next or React bump |
| app initial (if the gate is split) | 16.8 | 16.8 | 16.8 of 20 | 3.2 kB of real headroom |
| assembly core | 268.13 of 275 | about 225 of 232 | **about 172 to 180 of 182** (prototype 171.8) | range allows the full stage |
| assembly models | 23.53 of 26 | 23.53 | 23.5 to 27 | watch where the loader's `three` modules land |
| hero engine | 13.93 of 14 | 13.93 | 13.93 | the migration does not touch it; S4 of the hero needs the owner to raise the limit or find the bytes in `lib/hero` |
| 3D total (core + models + hero), lazy | 305.6 | about 261 | **about 209** | minus 96 |

Headroom for S4, `/lab` and the model platform: the pinned headroom stays small by design (about 7 kB under a 182 pin), but the **absolute** cost of everything lazy drops by 96 kB, so a `/lab` that adds 40 kB still sits below today's core.

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A silent behaviour R3F supplied and nobody listed (event order, `onCreated` timing, canvas CSS size) | medium | a visible diff or a missed frame | section 8 checklist; the parity gate; S1 first, so only the host is under test when S2 lands |
| The harness itself is flaky (clock leak, unseeded random, async model timing) | medium | a gate nobody trusts | determinism self-check (section 9, point 7); freeze seam owns the clock; SwiftShader only |
| SwiftShader pixels pass but a real GPU differs (precision, tone mapping) | low (same shaders, same GL calls) | a colour shift on a phone | no shader or material change in any slice; the hero S4 device pass looks at the cubes too |
| Errors inside the rAF callback bypass `AssemblyBoundary` | certain unless handled | a thrown frame leaves a dead canvas with the 2D layer faded out | try/catch in the stage, `onError` to `giveUp`, a unit test that throws in a subscriber |
| StrictMode double-mount leaks a renderer or a context | medium | "Too many active WebGL contexts" in dev, a dead slot | create in layout effect, dispose in cleanup, test under StrictMode, assert `gl.info.memory` |
| Bundle outcome lands higher than the prototype (a fuller stage, a three module pulled in by the loader) | medium | pin missed by a few kB | pins have 5 percent plus a stated reserve; the figure to beat is 224.6 (A) even if B disappoints |
| Moving code between chunks shifts bytes between gates | certain unless handled | a green gate that hides a regression | S3 owns the globs; every size table in a PR lists all five entries |
| R3F 9 is removed from a future `/lab` that wanted it | low | rework | the stage is meant to be reusable; `/lab` can still add R3F as its own lazy chunk |

---

## 13. Rollback

- Per slice: revert the PR (all five are self-contained; S2 is reverted together with its lockfile change).
- If S2 is found wrong after release: `git revert` S2 returns the S1 stage (R3F `createRoot`, core about 225), still better than today by 43.5 kB, with no change to the scene.
- The cube layer already has a graceful floor: `AssemblyLayer` gives up and leaves the 2D canvases on any throw or chunk failure, so the worst runtime outcome of a stage bug is "the page looks like the no-WebGL path", not a broken page.

---

## 14. What is unmeasured

- Real-device parse and long-task cost of the smaller core (the raw core is about 1 MB today; I did not record the prototype's raw size). The hero spec's 250 to 400 ms Moto G estimate is still an assumption.
- Real-GPU rendering equivalence; SwiftShader only.
- The effect of Next 16 (or any React bump) on the 103 kB framework floor.
- The exact gz of items 3 to 5 in section 5 (estimated from source-map bytes, not built).
- Where webpack will put the GLTFLoader's extra `three` modules once the cache groups are tuned (S3).
- A barrel-alias variant of A (not built; estimated equal to A).
- The marginal cost of the shared-stage variant of C (estimated 0 to 2 kB, not built).

---

## 15. Questions only Wieslaw can answer

1. **Approve B** (S0 to S4) with S1 shipped first on its own? If you want a no-code-revert rollback for one release, say so (the `NEXT_PUBLIC_STAGE` constant).
2. **Redraw the initial gate** as framework (pinned about 105) plus app (20 kB)? This is a policy change to a gate, not a code change, so it is yours.
3. **Hero limit for S4:** raise `hero engine` from 14 to 16 kB now, or make the hero find its own bytes? The migration does not help it.
4. **Cheap wins:** do items 1 to 4 of section 5 (about 3 to 4 kB), and are you content for the Contact form to hydrate late? Item 5 (deferring the 2D painter) I recommend against.
5. **Also remove three-custom-shader-material** (a further 4.5 kB) as a later slice, accepting the golden-fixture work?
6. **Which device(s)** run the real-GPU look check for the cubes (the hero S4 list already asks)?

---

## Appendix: how the numbers were produced (scratch, not committed)

- `npm ci`, `next build` with `.next` removed first, `npm run size`; each prototype built the same way and reverted (`git checkout`), baseline rebuilt and re-measured at the end (119.51 / 2.97 / 268.13 / 23.53 / 13.93).
- Source-map attribution: a 60-line script decoding the VLQ `mappings` of a build with `productionBrowserSourceMaps` (config edit reverted), summing generated bytes per source, scaling to the chunk's gzip size.
- Tree-shaking experiments: esbuild 0.27 with `minify`, `treeShaking`, `format: esm`, `NODE_ENV=production`, gzip level 9, stdin entries that import the named set from `three`.
- Prototype stages: `r3f-root.tsx` (option A) and `r3f-lite.tsx` (option B), roughly 40 and 100 lines. They live in `C:\tmp\p3a-out` and are not part of this PR; S1 and S2 would write the real ones.
