# The Hero Monolith: concept A from the Hero Shader Lab, made consistent on a mid-range phone

> Status: design spec, 2026-10-06. Base: `origin/develop` 7dcf0cc. Owner decision (final): concept A, the iridescent monolith; demote the 3000 plain cubes; re-art-direct the 2D posters; it must be possible and consistent on mobile.
> Read with `2026-10-01-assembly-journey.md` (the Assembly) and `2026-10-02-model-platform.md` (the model slot). Measurements below were taken on 2026-10-06 in `C:\tmp\hero-a` (scratch, not committed); every number says whether it was measured, derived or assumed.

---

## 0. Summary

**The one decision that matters.** Do not ship the raymarch. Ship the same look as a *baked-lighting mesh path*: a real 32-triangle slab, about 970 instanced dust shards, three thin torus rings, a floor quad and a mirrored draw for the reflection, all shaded by the lab's own `pal()` / `envA()` / `shadeA()` functions, rendered into a half-float target and upsampled with grain. The lab's raymarch stays in the repo's story as the **oracle**: the reference the parity test compares against and the thing the owner approved by eye. It never runs on a visitor's device.

Why, in one line each, all from the prototype in section 2:

- The raymarch at High is about 194 SDF evaluations per pixel; the mesh path is about 1 to 2 percent of that in ALU (derived), and 3 to 4 times cheaper per frame at equal resolution even under SwiftShader, a CPU rasteriser that over-weights the mesh path's vertex work (measured, indicative only).
- The raymarch's own quality ladder **changes the look**: at Low and scale 0.5 the thin rings break into dashes and at scroll 0.35 most of the dust vanishes (compare1.png, measured). A ladder inside one shader is not consistency.
- The mesh path's GLSL is 3.1 kB gzip against the lab shader's 3.4 kB (measured). The whole hero engine in raw WebGL2 with no three.js is an estimated 8 to 10 kB gzip.

**Architecture.** A separate lazy chunk `hero` (raw WebGL2, no three, no R3F) drives its own `<canvas>` that sits *behind* the existing R3F canvas. It mounts at the LCP gate like the Assembly does, but it does not wait for the 267 kB core chunk, it costs nothing in the core budget, and it fails independently. The R3F canvas keeps the other six formations and the models; in the hero it draws no cubes (they are demoted to the hero's own dust and to the hand-over into the stream). The alternative that keeps everything inside the R3F canvas is specified in section 4.8 so the lead can choose.

**Ladder.** One shading code path on every device. Tiers differ only in pixel count (DPR cap), MSAA samples, how many outer dust shards exist, and idle frame rate. The tier starts from a coarse signal and is moved *down only* by a frame-time governor. The floor of the ladder is a still poster triptych (dust, mid, assembled) cross-faded by scroll. No detect-gpu.

**Slices.** S1 the engine behind a flag (visibly better on a preview deploy), S2 posters and default-on, S3 the scroll hand-over and cube demotion, S4 the device pass and hard parity gate, S5 optional (plain-three, shards, armillary). Section 10.

**Plain three is not required for A.** Section 9.

**What is unmeasured:** everything about a real phone GPU. Section 11 lists it and section 12 is the list of questions only Wieslaw can answer, starting with which phones he owns.

---

## 1. What exists today (anchored)

| Fact | Where |
|---|---|
| One fixed, full-viewport R3F canvas, `frameloop="demand"`, 20 fps idle ticker (`BREATH_FPS`), `dpr={[1, 1.5]}`, `antialias: true`, ACES | `apps/web/components/three/AssemblyCanvas.tsx` (lines 770-790, 392-399) |
| Mount only after LCP and idle, then probes; reduced motion never mounts WebGL; `data-gl="live"` is set after the first drawn frame and cross-fades the 2D layer out | `AssemblyLayer.tsx`, `lib/assembly/lcp.ts`, `lib/assembly/capabilities.ts` |
| Tier is stubbed from the 2D rung (`reduced-instances` is tier 1, otherwise 2); detect-gpu is not built | `lib/formations/fallback.ts` (`instanceKeep`), journey spec 5.6 |
| 3000 cubes morph between seven formations with two attribute slots; `cloud` is a pseudo-formation used only for the on-load assembly | `AssemblyMaterial.ts`, `lib/assembly/slots.ts`, `cloud.ts` |
| The hero shell is a procedural icosahedron artefact with a point light, rings and an additive glow; the `orbit` chapter replaces it with the gyroscope GLB | `Artefact.tsx`, `lib/assembly/artefact.ts`, `chapters.ts` |
| The 2D poster painter draws the cube formations on a canvas per section and is the fallback on every no-WebGL path | `lib/formations/render.ts` |
| Glass: `rgba(17,22,29,.72)`, `blur(12px)`, lit top edge; the brief fixes the recipe | `app/globals.css` (61-63, 871-877), `GlassCard.tsx` |
| Budgets (gzip): initial JS 118.59 of 120 kB, core 267.4 of 275 kB, models 23.5 of 26 kB | `apps/web/.size-limit.json`, PR #56 body |
| The brand claim: "WebGL that runs at 60 fps on a mid-range phone", repeated in the colophon and the Craft copy | `docs/claude-design-brief.md` 1, 5.1, 10 |

The last row is why consistency is a requirement and not a nicety: the site's own footer promises it.

---

## 2. The central question: how do we make A consistent on mobile?

### 2.1 What was built and measured

All in `C:\tmp\hero-a` (scratch). The lab's shader is the reference.

- `run2.mjs`: the lab (concept A) at 390x844, DPR 1, in three configurations (High at scale 0.75, Low at 0.5, Low at 0.35), scroll 1.0, 0.7, 0.35, still frames at time 3.0.
- `mesh.html`: the baked-lighting mesh prototype in raw WebGL2. It copies `pal`, `envA`, `shadeA`, `bgA`, the floor shading and `post` from the lab verbatim and replaces the raymarch with: a slab built by clipping a polygon per plane against the lab's twelve half-spaces (the zero set of the lab's `monolith()` is exactly that convex polyhedron, so no marching cubes is needed; 32 triangles); 973 instanced dust cubes whose vertex program reproduces the lab's per-cell stagger, spin and size ramp; three tori with the lab's ring orientation maths; a floor quad with an analytic swept-rectangle soft shadow; the reflection as the same objects drawn mirrored about y = -1.5 with additive blending; scene into an RGBA16F target with MSAA 4, then a post pass (vignette, shoulder, gamma, grain) that also does the upsample when the target is smaller than the canvas.
- Same camera as the lab (a pinhole with a layout-aware centre and zoom taken from the lab's own `layout()` at 390x844: centre 0.5, 0.755, zoom 2.835).

Look result (`shots/compare1.png`, columns: raymarch High at 0.75, raymarch Low at 0.5, mesh path; rows: scroll 1.0, 0.7, 0.35). Recognisably the same object, palette, floor, reflection streak, shadow and ring set. Differences found, all tuning rather than structure:

1. The lab's left chamfer reads brighter cyan than the mesh's. The reflection direction and strip layout are the same code, so this is a facet-hue (`fac` hash) or small normal difference to chase in S1.
2. The lab clips every dust cube to its 0.22 cell (its SDF is cell-limited), which makes the assembled-looking dust read as orderly. The mesh draws whole rotated cubes that poke across cell borders. One cheap fix: a varying cell centre and a `discard` outside the cell box.
3. The mesh's floor grid is slightly brighter and the shadow is an approximation of the lab's marched soft shadow.
4. The mesh's rings are **cleaner** than the lab's (MSAA), and the lab's Low rings are dashed.

Numbers from `diff.py` (4x box-downsampled crop above the panel, max-channel absolute difference, 0..1; measured):

| Scroll | High vs Low 0.5 (mean / p95) | High vs Low 0.35 | High vs mesh |
|---|---|---|---|
| 1.0 assembled | 0.011 / 0.047 | 0.015 / 0.063 | 0.021 / 0.078 |
| 0.7 | 0.018 / 0.075 | 0.025 / 0.118 | 0.052 / 0.231 |
| 0.35 dust | 0.051 / 0.216 | 0.056 / 0.228 | 0.055 / 0.165 |

Mean luma differs by at most 0.025 in every row. Reading: the mesh path is as close to the raymarch High as the raymarch's own Low is, in the assembled state, and the dust states are dominated by random shard placement for every candidate. These are the anchors for the parity tolerances in section 8.4.

Cost and bytes (all measured unless marked):

| Item | Value |
|---|---|
| Lab GLSL (COMMON + concept A), minified whitespace, gzip | 3,440 B |
| Mesh path GLSL (all programs: slab, dust, ring, floor, bg, post), gzip | 3,111 B |
| Mesh path geometry JS (plane clipping, dust cells, torus), gzip | 1,385 B |
| Estimated whole hero engine in raw WebGL2, TypeScript, gzip | 8 to 10 kB (assumed: GLSL + geometry + about 2.5 kB glue + about 1 kB governor and progress maths) |
| Lab raymarch work per pixel | Low 108, High 194 SDF evaluations (64+4+22+4+14 and 120+4+40+4+26, from the lab's own `evals`) |
| SwiftShader frame, 390x844, forced sync readback (indicative only, CPU rasteriser) | mesh: 66 ms without MSAA, 126 ms with MSAA 4; at scale 0.5 40 ms and 62 ms. Raymarch High at 0.75 (293x633): 143 to 231 ms; High at 0.5: 63 to 99 ms; Low at 0.5: 59 to 87 ms |
| Same, per megapixel | raymarch about 770 to 1250 ms per MP at High and about 730 to 750 at Low; mesh about 200 ms per MP at full res (its SwiftShader time has a vertex floor that a GPU does not have) |
| Poster, 390x844, assembled, grain on: WebP q75 / AVIF q50 | 8.5 kB / 7.6 kB |
| Pre-rendered assembly strip, 25 frames at 390x844, grain-free: WebP q60 / q75, AVIF q35 / q50 | 277 / 341 kB, 148 / 289 kB |
| Same strip at half resolution (195x422), WebP q70 | 87 kB |

SwiftShader frame times are not phone frame times and are only used for the *relative* claim "the mesh path is cheaper at equal resolution". The absolute phone numbers are derived below and flagged.

### 2.2 Derived per-frame cost model at 390x844

Assumptions (flagged): about 300 flops per SDF evaluation (slab plus dust cell plus three tori, range 150 to 400); a mid-range phone GPU of 0.15 to 0.25 TFLOPS fp32 (Adreno 610-class, Mali-G57-class); the pixel budget the existing Assembly already uses is DPR capped at 1.5, so 585x1266 = 0.74 MP; a phone at DPR 3 is 2.96 MP native.

| Path | Work per frame | At 30 fps | Share of a 0.2 TFLOPS GPU |
|---|---|---|---|
| Raymarch High, 0.74 MP | 144 M evals, about 43 Gflop | 1.3 Tflop/s | far over budget (6x or more) |
| Raymarch Low, 0.74 MP | 80 M evals, about 24 Gflop | 0.7 Tflop/s | over budget (3x or more) |
| Raymarch Low at 0.5 of CSS px, 0.08 MP (the lab's mobile advice) | 8.9 M evals, about 2.7 Gflop | 80 Gflop/s | about 40 percent, hot, and the look breaks (section 2.1) |
| Mesh path, 0.74 MP | floor + bg + post about 0.4 kflop per pixel = 0.3 Gflop, plus objects (about 12 percent of pixels, twice for the mirror, about 0.5 kflop) 0.09 Gflop; vertex work on about 25 k triangles twice is negligible on a GPU | about 12 Gflop/s | about 6 percent |

The raymarch High cannot run on a mid-range phone at any scale that keeps the look; the mesh path has more than an order of magnitude of headroom. Memory for the mesh path at 0.74 MP: RGBA16F MSAA 4 renderbuffer about 24 MB, resolve texture 6 MB, depth about 12 MB, total about 42 MB (derived; this is the figure to watch on 2 GB phones, which is why L1 has MSAA 0 and a smaller target).

### 2.3 The strategies, evaluated

| | 1. Live raymarch plus ladder | 2. Baked-lighting mesh path | 3. Pre-rendered frames plus overlay | 4. Hybrid (chosen) |
|---|---|---|---|---|
| Bytes | GLSL 3.4 kB gz, glue about 8 kB | GLSL 3.1 kB + geometry 1.4 kB gz, whole engine about 8 to 10 kB | 148 to 341 kB per orientation measured at 390x844; landscape about 4x the pixels, estimated 0.4 to 1.3 MB; plus a live overlay | about 9 kB engine plus posters (section 7), about 60 kB |
| Per-frame cost | 43 Gflop High, 2.7 to 24 Gflop Low, fixed by shader | about 0.4 Gflop at 0.74 MP, scales with pixels only | image decode and composite only | mesh path, with the poster as the floor |
| Thermal / battery | worst: sustained ALU saturation; throttles within a minute on a mid-range phone (assumed) | low; demand-driven at 20 fps idle, a 2.6 s burst on load | lowest | low |
| Determinism | same shader on every device, but tiers change the picture (rings dash, dust lost) | one shading path; tiers change pixels, MSAA, dust count only; deterministic given `uTime` and `uS` | perfect, but only for the frames that were shot; no parallax, no pointer | deterministic for L3 to L1; poster is the same engine's still |
| LCP fit | after LCP, but the heaviest compile (the lab's 120-step loops are slow to link on mobile drivers; assumed) | after LCP, small chunk, 6 programs | poster image could even *be* the LCP element | same as 2, poster measured in S2 |
| Effort | lowest (already written) | medium: plane clip, instancing, mirror, post, governor; prototype exists | medium plus a render pipeline; frame scrubbing UX | medium, sliced |
| Verdict | reject for visitors; keep as the oracle | **the product** | reject as a tier (bytes, no parallax, two orientations); keep three stills as the floor | **recommend** |

Why not a pre-rendered sequence as the fallback tier: a scroll-scrubbed 25-frame strip at 390x844 is 148 to 341 kB, about 15 to 40 times the whole engine, and must exist per orientation; it cannot respond to the pointer or to the camera yaw that gives the strips their parallax, which is the thing that makes thin-film read as thin-film. Three stills (dust, mid, assembled) at about 8 kB each cross-faded by scroll carry the narrative for the people who need a floor.

Rejected inside strategy 2:

- A baked cube map or matcap for the reflections: the lab's `envA` is already analytic and cheap on object pixels. It is expensive only on the floor (every floor pixel calls it for the reflection). The right optimisation if the device pass demands it is a **256x128 half-float environment LUT used by the floor only** (azimuth rotation becomes a texture offset, so the time rotation stays free). Held as an S4 lever; not in S1 to avoid a parity variable.
- Marching cubes to bake the SDF to a mesh: unnecessary, the slab is convex, twelve planes suffice and the clip code is 30 lines.
- A mirrored *texture* for the floor reflection: a mirrored draw of 32 triangles is cheaper than rendering to a texture and re-sampling it, and stays sharp where the reflection is near the contact line.
- Instanced `Points` for dust: the lab's dust are rotating faceted cubes and read as such; points would read as sparkles. Instanced cubes at 12 triangles each: 970 instances is about 11.7 k triangles per pass.

### 2.4 Recommended ladder (one)

The same shading on every device. Tiers are *resolution and density*, never *shader variants*.

| Tier | Who starts here | DPR cap (css px) | MSAA | Outer dust kept | Mirror draws dust | Idle fps | Target |
|---|---|---|---|---|---|---|---|
| L3 | `pointer: fine`, 8 or more cores, not low-power | 2.0 | 4 | 100 % | yes | 20 | desktop and laptop |
| L2 | everything with a touch screen that is not low-power (the default for a mid-range phone) | 1.5 | 4 | 70 % | no | 20 | phone |
| L1 | `reduced-instances` rung (4 cores or fewer, 4 GB or less, or `prefers-reduced-data`) | 1.0 | 0 (rings thickened 1.4x to survive without MSAA) | 40 % | no | 15 | low-end phone |
| L0 | no WebGL2, `?nogl=1`, Save-Data, reduced motion, governor floor, second context loss | poster triptych, no GL | | | | | everyone else |

The inside-the-slab dust shards (about 150 to 200 of them, the ones that *become* the monolith) are always all drawn; only the outer halo thins, so the assembly story is identical at every tier. Outer shards are kept by a deterministic hash rank, so L2's set is a subset of L3's.

**Tier choice: measured, not looked up.** Start from the signals above (they are the existing `readCapabilities` plus `pointer: coarse`, `deviceMemory`, `hardwareConcurrency`). Then a governor (pure function, 40 lines) watches `requestAnimationFrame` intervals:

- During the first assembly (the 2.6 s clock runs the loop continuously, so intervals are meaningful): drop the first 10 samples (compile and first-use hitches), take the next 45. If p75 is above 22 ms, step down one tier.
- Afterwards, whenever the loop is running continuously (during a scroll through the hero band): a rolling 60-sample window, p90 above 28 ms steps down one tier. Same rule as the journey spec's DPR monitor (5.6) but the unit is a whole tier.
- Never steps up. Never steps down more than one tier per 90 samples. L1 with p75 above 40 ms for 90 samples drops to L0 for the rest of the session (remembered in `sessionStorage`, wrapped in try/catch).
- A tier change writes uniforms, reallocates the render target and changes an instance count. It never recompiles a program, so it can never produce a stall of its own.
- `?tier=0|1|2|3` overrides everything (dev and e2e).

Caveat that must be stated: a `requestAnimationFrame` governor on a 60 Hz phone can tell "makes frame budget" from "does not", but cannot see 40 versus 60 fps headroom. That is enough, because the first tier already has about 16x headroom (section 2.2), and L1 and L0 exist for the devices where the estimate is wrong. `EXT_disjoint_timer_query_webgl2` is disabled on essentially all mobile browsers and is not used.

**Why no detect-gpu.** It costs about 6 kB gzip plus a 30 to 60 kB benchmark JSON (journey spec 6), it answers "which GPU model" when the question is "does this frame fit", and it is a lookup that is stale the day a new phone ships. It was never built. The spec drops it and the saved 6 kB goes to the hero chunk.

### 2.5 Guaranteeing look parity between tiers (defined, section 8.4)

The guarantee has three layers: (1) by construction, tiers share one shader and differ only in resolution, MSAA, outer dust count and idle fps; (2) by test, a still-frame comparison of every tier against L3 at fixed `uTime` and `uS` with tolerances anchored on the measurements in 2.1; (3) by a hard rule in review, no `#define`, `if (tier)` or uniform in GLSL may change colour, only geometry density.

---

## 3. System architecture

```
                        html
   z-order (low to high, all fixed, aria-hidden, pointer-events none)
   ┌────────────────────────────────────────────────────────────────────┐
   │ 0  2D washes + 2D poster canvases (existing; the hero one is gone) │
   │ 1  hero poster <picture> (S2)  ........ L0 and until first frame   │
   │ 2  HERO canvas  (raw WebGL2, chunk `hero`)  ... hero section only  │
   │ 3  R3F canvas   (transparent, chunk `three`) ... cubes + models    │
   │ 10 page content (glass panels, text)                               │
   └────────────────────────────────────────────────────────────────────┘

   AssemblyLayer (existing, initial JS)
      ├─ afterLcp() ──► probes (rung, webgl2, saveData, flag) ──► mount
      ├─ <HeroLayer/>   new, initial JS ≈ 0.3 kB: gate + dynamic import
      │      └─ import('./hero/HeroEngine')  chunk `hero` ≈ 9 kB gz
      └─ <AssemblyCanvas/> existing, chunk `three` ≈ 267 kB gz
```

Components:

- `HeroLayer.tsx` (client, initial chunk): owns the `<canvas>`, the dynamic import, the IntersectionObserver, the passive scroll read, the cross-fade attribute, the give-up state. Small by design.
- `HeroEngine` (lazy chunk): a class, not React. `new HeroEngine(canvas, options)`, `compile(): Promise<void>`, `setSize(cssW, cssH, dpr)`, `setFrame(rect)`, `setProgress({s, p, velocity})`, `render(timeSeconds)`, `setTier(t)`, `dispose()`. All GL state lives here.
- Pure modules in `apps/web/lib/hero/` (no GL, unit-testable under vitest): geometry, progress, frame, governor, tiers, gate.
- `hero.glsl.ts`: the GLSL strings, ported from the lab with the quality `#define` blocks deleted.

Data flow per frame (all inside one `requestAnimationFrame` callback owned by `HeroLayer`; the loop runs only while the hero is visible, the tab is visible, and either the assembly clock is running, the user is scrolling, or the 20 fps idle ticker says so):

```
scrollY, load clock, pointer ─► progress.ts ─► {s (assembly 0..1), p (hero scroll 0..1), weight (0..1), yaw/pitch/dist}
layout (panel rect, viewport) ─► frame.ts ─► {centre, zoom}  (on resize only)
rAF intervals ─► governor.ts ─► tier ─► engine.setTier (uniforms, target size, instance count)
engine.render:
  1. bg triangle           ─┐ into RGBA16F target (MSAA per tier)
  2. floor quad            ─┤  depth off
  3. mirrored objects      ─┤  additive, own depth
  4. real objects          ─┘  opaque, depth on
  5. resolve, post pass: vignette, shoulder, gamma, grain, bilinear upsample, premultiplied by `weight`
```

---

## 4. Production architecture, in detail

### 4.1 Where it lives, and what is in front

The hero engine renders to its own canvas, **behind** the R3F canvas. The R3F canvas is transparent (it already is: `alpha: true`, clear alpha 0). The composite is DOM stacking, so no depth buffer is shared and nothing can z-fight. "Which is in front" is answered by section: in the hero the R3F rig draws no cubes (4.4) so the monolith is unobstructed; the models (`orbit`, `scatter`, `grid` rows of the ledger) are all in later sections and the hero engine is faded and paused by then; at the hero-to-proof band the stream cubes appear *in front of* the fading monolith dust, which is the right depth reading (cubes are the nearer, bigger things).

Hero canvas CSS: `position: fixed; inset: 0; z-index: 0` inside the same `pointer-events-none fixed inset-0` wrapper as the existing layer, below the R3F wrapper. Its opacity is the engine's `weight` written as a style on the canvas only when it changes by more than 0.01.

### 4.2 The scene, exactly

All coordinates world space, y up, the lab's.

- **Slab.** The twelve half-spaces `n . p <= d` of `lab monolith()` converted to world space (q = p - (0, 0.05, 0), so each `d` gains `n.y * 0.05`): x within 0.46, z within 0.30, y within 1.55 of 0.05, four chamfer planes (1,0,±1)/sqrt2 and (-1,0,±1)/sqrt2 at 0.455, crown plane normalize(-0.34, 1, -0.14) through y = 1.36, crown plane normalize(0.85, 1, 0.30) through y = 1.50. Faces are produced by clipping a large polygon on each plane against the others (Sutherland-Hodgman), fan-triangulated, flat normals. 32 triangles. Prototype: `mesh.html` lines "plane-clipped convex slab".
- **Dust.** Cell size 0.22. Candidate cells: centre within x and z of 1.55, y between -1.65 and 2.55. A cell is *inside* when the slab distance at its centre is below 0.03; otherwise it is kept only if `hash33(id + 7).y < 0.22`. About 973 instances in the prototype: instance attribute `(ix, iy, iz, inside)`, 16 bytes each. The vertex program is the lab's per-cell code: `t = smoothstep(stag, stag + 0.5, s / 0.72)` with `stag = h.x * 0.5`, size mix to 0.093 for inside cells, shrinking and vanishing outer shards, room-limited offset, bob, spin `(1 - t) * (h.x - 0.5) * uTime * 0.8`, two rotations (applied inverted to the cube's vertices; the prototype has the signs right). Inside cubes `discard` where the slab distance is positive (a 12-plane max, 12 dots per fragment, only on dust fragments) so the assembled mass is exactly the slab. S1 adds the cell clip from 2.1 item 2.
- **Slab dissolve.** For `blend = smoothstep(0.68, 0.9, s)` the slab draws only where `hash21(fragCoord) <= blend`. With grain this reads as a soft crossfade from shards to solid. It is a dither, so it must be tested for shimmer at L1 (S1 acceptance).
- **Rings.** Three tori, 120 by 6 segments, major radius `mix(2.2, 1.22, k)`, `mix(2.7, 1.55, k)`, `mix(3.2, 1.95, k)` with `k = smoothstep(0.12, 0.72, s)`, tube 0.0062, 0.0062 x 0.85, 0.0062 x 0.7 scaled by `k` (the prototype scales by 1.6 and adds 0.0008 so MSAA has something to cover at 390 px; to be tuned against the lab). Orientation: the lab's `ringsD` rotations, inverted for model-to-world as in the prototype. Hidden when `k < 0.02`.
- **Floor.** Quad at y = -1.5, 80 by 80. The lab's floor shading verbatim (pool, ambient occlusion by footprint distance, grid, violet bloom under the slab, fog to the background) except the shadow, which is analytic: the footprint rectangle swept along `-Ld.xz / Ld.y * 3.0` with a penumbra that widens along the sweep. Under the raymarch this was a 26-step marched soft shadow; the swept rectangle is an approximation (S1 compares it by eye and by the parity test).
- **Reflection.** Slab, rings and (L3 only) dust drawn again with `y -> -3 - y`, additive, with the fragment emitting `(object colour - 0.30 * envA(reflected ray)) * fresnel * 0.9 * (1 - fog)`. The subtraction is what makes it a replacement of the floor's own environment reflection rather than an addition to it; the prototype confirms it.
- **Background.** One fullscreen triangle, the lab's `bgA`.
- **Post.** The lab's `post()` without the desktop overlay scrim (that scrim is replaced by the real glass panel and the section scrim, `SCRIMS.monolith`, which stays in CSS). Plus `weight` premultiplication so the layer fades into the page.

### 4.3 Programs and compile

Six programs: slab, dust, ring (each handles real and mirrored by a uniform, not a define), floor, background, post. No quality defines, so no variant explosion. Compile without a long task:

1. `HeroLayer` imports the chunk after the same `afterLcp` gate as the Assembly.
2. `engine.compile()` creates all six programs, then polls `KHR_parallel_shader_compile`'s `COMPLETION_STATUS_KHR` from a `setTimeout(…, 16)` loop (as the lab does), and only calls `getProgramParameter(LINK_STATUS)` and `getShaderInfoLog` after completion. Where the extension is absent (older Safari, to be checked on iOS, section 11) it compiles programs one per task with `scheduler.yield()` or `setTimeout(0)` between them.
3. Programs are *primed* with one 1x1 scissored draw each while the poster is still on top, so a driver that defers real compilation to first use pays it behind the poster.
4. The cross-fade attribute `html[data-hero="live"]` is set one `requestAnimationFrame` after the first real frame has been presented, the same pattern as `data-gl`.

This is one mechanism, not three.js's `compileAsync`; it is the same idea and the same extension.

### 4.4 Cubes: demoted, not deleted

- **Hero.** The cube rig draws nothing while the hero owns the view: `geometry.instanceCount = 0` when both `from` and `to` of the scroll state are `monolith` and `mix` is 0, and the draw call is skipped entirely. This removes the 3000-cube draw in the hero (a saving, not just a visual change) and stops the old cube monolith from appearing behind the new one. `monolith` stays in `FORMATIONS`, the generators and the bundle cache untouched: the 2D painter, the bundle golden fixtures and `cloud` all still depend on it.
- **Hand-over at the hero-to-proof band.** The monolith disassembles as `p` rises (`s` falls to about 0.35, section 5), the hero canvas fades with `weight`, and the rig's cubes fade in from the `cloud` pseudo-formation toward `stream` as `mix` rises. Mechanism: two new per-slot uniforms `uFadeA`, `uFadeB` multiply the cube size in the vertex program (`size *= mix(uFadeA, uFadeB, morph)`), driven from the existing `from`/`to`/`mix`: the `monolith` side is 0. This reuses the A/B slot machinery for what it is good at (the formation-to-formation morph) and does not reuse it for the hero dust, because the hero dust is a closed-form function of `s` with a different motion model.
- **Why not dust from the slot machinery.** The slots carry six attributes per cube (position, live, colour t, spin, flow, fall), written once per formation change and morphed with curl noise; the hero dust needs a per-cell staggered spin that converges on a fixed slab, which is 4 floats per instance and about 25 lines of vertex code. Reusing the slots would drag a 3000-instance buffer and a second material into the hero for no gain.

### 4.5 The other sections

Unchanged formations: stream, lattice, orbit, scatter, grid, ring, and the model ledger (gyroscope in orbit, crystal in scatter, the grid model). The rings and the chamfered slab do not recur; the `orbit` section keeps the gyroscope and its three cube rings. Two palette-parity changes, both S3 and both small:

1. Cubes pick up a film tint: in the CSM fragment, `diffuseColor.rgb += pal(...) * fres * k` with the lab's `pal()` (about 0.25 kB), so the page reads as one material.
2. The page `wash` colours stay (`washCss`) and are not touched; the hero wash is hidden under `data-hero="live"` because the hero canvas paints its own halo.

Later options, not in scope: NASA asteroid shards as the dust mesh (the instance mesh is a swappable `BufferGeometry`), an armillary for the rings.

### 4.6 Scroll store, velocity and the hero's 0..1

Two inputs, both owned by the hero chunk so it has no dependency on the R3F store:

- `p = clamp(scrollY / (0.9 * innerHeight), 0, 1)`, read in a passive listener throttled to one read per `requestAnimationFrame` (the pattern of `useAssemblyScroll`).
- `load = easeOutCubic(min(1, elapsed / 2.6))` where `elapsed` runs from the first presented frame. 2.6 s instead of the cubes' 1.8 s because the slab dissolve and the ring contraction need the time to read; to be judged on the phone.

Assembly value: `s = load * (1 - 0.65 * smoothstep(0.08, 0.75, p))`. Scrolling down disassembles the monolith back toward dust; scrolling up reassembles it, so the wow moment is replayable. Opacity weight: `weight = 1 - smoothstep(0.55, 1.0, p)`. The engine pauses at `weight = 0` and when the IntersectionObserver says the hero is offscreen.

Camera (from the lab, keep): `yaw = 0.42 + 0.28 sin(0.09 t) + (1 - s) * 0.35 + pointerYaw`, `pitch = 0.17 + pointerPitch`, `dist = 11 + (1 - s) * 1.6`, focal 2.7. Add `yaw += 0.5 * p` so the strip reflections *slide across the faces* as the visitor scrolls, which is the single most convincing cue that the surface is thin-film. Pointer parallax only where `(pointer: fine)` (the existing rule); touch gets the scroll yaw.

**Scroll velocity uniform.** The existing `ScrollVelocity` (pure, `lib/assembly/motion.ts`) is reused: its damped 0..1 value feeds `uVel`, which (a) adds `0.6 * uVel` rad/s to the environment rotation so the reflections surge while the page moves and settle at rest, and (b) multiplies dust spin by `1 + 1.5 * uVel`. Exactly 0 at rest; 0 under reduced motion (which never mounts anyway). It does not touch the slab geometry.

### 4.7 Layout and the glass panel

The lab's `layout()` is ported to a pure `frame.ts`: given the viewport and the free rectangle, return `{cx, cy, zoom}` with `zoom = clamp(max(1, H / fh * 0.96, 0.98 H / fw), 1, 4.2)`. The free rectangle is, below 900 px, the area from just under the nav down to the top of the hero panel; at 900 px and above, the area right of the panel. Both edges are measured with a `ResizeObserver` on the hero panel (`[data-hero-panel]`, a data attribute added to the existing hero `GlassCard`, S1) and the nav. The engine realises `{cx, cy, zoom}` as an off-centre pinhole (the prototype's projection: `x_clip = 2 f x / (aspect zoom) + (2 cx - 1) d`), damped at 7 per second as the lab does when the free rectangle changes (URL-bar collapse, rotation).

Important and unmeasured: the lab's 390 px mock panel is shorter than the production hero panel (eyebrow, H1, the long sub paragraph, two CTAs, KPI trio). The real panel will leave less free height, so `zoom` and the subject's size will come out smaller than the lab screenshot. S1's preview must be looked at on the phone with the real panel before any art direction is signed off.

**Glass alpha on phones: what the numbers say.** Measured on the mesh render at 390x844 (`glass.py`): the canvas luminance under a bottom-anchored 318 px panel (y 430 to 748) is p50 0.009 and p99.9 0.023 (relative luminance, 0 to 1), because the region is floor. Compositing `--glass-bg` (17,22,29) over it and measuring the WCAG ratio against `--fg-0` and `--fg-1` at the brightest 0.1 percent of pixels:

| Glass alpha | fg-0 ratio (worst 0.1 %) | fg-1 ratio |
|---|---|---|
| 0.72 (the brief) | 15.8 | 11.1 |
| 0.60 | 15.4 | 10.8 |
| 0.50 | 15.0 | 10.6 |

Contrast is not what constrains alpha: even at 0.50 the body copy is above 10:1 over this render. Alpha is an art-direction choice, and `backdrop-filter: blur(12px)` over a canvas that repaints is a compositor cost on a phone (unmeasured). **Proposal, flagged for the owner:** on `(max-width: 767px)` hero only, 0.60 alpha and `blur(8px)`, so a little more of the floor and the reflection streak shows through. The brief fixes 72 percent and this spec does not change it without his word; S3 carries it behind a CSS variable `--glass-bg-hero-sm`. Caveat on the numbers: the measured region excludes the reflection streak (y 330 to 420), which a taller production panel may overlap; S1 re-measures with the real panel.

### 4.8 The alternative: everything inside the R3F canvas

If the owner prefers a single WebGL context: build the hero as a second `THREE.Scene` with its own camera in `AssemblyCanvas`, render it to a half-float `WebGLRenderTarget` (samples 4) in the priority-1 frame before the main scene, draw a fullscreen post triangle into the canvas first, then render the cube scene over it with `autoClear = false`. Same GLSL as `ShaderMaterial`s, same governor. Differences:

| | Separate hero engine (recommended) | Inside R3F |
|---|---|---|
| Time to first monolith frame | chunk about 9 kB, available right after the LCP gate | waits for the 267 kB core chunk: parse, evaluation, `compileAsync` |
| Core budget | untouched | about +8 kB, over the 275 kB limit unless the artefact is trimmed (it would be) |
| Failure isolation | a hero crash or context loss never touches the cubes and models | one context, one fate |
| Contexts | two, briefly overlapping around the hero-to-proof band; the hero context is explicitly released (`WEBGL_lose_context`) when `weight` reaches 0 | one |
| GPU memory | hero target while the hero is visible, freed after | hero target resident for the session unless released by hand |
| Duplicated glue | about 1.5 kB (resize, visibility, context loss) | none |
| Depth sharing with cubes | none (DOM stacking) | none either (separate target), so no gain |
| Tests | raw GL, no React, simple | needs R3F harness |

Recommendation stands: the hero engine as its own chunk. The one real cost, two contexts, is bounded: only the hero-to-proof band has both alive.

---

## 5. Data and API shapes (the builders code from these)

```ts
// apps/web/lib/hero/tiers.ts
export type HeroTier = 0 | 1 | 2 | 3
export interface TierSpec {
  readonly dprCap: number        // css px multiplier
  readonly msaa: 0 | 4
  readonly outerDust: number     // 0..1 fraction of outer shards kept
  readonly mirrorDust: boolean
  readonly idleFps: number
  readonly ringThicken: number   // 1 or 1.4
}
export const TIERS: Readonly<Record<Exclude<HeroTier, 0>, TierSpec>> = {
  3: { dprCap: 2.0, msaa: 4, outerDust: 1.0, mirrorDust: true,  idleFps: 20, ringThicken: 1.0 },
  2: { dprCap: 1.5, msaa: 4, outerDust: 0.7, mirrorDust: false, idleFps: 20, ringThicken: 1.0 },
  1: { dprCap: 1.0, msaa: 0, outerDust: 0.4, mirrorDust: false, idleFps: 15, ringThicken: 1.4 },
}
export function initialTier(i: { rung: FallbackRung; finePointer: boolean; cores: number | null; lowPower: boolean; override: HeroTier | null }): HeroTier

// apps/web/lib/hero/governor.ts  (pure)
export interface GovernorState { readonly samples: readonly number[]; readonly seen: number; readonly cooldown: number; readonly tier: HeroTier }
export function governorStep(s: GovernorState, intervalMs: number, phase: 'assembly' | 'scroll' | 'idle'): GovernorState   // never raises tier

// apps/web/lib/hero/progress.ts  (pure)
export function assemblyS(load: number, p: number): number
export function heroWeight(p: number): number
export function ringK(s: number): number
export function cameraFor(s: number, p: number, t: number, pointer: { x: number; y: number; active: boolean }): { yaw: number; pitch: number; dist: number; focal: number }

// apps/web/lib/hero/frame.ts  (pure)
export function heroFrame(view: { w: number; h: number }, free: { x0: number; y0: number; x1: number; y1: number }): { cx: number; cy: number; zoom: number }

// apps/web/lib/hero/geometry.ts  (pure, deterministic)
export const PLANES: readonly { readonly n: readonly [number, number, number]; readonly d: number }[]   // 12, world space
export function buildSlab(): { positions: Float32Array; normals: Float32Array }                         // 32 triangles
export function buildDust(): { instances: Float32Array; inside: number; outer: number }                   // (ix, iy, iz, inside), outer sorted by hash rank
export const RINGS: readonly { readonly major: readonly [number, number]; readonly tube: number }[]

// apps/web/lib/hero/gate.ts  (pure)
export function shouldMountHero(i: { rung: FallbackRung; webgl2: boolean; noGl: boolean; saveData: boolean; flag: boolean }): boolean
```

DOM and test seams: `html[data-hero]` is `live` after the first presented frame, `poster` on L0, absent otherwise; `html[data-hero-tier]` carries the current tier (so e2e and the HUD can read it); `?hero=a` enables it in S1; `?tier=n` overrides; `?perf=1` shows the existing planned HUD with tier, DPR, frame p50/p90, canvas pixels. In test builds only, `?grain=0` and `?freeze=<t>,<s>` render a deterministic still (the seam the parity test and the poster script use; guarded like `DEBUG_HOOK` so the guard script keeps it out of production).

Uniform list (GLSL, hero engine): `uRes, uTime, uS, uCenter, uZoom, uAspect, uRo, uUu, uVv, uWw, uP (projection), uMirror, uRing, uPl[12], uVel, uWeight, uGrain`.

No server, no database, no cache layer: this is a client-only presentational system. Caching means the static posters under `public/posters/` with immutable cache headers (content-hashed filenames) and the lazy chunk's normal hashing.

---

## 6. Capability, reduced motion, Save-Data, no-WebGL, context loss

| Visitor | Hero engine | Sees |
|---|---|---|
| `prefers-reduced-motion` | never mounts (the existing `shouldMountWebGL` contract) | the assembled poster, static, opacity cross-fade only |
| `Save-Data`, or `effectiveType` slow-2g/2g | never mounts. New: today `shouldMountWebGL` ignores Save-Data and the Assembly would fetch 267 kB; S1 adds it for the hero and S3 for the Assembly | the poster triptych |
| No WebGL2, `?nogl=1`, JS disabled | not mounted | poster / `<noscript>` poster |
| WebGL2, no half-float render target (`EXT_color_buffer_float` and `EXT_color_buffer_half_float` both missing) | mounts with an RGBA8 target and a 0.5 headroom factor, the post pass dithers (the grain does that job); banding in the darks is the risk to watch | live, slightly coarser darks |
| First context loss | hero poster fades back (remove `data-hero`), on restore re-create programs, target and buffers, then re-prime and fade in | brief poster |
| Second context loss | hero engine gives up for the session, poster stays | poster |
| Governor floor reached | engine disposed, poster triptych scrubbed by scroll | poster |
| Chunk fails to load | `GiveUp` pattern as `AssemblyLayer` | poster |

Disposal (a named checklist, tested with a fake GL that counts `delete*` calls): `deleteProgram` x6, `deleteShader` x12, `deleteBuffer` for slab positions and normals, dust instances, cube vertices, torus UVs, floor, `deleteVertexArray` x5, `deleteTexture`, `deleteFramebuffer` x2, `deleteRenderbuffer` x2, remove the three observers and the scroll listener, cancel the rAF, then `WEBGL_lose_context.loseContext()` so the context slot is released at once. Idempotent.

---

## 7. The 2D posters, re-art-directed

The hero's 2D backdrop (`SectionBackdrop formation="monolith"` plus the painted 2D cube canvas) is replaced by a pre-rendered image of the *live engine*, so the cross-fade from poster to first live frame is between two renders of the same thing. The other six sections keep the 2D cube painter (`lib/formations/render.ts` is untouched; the `monolith` entry stays for `?nogl=1` snapshots of other callers and for the generators' golden tests).

Pipeline (`apps/web/scripts/render-posters.ts`, the journey spec's slice-4 script, extended): Playwright with Chromium and `--use-angle=swiftshader`, loads the app with `?hero=a&freeze=3,<s>&grain=0` at each size, screenshots the hero canvas, encodes with `sharp` (already in the pnpm store).

| File | Size | Format | Budget |
|---|---|---|---|
| `public/posters/hero-portrait-full.{avif,webp}` | 780x1688 (390x844 at 2x) | AVIF q50, WebP q75 | each 12 kB or less (measured at 390x844 with grain: 7.6 and 8.5 kB; 2x pixels, no grain, so allow 12) |
| `public/posters/hero-portrait-{mid,dust}.{avif,webp}` | same | same | each 14 kB or less (dust frames carry more detail) |
| `public/posters/hero-landscape-{full,mid,dust}.{avif,webp}` | 1440x900 at 1.5x = 2160x1350 | same | each 30 kB or less (estimate) |
| `public/og/hero.png` | 1200x630 | PNG, from landscape full | 120 kB or less |

12 poster files and one OG image. Total shipped on the L0 path: one portrait or landscape triptych, estimated 40 to 90 kB, loaded only when needed (the full state loads eagerly as an `<img>`; dust and mid load with `loading="lazy"` once L0 is decided or reduced motion is off and WebGL is absent).

`<picture>` with `<source type="image/avif">`, `<source type="image/webp">`, `<img>` with intrinsic `width` and `height` (no layout shift), `decoding="async"`, `alt=""` (decorative). `<noscript>`: the full poster plain `<img>`. The OG route uses `hero.png`.

**LCP, a hypothesis to test in S2, not a claim.** Today LCP is about 3.0 s against a 2.0 s target with the hero sub paragraph as the LCP element. A viewport-sized poster `<img>` is a different candidate: a 12 kB AVIF with `fetchpriority="high"` and a `<link rel="preload" as="image">` could become the LCP element and arrive earlier than the paragraph's font and hydration path. S2 measures both (Lighthouse CI three runs, simulated mobile) and keeps the poster as LCP only if it improves it; otherwise the poster is `fetchpriority="low"`. The Assembly's `afterLcp` gate is unaffected either way.

Cross-fade rule: the poster stays until `html[data-hero="live"]`; then it fades out over `--d-crossfade` (existing token). L0 never removes it. Under `prefers-reduced-motion` it is opacity-only, as the existing 2D rung 3.

Parity requirement: first live frame versus the full poster at the same size and `freeze` values, mean error at most 0.03 and p95 at most 0.10 (the s = 1.0 anchors, 2.1), so the fade is not a visible swap.

---

## 8. Tests

### 8.1 Unit (vitest, `apps/web/tests/unit/`)

- `hero-geometry.test.ts`: `buildSlab()` returns 32 triangles; every vertex satisfies all twelve plane inequalities within 1e-6; the bounding box is x within 0.46, y from -1.5 to 1.6, z within 0.30; normals are unit and agree with the plane of their triangle; `buildDust()` is deterministic (a checksum pinned, as the artefact geometry test does); inside count and outer count pinned; every inside centre has slab distance below 0.03.
- `hero-progress.test.ts`: `assemblyS(1, 0) = 1`, monotone in `load`, falls with `p`, never below 0.35 at `p = 1`; `heroWeight` 1 at `p <= 0.55`, 0 at 1; `ringK` matches the lab at 0.12, 0.72.
- `hero-frame.test.ts`: the lab's `layout()` reproduced for the 390x844 case (centre 0.5, 0.755, zoom 2.835 from the measured lab state) to 1e-3, and the 1440x900 panel-left case.
- `hero-governor.test.ts`: a table: warm-up samples ignored; p75 above 22 ms after 45 samples steps down exactly one tier; cooldown of 90; never steps up; L1 above 40 ms for 90 samples gives tier 0; a stable 16 ms stream never moves.
- `hero-gate.test.ts`: the truth table including Save-Data and reduced motion; `assembly-capabilities.test.ts` stays green (reduced motion contract).
- `hero-dispose.test.ts`: the fake-GL disposal counter in section 6, called twice.
- `hero-tiers.test.ts`: `initialTier` for the signals in 2.4; outer-dust subsets nest (L1 set within L2 within L3).

### 8.2 Shader compile test under SwiftShader (`tests/e2e/hero.spec.ts`, Chromium `--use-angle=swiftshader`)

Loads `/?hero=a`, waits for `html[data-hero="live"]` within 8 s, asserts no `console.error`, no `pageerror`, `window.__HERO__.errors` empty (test seam: shader and link logs collected by the engine), all six programs `LINK_STATUS` true, and at least 5 presented frames in 3 s. A second case forces `?tier=1` and a third `?tier=3`. A fourth case dispatches `webglcontextlost` on the hero canvas twice and asserts the poster returns and the engine gives up on the second. A fifth with `Save-Data: on` (route header) asserts no `hero` chunk request.

### 8.3 Perf smoke (extends `tests/e2e/perf.spec.ts` from the journey spec)

`PerformanceObserver('longtask')` from navigation to 8 s: no task above 100 ms attributable to the hero mount path (chunk evaluation, geometry build, program creation); total hero long-task time at most 150 ms on the CI runner; scripted scroll through the hero band: `data-hero` weight reaches 0, the engine stops its rAF (a counter seam: frames presented in the following second is 0). Frame time is not asserted; CI cannot measure GPU time and does not try.

### 8.4 Deterministic still-frame and tier look-parity tests (`tests/visual/hero-parity.spec.ts`)

Render with `?hero=a&freeze=3,<s>&grain=0&tier=<n>` at 390x844 (DPR 1) and 1440x900, for `s` in 0.35, 0.7, 1.0. Compare each of L2 and L1 against L3 at the same size and `s`.

Method: crop to the subject region (the free rectangle from `frame.ts`), 4x box downsample (so resolution differences between tiers and MSAA edges are forgiven but colour and shape are not), per-pixel max-channel absolute difference on 0..1. Tolerances, anchored on the measured raymarch-versus-raymarch-Low numbers in 2.1 (L3 to L1 is a smaller change than High to Low, because the shader is identical):

| `s` | mean | p95 | mean luma delta |
|---|---|---|---|
| 1.0 | at most 0.020 | at most 0.080 | at most 0.015 |
| 0.7 | at most 0.040 | at most 0.160 | at most 0.020 |
| 0.35 | at most 0.060 | at most 0.220 | at most 0.020 |

Plus a **palette check** on the slab pixels at `s = 1`: bucket hue into violet, cyan, magenta thirds; each bucket's share differs by at most 0.10 between tiers. Plus an **oracle check** (separate, informational at first, a gate after S4): mesh L3 versus the lab raymarch High at the same framing, same tolerances as the table with mean at most 0.030 at `s = 1.0`, 0.060 at 0.7 and 0.065 at 0.35 (today 0.021, 0.052, 0.055). The oracle is the lab file copied to `apps/web/tests/fixtures/hero-oracle.html` in S4 (it is a 1000-line static page; decision for the lead whether to vendor it or render the oracle PNGs once and commit those, 3 PNGs at about 30 kB each; recommended: commit the PNGs, they are the reference).

Baseline updates: `tests/visual/home.spec.ts` snapshots of the hero under `?nogl=1` change in S2 (the poster replaces the painted cubes) and must be regenerated; the other sections' snapshots must not change.

---

## 9. Plain three: is it required for A, with numbers

**No.** A in the recommended architecture contains no three.js. If instead A were built inside R3F it would add about 8 kB gzip to a core that has 7.0 kB left (267.4 of 275), i.e. over budget by about 0.4 kB before PR #56's +0.64 kB. Either route leaves plain-three as an independent decision.

Numbers: R3F's `import * as THREE` is why the core is 267 kB rather than the spec's 200 kB; the M2 performance review estimated the plain-three migration at 115 to 135 kB saved (journey spec 6, estimate 125 to 145 kB core). On a Moto G-class phone, parsing and evaluating roughly 0.9 MB of raw JavaScript is an estimated 250 to 400 ms of main thread (assumed, unmeasured); this competes with the governor's first-frame samples only in the inside-R3F alternative. With the separate hero engine the hero is already on screen before that chunk is requested.

Recommendation: do not migrate for A. Keep the tripwire from the journey spec (core above 300 kB, or a long task above 100 ms on the Moto G-class pass) and evaluate it in S4 with real numbers; if it fires, the migration is S5. It is justified on its own merits eventually (it is the largest remaining JavaScript cost on mobile), but it touches every 3D file and the model slot and should not sit on the critical path of the hero.

Budgets (`apps/web/.size-limit.json`):

| Entry | Limit | Change |
|---|---|---|
| initial JS (non-3D) | 120 kB | `HeroLayer.tsx` and the gate add an estimated 0.3 kB to the initial chunk; headroom is 1.4 kB. Tripwire: if it measures above +0.8 kB, move the probes into the lazy chunk |
| assembly core | 275 kB | unchanged; must also exclude the new chunk (add `!.next/static/chunks/hero.*.js` to its path list so it is not double counted) |
| models | 26 kB | unchanged |
| **hero engine (raw WebGL2, lazy)** new | **12 kB** | path `.next/static/chunks/hero.*.js`, gzip; estimate 8 to 10, pinned at measured plus 5 percent after S1 |

Chunk naming: `import(/* webpackChunkName: "hero" */ './hero/HeroEngine')`, the same mechanism as `three` and `models`.

---

## 10. Phased rollout (slices, exact files, budgets, acceptance, rollback)

Order matters: S1 is already visibly better on a preview deploy and carries the riskiest judgement (a real phone GPU) first, behind a flag, so nothing in production changes until S2.

### S1: the engine behind a flag (`feat(web): the hero can render the iridescent monolith`)

Files (new): `apps/web/lib/hero/{geometry,progress,frame,governor,tiers,gate}.ts`; `apps/web/components/three/hero/{hero.glsl.ts,HeroEngine.ts,HeroLayer.tsx}`; tests `tests/unit/hero-{geometry,progress,frame,governor,gate,dispose,tiers}.test.ts`, `tests/e2e/hero.spec.ts`. Edits: `AssemblyLayer.tsx` (mount `HeroLayer` when `?hero=a` or `NEXT_PUBLIC_HERO=monolith`; pass nothing else), `components/sections/Hero.tsx` (add `data-hero-panel` to the panel; no visual change), `lib/assembly/capabilities.ts` (Save-Data returns false; one line plus a test row; this is a behaviour change for the whole Assembly, called out), `.size-limit.json` (new entry and the core exclusion). The cube rig is unchanged in S1: with the flag on the monolith layer sits behind the cube hero (cubes visible in front) which is acceptable for a preview and is why S3 exists; to make the preview honest, S1 also hides the cubes in the hero when the flag is on (`instanceCount = 0` when `from`, `to` are `monolith`, `mix` 0), a 6-line edit in `AssemblyCanvas.tsx`.

Budget: hero chunk at most 12 kB gzip; initial JS at most +0.8 kB; core unchanged to within 0.3 kB (the six-line edit).

Acceptance: typecheck, lint and the whole vitest suite pass (the one pre-existing failure, `models-slot.test.ts` "every ledger row is null", fails identically on develop 7dcf0cc per PR #56 and is not touched); geometry checksum pinned; e2e compile test green; parity test green at the 2.1-anchored tolerances for L3, L2, L1; with the flag off the page is byte-for-byte unchanged (`?nogl=1` visual snapshots unchanged); `?hero=a` on a desktop shows the assembled monolith, dust, rings, floor reflection and shadow; no long task above 100 ms from the mount path.

**The flagged real-GPU judgement:** Wieslaw opens the preview deploy at `?hero=a&perf=1` on his phone(s) and reports the tier the governor settled on, the p90 frame interval and whether the look matches the lab screenshots. Nothing past S1 is merged on SwiftShader evidence alone.

Rollback: remove the flag (it is off by default); or revert the PR. Zero effect on production.

### S2: posters, noscript, OG, default on (`feat(web): the hero poster is the monolith and the monolith is the default`)

Files: `apps/web/scripts/render-posters.ts`; `apps/web/public/posters/hero-*` (12 files); `apps/web/public/og/hero.png`; `apps/web/components/three/SectionBackdrop.tsx` (hero variant renders `<picture>`); `apps/web/app/layout.tsx` or the home page for `<noscript>`; the OG route; `AssemblyLayer.tsx` (flag default on, `?hero=off` kill switch); `apps/web/app/globals.css` (poster cross-fade rules keyed on `data-hero`, and hiding the hero 2D wash under `data-hero="live"`); `tests/visual/home.spec.ts` baselines regenerated; `tests/unit/` poster script dimension test.

Budget: posters within section 7; no JS growth.

Acceptance: the script produces 12 poster files plus the OG PNG at the stated dimensions and byte budgets; first live frame versus full poster within the 0.03 / 0.10 tolerance; CLS 0; LCP measured with the poster as candidate and as `fetchpriority="low"`, kept as LCP only if it beats today's 3.0 s simulated, never worse; `?nogl=1` and reduced-motion show the poster; the other sections' snapshots unchanged.

Rollback: `?hero=off` kill switch plus env flag; revert restores the painted 2D hero.

**S2 as built (PR #62).** The poster is the L0 tier; the default stays off (`HERO_DEFAULT_ON = false` in `lib/hero/mode.ts`, the one constant S3 flips).

- *Switch order*: `?hero=off` (wins over `?hero=a` whatever the order), `?hero=a`, `NEXT_PUBLIC_HERO=monolith|off`, then the constant. A ~150 byte inline script in `<head>` applies the query to `html[data-hero-mode]` before first paint; `AssemblyLayer` writes the same attribute after hydration. If the Content-Security-Policy is ever enforced without `'unsafe-inline'`, that script needs its sha256 in `script-src` (a blocked script costs a late poster, not a wrong page).
- *Pipeline*: `npm run posters:render` renders the live engine (tier 3, `freeze=3,<s>`, no grain) in Chromium on SwiftShader and refuses blank, wrong-tier, degraded-target or un-isolated frames; `npm run posters:check` (CI) recomputes the inputs hash (shader, engine and everything it imports, the hero section and the components in its panel, the stylesheet, fonts, the hero copy files, the render script, encoder settings, sharp version) and verifies sha256, size, format, byte budgets and a minimum-bytes floor. A failed budget or parity check writes nothing.
- *Budgets*: all AVIF meet the table in section 7. The two WebP dust stills (fallback only) are 16.3 kB (portrait) and 37.8 kB (landscape) at the quality floor; their budgets are 17 and 38 kB.
- *Save-Data*: gets the assembled still only. The mid and dust scroll-floor stills are not downloaded for Save-Data (`data-hero-saver`) or `prefers-reduced-data`; this overrides the triptych line in section 6 for those visitors. The floor also stays off under reduced motion.
- *No `<noscript>` copy*: the server-rendered `<picture>` already works with JavaScript off, and a second image would be a second request.
- *LCP, measured* (Lighthouse 13 via `lhci collect`, 3 runs each, simulated mobile throttling, Windows desktop, production builds, 2026-10-07; indicative, not CI numbers): default build LCP 2882, 3307, 2738 ms (median 2882), element `p.hero-sub`. Monolith build with the poster `fetchpriority="low"`: 2817, 2729, 2721 ms (median 2729), element the poster `<img>`. With `fetchpriority` left at auto: 2836, 2876, 2787 ms (median 2836). CLS 0.017 in all three (identical to default, so the poster adds none). Decision: keep `fetchpriority="low"`; the poster becomes the LCP element but is not slower (about 150 ms faster at the median, within the run-to-run spread of about 600 ms, so read it as "not worse", not "better"). Not measured: LCP on a real phone or on CI hardware, with the engine live on a real GPU, or on a cold cache.
- *Adjacent finding (not fixed here)*: in the production CSS the unprefixed `backdrop-filter` is dropped from `.glass` and only `-webkit-backdrop-filter` is emitted, so Chromium computes `backdrop-filter: none` on the hero panel. The glass blur may therefore be absent in Chrome today on the default build. Needs a look at the Tailwind/lightningcss targets.

### S3: the hand-over, demotion and palette parity (`feat(web): the monolith disperses into the stream as you scroll`)

Files: `AssemblyCanvas.tsx` (the `uFadeA/uFadeB` uniforms; hero instanceCount rule made permanent), `AssemblyMaterial.ts` and `assembly.glsl.ts` (size fade, the film tint), `lib/assembly/motion.ts` (nothing new, `ScrollVelocity` reused by the hero chunk), `lib/assembly/capabilities.ts` and `AssemblyLayer.tsx` (Save-Data gate for the whole Assembly), `app/globals.css` (hero glass `--glass-bg-hero-sm`, only if approved), tests (`assembly-journey.test.ts` updates; `assembly-bundles` and `assembly-cube-output` golden fixtures must stay unchanged, which proves the bundles were not touched).

Budget: core at most +0.8 kB (note: PR #56 reconciliation below).

Acceptance: scrolling the hero band reads as the monolith dissolving into dust that becomes the stream, with no frame where both the old cube monolith and the new one show; scrolling back up reassembles; velocity surge visible on the strips and absent at rest; golden fixtures unchanged.

Rollback: revert; the S1/S2 behaviour (cubes hidden in hero, no hand-over, hard fade) is a safe state.

### S4: device pass and the hard parity gate (`chore(web): hero measured on devices, parity gate on`)

Files: the oracle PNGs under `tests/fixtures/`, the parity spec's oracle block switched from informational to failing, `docs/superpowers/specs/2026-10-06-hero-monolith.md` section 11 filled with measured numbers, governor thresholds adjusted from real data, `.size-limit.json` pinned at measured plus 5 percent, optional environment LUT if the device pass shows the floor dominates.

Acceptance: the named devices measured (section 12 asks which), the tier each settled on recorded, the plain-three tripwire evaluated and recorded.

Rollback: thresholds are data; revert the PR.

### S5: optional

Plain-three migration (if the tripwire fires), NASA asteroid shards as the dust mesh, an armillary as the rings. Each its own PR.

### PR #56 ("light the scene"), what to keep

Keep: `lib/assembly/environment.ts` (strip softboxes, edge strips, dome) and its test; they light the cubes, the gyroscope and the other models, and the strip idea is the same as A's `envA`, so the page reads as one studio. Keep the cube material nudge (roughness, metalness, `envMapIntensity`). **Drop:** the `MeshPhysicalMaterial` hero shell, its generated film map and the tier-1 branch in `Artefact.tsx` / `lib/assembly/artefact.ts`: A replaces the hero shell, and the artefact survives only as the orbit core (replaced by the gyroscope when it loads), where a `MeshStandardMaterial` icosahedron is enough. That saves the +0.64 kB and some of the existing artefact bytes. Mechanically: ask the PR author to drop the two artefact files' hunks and the film-parameter test cases, or merge as is and have S3 delete the physical shell (cheaper to keep a clean history: drop it in #56). The PR's own honest critique ("better, not a wow") is the evidence: the cube-and-shell lighting rig was never going to reach the lab's look.

---

## 11. What remains unmeasured without a real phone

1. Real GPU frame time of the mesh path at any tier. All phone numbers here are derived (section 2.2) from assumed flops per evaluation and an assumed 0.15 to 0.25 TFLOPS. SwiftShader proves relative cost and correctness only.
2. Thermal and battery over a real scroll session. The design is low-duty (demand loop, 20 fps idle, a 2.6 s burst) but unmeasured.
3. iOS Safari: whether a half-float renderable target and `KHR_parallel_shader_compile` are available on the target iOS versions (extension availability is not verifiable from here), MSAA renderbuffer behaviour, and the memory of the 42 MB target on a 2 to 3 GB iPhone.
4. Compile and first-frame hitch on real drivers (Adreno, Mali, Apple), and whether the 1x1 prime draw behind the poster hides all of it.
5. The compositor cost of `backdrop-filter: blur(12px)` on glass panels over a repainting canvas on a mid-range phone.
6. Real DPR-3 devices: the L2 cap at 1.5 means the canvas is upsampled 2x by the compositor; whether the soft look plus grain hides that on his actual screen is an eye judgement.
7. The production panel's real height at 390 px and therefore the subject's real size and whether the reflection streak sits under glass.
8. Thin-ring shimmer without MSAA at L1.
9. The LCP effect of the poster (hypothesis, section 7).
10. Remaining look parity: the cyan left chamfer, the dust cell clip, the shadow approximation (2.1). Measured gaps are small and listed; they are S1 tuning.

---

## 12. Decisions that changed, and why

| Earlier position | Now | Reason |
|---|---|---|
| The lab: "Low quality and 0.5 to 0.75 scale on a mid-range phone, or a poster" | Not shipped. The raymarch is the oracle only | Its Low breaks the look (dashed rings, lost dust, measured) and costs 3 to 6 times a mid-range GPU's budget even so |
| Journey spec 5.6: detect-gpu tiers | Governor on measured frame intervals; detect-gpu not built | 6 kB plus a 30 to 60 kB JSON for a lookup; the question is whether the frame fits |
| Brief and journey spec: one R3F canvas hosts everything | A separate raw-WebGL2 hero chunk behind the R3F canvas (single-canvas alternative specified, 4.8) | First frame without the 267 kB chunk, no core budget cost, failure isolation; costs a second context only around one band |
| The hero shell is a procedural physical-material artefact (PR #56) | Replaced by the monolith; the artefact survives only as orbit core and fallback | A is the owner's choice and renders its own thin film |
| 3000 cubes are the hero | The hero draws none; cubes begin at the hand-over into the stream | Owner-approved demotion; also removes a 3000-instance draw from the hero |
| Posters are painted 2D cube formations | The hero poster is a render of the live engine; the other six keep the painter | The cross-fade must be between the same picture |
| Mount ignores Save-Data | Save-Data blocks the hero engine (S1) and the Assembly (S3) | 267 kB of decorative JavaScript is not Save-Data friendly |

---

## 13. Decision log (what was rejected, in one place)

- Live raymarch with a quality ladder: rejected (cost, and the ladder changes the picture).
- Pre-rendered scroll sequence as a tier: rejected (15 to 40x the engine's bytes, no parallax or pointer); three stills kept as the floor.
- Baked cube map or matcap for the object reflections: rejected (analytic is cheap on object pixels); an environment LUT for the floor only is an S4 lever.
- SDF baked to a mesh with marching cubes: rejected (the slab is convex; twelve planes).
- Instanced points for dust: rejected (faceted spinning cubes are the look).
- Reusing the A/B slot machinery for hero dust: rejected (heavier, wrong motion model); reused for the hand-over where it fits.
- drei `Environment`, `PerformanceMonitor`: still rejected (journey spec D5, D13).
- Dithered slab dissolve versus alpha: alpha rejected (sorting, double draw); dither kept, shimmer tested at L1.
- RGBA8 everywhere to save memory: rejected as the default (dark banding in a dark scene); kept as the fallback where half-float is not renderable.
- A single global quality `#define` set per tier: rejected (it is exactly how the lab's ladder broke the look).

---

## 14. Questions only Wieslaw can answer

1. **Which phones do you own and use?** Model, chipset if you know it, browser (Chrome on Android, Safari on iPhone), and how old. S1 needs at least one mid-range Android and one iPhone to judge; the Moto G-class target in the journey spec is a guess about what you hold. Which one is your "mid-range" in the brand claim?
2. **Glass alpha and blur on phones**: keep 72 percent and 12 px, or take 60 percent and 8 px in the hero only? (The numbers say contrast holds at 50 percent; it is a taste and cost call.)
3. **One WebGL context or two?** Recommended: a separate hero chunk (second context only around the hero-to-proof band). Say so if you want everything inside the R3F canvas (section 4.8) and accept the +8 kB core and the later first frame.
4. **Is "same look, not literally raymarched" acceptable?** The product renders the approved look with a mesh and the raymarch is kept as the reference. If you want the raymarch itself live on desktop only, that is a second code path and I would argue against it, but it is your call.
5. **Assembly duration and replay**: 2.6 s on load, and scrolling back up reassembles it. Good, or one-shot only?
6. **Save-Data and slow connections**: poster only, no 267 kB Assembly at all. Agree?
7. **The LCP experiment**: if a poster image beats the paragraph as LCP, are you happy for the poster to be the LCP element?
8. **Hero copy at 390 px**: the sub paragraph and the KPI trio make the panel taller than the lab's mock, which shrinks the subject. Do you want to trim the mobile hero copy, or keep it and accept a smaller monolith?
9. **PR #56**: drop its artefact material hunks and keep its environment, as proposed?
10. **Later upgrades**: NASA asteroid shards for dust and an armillary for the rings, now or after S4?

## Appendix: evidence files (scratch, not committed)

`C:\tmp\hero-a\mesh.html` (prototype), `run2.mjs`, `run3.mjs`, `run4.mjs`, `run5.mjs`, `sizes.py`, `diff.py`, `glass.py`, `shots\compare1.png`, `shots\lab-*.png`, `shots\mesh-*.png`, `seq\f000..f024.png`, outputs `sizes.out`, `diff.out`, `glass.out`, `notes.md`. Lab: `...\scratchpad\shader-lab\index.html`, `C:\tmp\shader-lab-shots\`.
