# The Assembly Journey — from cubes to a scene a visitor scrolls through

| | |
|---|---|
| **Owner** | Wieslaw Samushonga |
| **Date** | 2026-10-01 |
| **Status** | Proposed design, pre-implementation. Slice 1 is the next fleet build. |
| **Builds on** | [portfolio website spec](2026-08-15-portfolio-website-design.md) §4.4, §4.5, §6, §9 · [design brief](../../claude-design-brief.md) §2, §3 · [reconciliation](2026-08-16-design-system-reconciliation.md) §5 · [3D asset sourcing](../../3d-asset-sourcing.md) · [M2 mission log](../../lead/2026-10-01-m2-assembly-3d.md) |
| **Supersedes** | Nothing. It refines §4.4 where the M2 slice learned something (tier counts, lazy budget, lighting implementation) and says so in each place. |
| **Does not change** | The formation-per-section mapping (brief §2, reconciliation §5), the seven measured formation configs, the 2D fallback ladder. |

---

## 0. Summary

The M2 slice shipped the mechanism: 3 000 instanced cubes that lerp between seven formations as the visitor scrolls (`apps/web/components/three/AssemblyCanvas.tsx`). It reads as cubes. The owner's words: "it needs to be an expressive journey; right now it was only cubes but we need something real."

This spec turns the mechanism into a journey in four slices:

1. **A signature artefact and an expressive morph.** A procedural crystalline core with an inner glow and two gyroscopic rings, generated in code. On load the monolith assembles around it. Morphs become staggered per instance, displaced by curl noise, with per-instance rotation and a scale pulse, plus a thin dust layer. All of it runs in the vertex shader. The pointer ray becomes perspective-correct and the four performance follow-ups from the M2 review land here.
2. **Set pieces per section.** The stream flows, the lattice drifts toward the hovered card, the orbit's rings rotate at their own rates around the artefact, the scatter settles under a cheap gravity, the grid turns, the ring resolves and calms. A camera rig dollies and tilts between sections.
3. **Tier 3 and the physics opt-in.** GPU tiering, bloom/vignette/SMAA at tier 3, a transmissive artefact at tier 3, and the Craft section's "flick the cubes" moment on a real physics engine loaded only on click.
4. **Posters, OG images and a device pass** with measured numbers.

The constraints that do not move: the page stays a normal HTML document with the layer behind it; reduced motion never mounts WebGL; every path that does not mount leaves the 2D site exactly as it ships today; the initial JS budget (120 kB gz) is untouched because everything here lives in lazy chunks.

---

## 1. What exists today (the starting point, anchored)

| Thing | Where | What it does |
|---|---|---|
| Mount gate | `apps/web/components/three/AssemblyLayer.tsx:72-141` | 2D ladder rung must be `live` or `reduced-instances`, WebGL2 probe on its own canvas, `?nogl=1` kill switch, mount after `scheduleIdle`, error boundary, module-level give-up |
| Scene | `apps/web/components/three/AssemblyCanvas.tsx` | One `InstancedMesh` of `BoxGeometry`, `MeshStandardMaterial` flat-shaded, hemisphere + directional light, ACES at exposure 1.1, DPR [1, 1.5], `frameloop="demand"`, 30/20 fps idle ticker |
| Morph | `AssemblyCanvas.tsx:305-392` | CPU lerp of position, scale and colour per instance per frame; `instanceMatrix` and `instanceColor` rewritten every frame |
| Pointer | `AssemblyCanvas.tsx:296-303, 326-346` | Repulsion along a **parallel** ray (`viewLocal = (0,0,1)`), which is wrong under a perspective camera off-centre; springs back at 8/s |
| Targets | `apps/web/lib/assembly/targets.ts` | Pure. One `TargetBundle` per formation, **viewport-dependent** (world units baked in), all seven built at mount and rebuilt on every resize |
| Scroll | `apps/web/lib/assembly/scroll.ts` | Pure. `from`, `to`, eased `mix`, `opacity` from the section boxes; ±0.35 vh transition bands |
| Formations | `apps/web/lib/formations/{config,generators}.ts` | Seven measured configs and seeded point clouds, shared with the 2D painter. **Not to be changed** (reconciliation §0) |
| Fallback | `apps/web/lib/formations/fallback.ts` | Five-rung 2D ladder. WebGL is a sixth rung above it (`lib/assembly/capabilities.ts`) |
| Budget | `apps/web/.size-limit.json` | Initial JS 120 kB; lazy three + R3F pinned at 260 kB (measured 253.6 kB) |

Review findings carried into this spec (M2 log, "Follow-ups"): the pointer ray; build only the from/to bundles at mount with a per-formation cache; frame-invariant targets plus O(1) frame scalars; colour change-tracking; `gl.compileAsync` before the first visible frame; gate the mount on LCP; R3F's `import * as THREE` versus the 200 kB lazy target.

---

## 2. Goals and non-goals

**Goals**
- A visitor who scrolls the home page sees one continuous object behave differently in every section, and can tell what each section is about from the motion alone.
- A hero that has a silhouette: something to remember, not a cloud of boxes.
- Frame cost independent of instance count (GPU morph), so phones get the same choreography at a lower resolution rather than a cut-down scene.
- Every new dependency is lazy, measured, and pinned in `size-limit`.

**Non-goals**
- A modelled (GLB) artefact, AR, the Lab, or any asset pipeline work (spec §4.1 M4). The artefact is procedural by design (§9, D1).
- Changing which formation belongs to which section, or any measured formation value.
- Light theme. Lenis. Gyroscope parallax (spec §4.4 lists it; it is deferred past this spec because it needs an iOS permission gesture and a visible button, which is a design question).

---

## 3. The journey, section by section

The visitor's path down `/` is nine sections; seven carry a formation (`SECTION_BACKDROPS`, `apps/web/lib/formations/config.ts:106-116`). Timeline and Writing stay flat: the layer fades to 0 over them and holds the last formation, as today. Every formation's colour bias follows its measured `wash` (violet `#7C3AED` or cyan `#22D3EE`) and the brief's rule: violet is leadership, cyan is craft.

| # | Section | Formation | Motion added | Colour bias | Pointer | Idle | The visitor should feel |
|---|---|---|---|---|---|---|---|
| 1 | Hero | Monolith + **artefact** | Assembles from a cloud on load; breathes | Violet | Repel (perspective ray) | Breath, wobble, artefact ring spin | "Someone who builds" |
| 2 | Proof strip | Stream | Cubes **flow** along the river and wrap | Cyan | Repel, weaker (0.4) | Flow continues | Breadth, flow |
| 3 | Selected Work | Lattice | Cubes **drift toward the hovered card** | Violet | Attractors, no repel | Gentle wave | "The system responds to you" |
| 4 | How I Lead | Orbit | Three rings **rotate at different rates** around the artefact | Violet | Repel 0.6 | Rings keep turning | A team around a centre |
| 5 | Craft | Scatter | Airborne cubes **fall and settle**; opt-in real physics | Cyan | Repel 1.0, radius 1.5× | Pile shivers | Play, proof |
| 6 | Stack | Grid | Whole lattice **rotates slowly** | Violet | Repel 0.3 | Rotation | Order |
| 7 | Contact | Ring | Draws itself around, then **calms** | Cyan | Repel 0.5, soft | Near-still, slow turn | Resolution |

### 3.1 Hero: the artefact and the assembly on load

**The artefact.** A faceted crystalline core, generated in code (`lib/assembly/artefact.ts`, pure geometry maths; the three objects are created in `components/three/Artefact.tsx`):
- Outer shell: `IcosahedronGeometry(1, 1)` (80 faces), each vertex displaced along its normal by seeded noise (`createRng(seedFor('artefact'))`, amplitude 0.12, three octaves), then `toNonIndexed()` and `computeVertexNormals()` so every face is flat. Radius 0.42 monolith model units, so it fits inside the column's taper (0.4 at the base).
- Inner glow: a second icosahedron at 0.55 of the shell's radius, `MeshBasicMaterial` with additive blending, vertex colours running violet (bottom) to cyan (top), opacity pulsing 0.35–0.6 at the breathing rate. A `PointLight` (violet, intensity 2, distance 2.5 model units) at its centre lights the nearest cubes from inside at tiers 2–3.
- Two gyroscopic rings: `TorusGeometry(0.58, 0.012, 8, 64)` and `TorusGeometry(0.72, 0.012, 8, 64)`, tilted 0.6 rad and −0.9 rad, turning at 0.18 and −0.11 rad/s about their own tilted axes. Metalness 0.9, roughness 0.2.
- Material: `MeshStandardMaterial` (metalness 0.7, roughness 0.28, flat) at tiers 1–2. Tier 3 swaps to `MeshPhysicalMaterial` with `transmission 0.6, thickness 0.8, ior 1.5`, which makes the inner glow visible through the facets (slice 3).
- Placement: the column's centre of mass, y = +0.1 model units. Cubes that would sit inside the shell (interior-fill face 4 of the monolith generator) are moved outward to the shell radius plus 0.06 in a **clearance post-pass on the bundle**, never in the generator, so the 2D painter and its visual snapshots stay byte-identical. Expected count: 5–7 % of the monolith's cubes (estimate; the pass logs the number in dev).

**Assembly on load.** The first scroll state is `{ from: 'cloud', to: 'monolith' }`, where `cloud` is a pseudo-formation that exists only as a target bundle (`lib/assembly/cloud.ts`): the same points as the monolith, each pushed to a random point on a sphere of radius 3.0 model units, seeded. `mix` is driven by a 1.8 s clock (ease-out quintic) started on the first drawn frame, not by scroll; a scroll during the assembly simply takes over `to`. The artefact ignites at 0.6 s: scale 0 → 1 over 0.9 s (back-out), the glow flashes once to 1.0 and settles. Total: the page is readable (HTML) before any of this, and the 2D canvases cross-fade out only on the first drawn frame, as today.

**Camera.** Distance 10 (today's `CAMERA_DISTANCE`), tilt 0, pointer parallax ±3°.

### 3.2 Proof strip: the stream flows

Stream points are `x = -3.2 + t·6.4` on a sine/cosine river (`generators.ts:117-126`). The bundle stores each cube's residual from the curve; the shader advances `x` by `uTime · 0.35` model units/s and wraps it at ±3.2, recomputing `y` and `z` from the curve plus the residual. The river therefore moves right-to-left for ever and the ends bleed off the viewport as they do in the poster. Colour `t` advances with `x` so the gradient travels with the flow. Camera: dolly out to 11.5, tilt −2° (looking very slightly up at a thin band), parallax ±1.5°. Pointer repulsion at 0.4 strength so a hand through the river parts it without breaking it.

### 3.3 Selected Work: attractors

Each `ProjectCard` (`components/cards/`) gets `data-attract`. `SelectedWork` registers `pointerenter`/`pointerleave` on the card grid and writes the hovered card's centre, projected to the z = 0 plane with `pixelToWorld`, into `uAttractors[0]` with strength easing 0 → 1 at 6/s. Cubes within 0.9 model units drift toward it by `falloff² · 0.35 · 0.9`; outside, nothing. On touch (`pointer: coarse`), the card nearest the viewport centre is the attractor, so phones get the moment too. Up to 8 attractors are supported (`uAttractors[8]`, spec §4.4); the section uses one, the grid of cards never hovers two. No repulsion here: the pointer is an invitation, not a push. Camera: distance 10, tilt +6° (looking down on the plane), parallax ±2°.

### 3.4 How I Lead: rings around the artefact

The orbit generator pushes the core first (22 %), then three rings of 19 % each (`generators.ts:150-184`), so the group of instance `i` is derivable from its index without touching the generator: `groupFor(i, count)`. The bundle's `spin` attribute (axis xyz + rate, see §4.3) is the ring's tilted axis with rates 0.05, −0.035 and 0.08 rad/s; the core gets 0.02 rad/s about y. The artefact returns here at 0.6 scale as the heart of the core (the brief's "a team around a centre"): it fades in over the transition band (`mix > 0.5` toward orbit), rings off, glow on. Camera: dolly in to 9, tilt 0, parallax ±3°, plus a slow camera orbit of 0.03 rad/s about y so the rings' depth reads. Repel 0.6.

### 3.5 Craft: settle, then opt-in physics

The scatter generator marks airborne cubes with `t = 0.78` exactly (`generators.ts:189-199`); the clearance of that value in the bundle build flags them (`aFall = 1`). When the scroll store's `to` becomes `scatter` and `mix` passes 0.5, the scene sets `uDropAt = uTime`. The shader then lowers each flagged cube: `y = max(ground, y0 − ½·g·(uTime − uDropAt)²)` with `g = 2.2` model units/s² and one damped bounce (`|…|·0.3`); the pile below gets a shiver of amplitude 0.01 for 1.2 s after the first landing. Leaving and re-entering the section replays it. Pointer: repel at full strength, radius 1.5×, so the pile can be pushed around. Cyan-led, as the poster.

**Physics opt-in (slice 3).** A "Flick the cubes" button inside the Craft panel (hidden unless `html[data-gl="live"]`, so it never appears on the 2D path) loads `@react-three/rapier` and the Rapier WASM on click only. 300 instances are promoted to `InstancedRigidBodies` (spec §4.4); the main mesh hides those 300 by writing scale 0 into both slots once. Pointer drag applies an impulse; a "Reset" returns them to the formation (bodies removed, scales restored). Camera: 10.5, tilt +4°, parallax ±2°.

### 3.6 Stack: the grid turns

Every grid instance gets `spin = (0, 1, 0, 0.05)`: rotation about the formation's y axis through its origin, which turns the whole 13³ lattice as one body at 0.05 rad/s (a full turn in about two minutes). Colour `t` is depth-mapped in the generator, so the gradient sweeps as it turns. Camera: dolly out to 11, tilt 0, parallax ±1°. Repel 0.3.

### 3.7 Contact: the ring resolves and calms

The ring's `t` is its angle around the torus (`generators.ts:218-228`), so staggering the morph by `t` instead of the random seed makes the ring draw itself around in one sweep (1.4 s at scroll speed, see §4.1). Once `mix` reaches 1, `uCalm` eases 0 → 1 over 2 s: noise amplitude, bob and breathing fall to 30 %, repulsion to 50 %, and the torus turns at 0.02 rad/s. Camera: dolly out to 12, tilt +8°, parallax ±1°. The footer below is `relative` and above the layer (M2 fix), unchanged.

### 3.8 Camera choreography

A pure module, `lib/assembly/camera.ts`, maps a formation to a rig `{ distance, tiltDeg, parallaxDeg, orbitRate }` and lerps two rigs by the scroll `mix`. The scene damps toward the lerped rig at 4/s (`1 − exp(−4·dt)`, the exponential damp already used for parallax; `maath` is not added, §9 D12).

| Formation | Distance | Tilt | Parallax | Orbit (rad/s) |
|---|---|---|---|---|
| monolith | 10.0 | 0° | ±3° | 0 |
| stream | 11.5 | −2° | ±1.5° | 0 |
| lattice | 10.0 | +6° | ±2° | 0 |
| orbit | 9.0 | 0° | ±3° | 0.03 |
| scatter | 10.5 | +4° | ±2° | 0 |
| grid | 11.0 | 0° | ±1° | 0 |
| ring | 12.0 | +8° | ±1° | 0 |

A dolly changes the world-per-pixel factor, so the frame scalars (§5.2) are recomputed from the **current** camera distance each frame: one `tan`, one multiply. The anchor therefore stays on its measured pixel (`cx`, `cy`) at every distance; what the dolly changes is the perspective and the cube size, which is the point. Portrait keeps 45° FOV and all distances scale by 1.15 (the formation gets more room above the panel).

---

## 4. Transitions that read as expressive

Everything in this section is evaluated in the vertex shader. The CPU writes a handful of uniforms per frame and one attribute slot per formation change.

### 4.1 Staggered per-instance easing

Each instance carries `aSeed` (0..1, seeded per index; for `ring`, its `t`). Local progress `m = smoothstep(0, 1, (uMix − aSeed·S) / (1 − S))` with stagger width `S = 0.35`. The first cubes leave when `uMix = 0`, the last when `uMix = 0.35`; all have landed at `uMix = 1`. The scroll store's `mix` is already smoothstepped (`scroll.ts:60-63`), so the perceived curve is a double ease: soft departure, firm landing.

### 4.2 Curl-noise displacement

`pos += curl(posA·0.6 + uTime·0.2) · uNoiseAmp · sin(π·m)`. The `sin(π·m)` envelope is zero at both ends, so formations land exactly on their measured points; mid-morph the cubes swirl rather than fly in straight lines. `uNoiseAmp` is 0.35 model units at tier 2–3 and 0.2 at tier 1. The curl is the standard three-sample simplex curl (≈ 60 ALU per vertex; at 3 000 instances × 24 vertices this is nothing for any GPU that passed the WebGL2 probe).

### 4.3 Per-instance rotation, spin and scale pulse

- **Self-rotation during a morph:** axis from `aSeed` (hashed to a unit vector), angle `m · 2π · 0.5 + uTime · 0.15 · aSeed`. Cubes tumble half a turn as they travel and keep a faint idle twist.
- **Formation spin (`aSpin`, vec4 axis + rate):** rotates the instance's **position** about the formation's origin by `rate · uTime`. Zero for most formations; the orbit rings, the orbit core and the grid use it (§3.4, §3.6). Because the attribute belongs to the slot, a morph from grid to ring blends the spin out with `m`.
- **Scale pulse:** `scale · (1 + 0.25 · sin(π·m))`, so cubes swell mid-flight and settle to their measured edge.
- **Flow (`aFlow`, float):** the stream's wrap (§3.2); 0 everywhere else.
- **Fall (`aFall`, float):** the scatter's gravity (§3.5).

### 4.4 Dust

A second object, `Points`, shares the same A/B slots on a subsample (every 2nd instance at tier 3, every 4th at tier 2, none at tier 1), rendered as 1.5 px soft discs at 25 % alpha with `uNoiseAmp · 2.5` and a stagger width of 0.6, so dust lags the cubes and trails behind a morph. One extra draw call, no render target. Real trails (previous-frame ghosting) were rejected: they need a feedback render target and a full-screen pass per frame (§9, D8).

### 4.5 What the CPU does per frame

Writes `uMix`, `uTime`, `uCalm`, `uDropAt`, `uPointerOrigin`, `uPointerDir`, `uRepel`, `uAttractors` (only when an attractor is active), the group transform and the camera rig. On a formation change: writes the new bundle into the slot not holding the current `from` (one `needsUpdate` per attribute) and flips `uSwap`. The 3 000-iteration loop in `AssemblyCanvas.tsx:326-376` is deleted.

---

## 5. Rendering architecture

### 5.1 GPU morph via `three-custom-shader-material`

`MeshStandardMaterial` extended through CSM (spec §4.4). Attributes per slot (A and B): `aPos` (3), `aScale` (1), `aColT` (1), `aSpin` (4), `aFlow` (1), `aFall` (1); shared: `aSeed` (1). Uniforms: `uMix`, `uSwap`, `uTime`, `uNoiseAmp`, `uCalm`, `uDropAt`, `uPointerOrigin` (vec3), `uPointerDir` (vec3), `uRepel`, `uRepelRadius`, `uAttractors[8]` (vec4), `uPalette[3]` (violet, fuchsia, cyan), `uBias`. Colour is `shade(t)` moved into the shader: `aColT` (one float) plus the three-stop palette, with `uBias` shifting `t` by ±0.08 per section (violet-led sections −, cyan-led +). This replaces the per-instance RGB buffer and makes the "colour change-tracking" follow-up moot: colour is written once per slot, never per frame.

The pointer ray: `uPointerOrigin` is the camera position in group-local space and `uPointerDir` the normalised direction from the camera through the pointer's point on the z = 0 plane (`pixelToWorld`), also group-local. The shader computes each instance's perpendicular distance to that ray; the maths in `AssemblyCanvas.tsx:330-346` is kept, only the ray is correct. The same two vectors fix the CPU path in slice 1a before the shader exists.

Repulsion is stateless on the GPU (no per-instance spring), so the push is applied as `falloff² · radius · uRepel` directly and the softness comes from damping `uRepel` on the CPU (rise 8/s, fall 4/s). The spring's visible behaviour (cubes ease back when the pointer leaves) is preserved by that damping.

### 5.2 Frame-invariant target bundles and O(1) frame scalars

`buildTargets` currently bakes `unit`, `edge` and the anchor into every bundle (`targets.ts:117-151`), so a resize rebuilds all seven. The new `ModelBundle` is **model space**: positions as the generator made them (z flipped), `colT`, scale as `1` or `0` (live or surplus), `spin`, `flow`, `fall`, `seed`. The three per-frame scalars `{ unit, edge, anchor }` are computed from the current `Frame` and camera distance (`frameScalars(cfg, frame, distance)`, pure, tested) and sent as uniforms `uUnitA/uUnitB`, `uEdgeA/uEdgeB`; the anchor goes on the group as today. A resize touches no buffer.

`lib/assembly/bundle-cache.ts`: a `Map<FormationId | 'cloud', ModelBundle>` built on demand; mount builds `cloud` and `monolith` only; the next formation is built when the scroll store's `to` changes, synchronously (≈ 1 ms each on desktop per the M2 measurement of 7 ms for seven; estimate 3–4 ms on a phone, below the 16 ms frame).

### 5.3 Lighting

Spec §4.4's intent: lightformer-lit, no HDRI, ACES. Implementation: three's own `PMREMGenerator.fromScene` over a tiny scene of five emissive planes (`lib/assembly/environment.ts`: a violet key plane above-left, a cyan rim plane behind-right, a dim white top strip, two near-black fills), generated once after the first frame (one frame later than the first draw so it never sits on the LCP path), set as `scene.environment`, intensity 0.8. The hemisphere and sun lights stay for the flat top-face read the 2D painter established. Tier 1 skips the environment (hemisphere + sun only). ACES at exposure 1.1 as today.

drei's `Environment` + `Lightformer` was rejected for this (§9, D5): its import graph carries the HDR/EXR/gain-map loaders this scene never uses (estimate 30–50 kB gz; the builder measures it in the PR and may switch back if the tree-shaken cost is under 12 kB).

### 5.4 Materials

Cubes: `MeshStandardMaterial` through CSM, flat shading, roughness 0.45, metalness 0.25 (today's values), `envMapIntensity 0.8`. Artefact: §3.1. Dust: `PointsMaterial` with a generated 32 px radial-alpha texture, additive, depth write off.

### 5.5 Post (tier 3 only, slice 3)

`@react-three/postprocessing` in its own chunk: `Bloom` (mipmap, luminance threshold 0.8, intensity 0.6), `Vignette` 0.3, `SMAA`; MSAA off when the composer is on (spec §4.4). The artefact's glow and the dust are the only emissive sources, so bloom reads as the artefact's halo, not a smeared field. With post on, DPR is capped at 1.5 regardless of tier (a 2560×1440 canvas at DPR 2 is 15 Mpx per render target; three half-float targets would exceed 100 MB on the GPU), and the composer uses half-float buffers.

### 5.6 Tier detection and DPR

`detect-gpu`, run **after** the first drawn frame, with the benchmark JSON **self-hosted** under `public/gpu-benchmarks/` (`benchmarksURL`); the site is first-party-only (spec §11 analytics row) and must not fetch from unpkg at runtime. Default tier 2 until resolved; `?tier=1|2|3` overrides. Tier changes what runs, not the instance count:

| | Tier 1 | Tier 2 (default) | Tier 3 |
|---|---|---|---|
| Instances | `capacity` from the 2D ladder's `keep` (3 000 or 1 350) | same | same |
| DPR cap | 1.0 | 1.5 | 2.0 desktop, 1.5 touch, 1.5 with post |
| Environment map | off | on | on |
| Dust | off | 1/4 | 1/2 |
| Noise amplitude | 0.2 | 0.35 | 0.35 |
| Artefact material | Standard | Standard | Physical, transmission |
| Post | off | off | bloom + vignette + SMAA |

This deviates from §4.4's counts (2 000 / 6 000 / 16 000) on purpose: the formations are measured designs with fixed `n` (reconciliation §0), and the 2D ladder already thins them to 45 % on modest hardware. Density is the ladder's decision; tier decides fidelity.

**DPR monitor:** own, ~40 lines (`lib/assembly/perf-monitor.ts`, pure decision function tested as a table): frame intervals are sampled only while a morph is running (the demand loop is otherwise idle and would read as "fast"); if the p90 of the last 60 samples exceeds 24 ms, DPR steps down 0.25, never below 1, never back up within the session. drei's `PerformanceMonitor` assumes a continuous loop and was rejected (§9, D13).

### 5.7 Frame loop, mount timing, context loss

- `frameloop="demand"` stays. Scroll, pointer, resize and the attractor invalidate; the idle ticker runs at 30 fps on pointer devices and 20 on touch while the tab is visible and `opacity > 0`, as today, and now also drives the stream flow, the spins and the breathing. Nothing runs under `document.hidden` or at opacity 0.
- **Mount on LCP, not on a 300 ms idle timeout.** `AssemblyLayer` waits for a `largest-contentful-paint` `PerformanceObserver` entry (buffered), then `requestIdleCallback` with a 2 s timeout; where the observer is unsupported it falls back to `load` + 1 s. The WebGL2 probe moves inside that callback.
- **`gl.compileAsync`** for the cube material, the dust material and the artefact materials before the first draw; the first visible frame is scheduled only when all have resolved, so the first frame has no shader-link stall. The 2D canvases keep painting until then, as today.
- **Context loss** as today (`AssemblyCanvas.tsx:240-262`): first loss fades the 2D layer back, restore re-inits; a second loss gives up for the session. Restore additionally regenerates the environment PMREM and re-runs `compileAsync`; the attribute slots re-upload themselves.
- **Reduced motion never mounts WebGL.** `shouldMountWebGL` (`capabilities.ts:31-34`) is unchanged and its test is the contract.

### 5.8 The 2D fallback ladder

Kept whole. The five 2D rungs render on every path where WebGL does not mount or has given up; `html[data-gl="live"]` cross-fades them out only after a drawn frame. Posters (slice 4) are added for OG images and `<noscript>`, not as a replacement rung.

---

## 6. Dependencies and the lazy budget

All sizes gzipped. "Est." numbers are estimates from package sizes and the M2 measurements; each PR replaces them with `size-limit` output and pins the entry at the measured number plus 5 %.

| Dependency | Chunk | Est. cost | Why |
|---|---|---|---|
| `three-custom-shader-material` (+ its `object-hash` dep) | core | ~8 kB | Extends `MeshStandardMaterial` without forking three's shader chunks |
| `detect-gpu` + self-hosted benchmark JSON | core / fetched | ~6 kB + 30–60 kB fetch after first frame, cached | Tier decision |
| `@react-three/postprocessing` + `postprocessing` | effects (tier 3 only) | ~45–55 kB | Bloom, vignette, SMAA |
| `@react-three/rapier` + `@dimforge/rapier3d-compat` | physics (on click only) | ~1 MB (spec §4.4 estimate) | The Craft opt-in |
| No `@react-three/drei`, no `maath` | — | 0 | §5.3, §9 D5/D12 |

**Budget split** (`.size-limit.json`, replacing the single 260 kB lazy entry):

| Entry | Limit | Notes |
|---|---|---|
| initial JS (non-3D) | 120 kB | Unchanged. Nothing from this spec may land in it |
| assembly core (three + R3F + CSM + scene) | **280 kB** | Today 253.6 + CSM 8 + scene code ~10 (est.) |
| assembly effects (postprocessing) | 60 kB | Loaded at tier 3 after the first frame |
| assembly physics (rapier) | 1.4 MB | On click only; listed so growth is visible |

**R3F stays for slices 1–4** (§9, D3). R3F's `import * as THREE` is why the core is 253.6 kB against the spec's 200 kB. Migrating to plain three first would delay the visible work by a slice and then force the artefact, CSM, post and rapier integrations to be written against raw three instead of their R3F-native wrappers. Tripwire: if the measured core exceeds 300 kB after slice 3, or the Moto G-class long-task budget (§7) fails on hydration, the plain-three migration (estimate 125–145 kB core per the M2 performance review) becomes slice 5 ahead of posters. Spec §6's "≤ 200 kB" row is to be amended to this table when slice 1 merges.

---

## 7. Budgets and verification

### 7.1 Frame time per tier (targets; measured column filled in slice 4)

| Device class | Tier | Target frame time during a morph | Target idle tick | Measured |
|---|---|---|---|---|
| Desktop, discrete GPU or Apple M-series | 3 | ≤ 8 ms (spec: ≤ 16.6) | ≤ 4 ms | — |
| Laptop iGPU (Intel Iris Xe class) | 2 | ≤ 12 ms | ≤ 5 ms | — |
| Phone, upper mid (Pixel 7a / iPhone 13 class) | 2 | ≤ 16 ms | ≤ 8 ms | — |
| Phone, Moto G-class (Snapdragon 6xx, 4 GB) | 1 | ≤ 33 ms (spec) | ≤ 12 ms | — |

Measured by hand with the `?perf=1` HUD (slice 4: frame interval p50/p90, DPR, tier, draw calls, instance count) on the named devices, and recorded in this table. CI cannot measure GPU frame time (SwiftShader); it does not try.

### 7.2 Long tasks around LCP

- No single long task over 100 ms after LCP from the Assembly's mount path (chunk evaluation, bundle build, PMREM, compile).
- Total long-task time attributable to the mount path ≤ 300 ms on the CI runner (desktop class; the phone equivalent is roughly 3× and is checked by hand).
- LCP itself must not move: the mount waits for the LCP entry (§5.7). `lighthouserc.cjs` keeps `largest-contentful-paint` at `warn` until the hydration cost noted there is fixed; this spec does not loosen it and slice 4 tries to restore it to `error`.

### 7.3 Memory

- GPU buffers: two slots × 3 000 × 11 floats × 4 B ≈ 264 kB, dust ≤ 1 500 points, PMREM 256² cubemap ≈ 2 MB, post targets at DPR 1.5 on a 1440p desktop ≈ 3 × 44 MB. Target GPU allocation ≤ 150 MB at tier 3, ≤ 40 MB at tier 2 (estimates; hand-checked with `chrome://gpu` memory and Safari's Timelines on the device pass).
- JS heap growth after mount ≤ 30 MB (`performance.measureUserAgentSpecificMemory` in the perf smoke where available, otherwise the Playwright CDP `Performance.getMetrics` JSHeapUsedSize delta).

### 7.4 How it is measured

| Check | Tool | Where |
|---|---|---|
| Types, lint, unit | `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest) | every PR, CI `ci.yml` |
| Bundles | `pnpm size` (`size-limit`, the four entries above) | every PR |
| Lighthouse budgets | `pnpm lighthouse` (`lhci`, three runs) | every preview |
| Perf smoke | new `apps/web/tests/e2e/perf.spec.ts`: Chromium with `--use-angle=swiftshader`, `PerformanceObserver('longtask')` from navigation to 8 s, asserts §7.2, asserts `html[data-gl="live"]` appears within 8 s, scripted scroll through all sections with no console errors and no context loss | every PR |
| 2D path unchanged | existing `tests/visual/home.spec.ts` snapshots run with `?nogl=1` | every PR |
| a11y | existing `tests/e2e/a11y.spec.ts` (the layer is `aria-hidden`, nothing new reaches AT) | every PR |

---

## 8. Slices

Each slice is one concern per PR (conventions), targets `main` (the card: no `develop`), and is not merged by the lead (`auto_main: no`).

### Slice 1: the artefact and the GPU morph (next build)

Split into two PRs because 1a changes no pixels and is the safety net for 1b.

**1a: perf follow-ups and the pointer ray** (no visual change)
- Files: `lib/assembly/targets.ts` (model-space `ModelBundle`, `frameScalars`), new `lib/assembly/bundle-cache.ts`, `components/three/AssemblyCanvas.tsx` (consume scalars, build on demand, perspective ray, `compileAsync` before first frame), `components/three/AssemblyLayer.tsx` (LCP-gated mount, probe inside the callback), `lib/assembly/capabilities.ts` (a pure `mountAfter(lcpSeen, idle)` decision).
- Tests: `tests/unit/assembly-targets.test.ts` (bundle is identical across two frames; scalars reproduce today's world positions to 1e-6), new `tests/unit/assembly-bundle-cache.test.ts` (builds on demand, once), `assembly-layer.test.tsx` (mounts after the LCP entry, not before), a pure ray test (an off-centre pointer's ray passes through the camera position).
- Acceptance: typecheck, lint, vitest green; visual snapshots unchanged on `?nogl=1`; `size-limit` core unchanged ±2 kB; perf smoke long-task assertions pass; a resize no longer rebuilds any bundle (asserted by a counter in the cache test).

**1b: GPU morph, artefact, lighting**
- Files: new `components/three/AssemblyMaterial.ts` (CSM material, GLSL in a `.glsl.ts` string module), new `lib/assembly/artefact.ts` (pure geometry: displaced icosahedron vertices, ring parameters) and `components/three/Artefact.tsx`, new `lib/assembly/cloud.ts`, new `lib/assembly/environment.ts` (lightformer layout, pure) and the PMREM step in `AssemblyCanvas.tsx`, `lib/assembly/targets.ts` (`seed`, `spin`, `flow`, `fall`, `colT`, the artefact clearance pass), `AssemblyCanvas.tsx` (slot writing, `uSwap`, uniforms, dust `Points`, the on-load assembly clock), `package.json` (+ `three-custom-shader-material`), `.size-limit.json` (core entry).
- Tests: artefact geometry is deterministic (checksum) and fits radius 0.42; clearance pass moves only interior points and leaves the generator output untouched (`formations.test.ts` snapshots unchanged); slot-swap logic as a pure table (`from`/`to` changes never rewrite the slot holding `from`); environment layout pure test; e2e perf smoke sees `data-gl="live"`.
- Acceptance: morphs are staggered and noise-displaced on every section boundary; the monolith assembles around the artefact within 2 s of the first frame; core chunk ≤ 280 kB; 2D visual snapshots unchanged; the frame loop writes no per-instance data per frame (asserted by a dev-only counter test on the slot writer).

### Slice 2: set pieces and the camera

- Files: new `lib/assembly/camera.ts` (pure rig table + lerp), `AssemblyCanvas.tsx` (rig damping, `uCalm`, `uDropAt`, `uBias`, attractor uniform), shader (`flow`, `fall`, `spin`, `calm`), `components/sections/SelectedWork.tsx` and `components/cards/ProjectCard.tsx` (`data-attract`, pointer registration into the store, touch centre-card rule), `components/three/Artefact.tsx` (orbit appearance), `lib/assembly/targets.ts` (`groupFor`, per-formation spin/flow/fall fill).
- Tests: camera rig lerp and portrait scaling; `groupFor` matches the generator's push order for every `keep`; attractor selection on touch (nearest to centre); `uDropAt` is set once per entry (store test).
- Acceptance: each of the seven behaviours in §3 is visible and matches its row; hovering a project card pulls the lattice toward it on desktop; on a phone the centre card does; no change to initial JS; perf smoke green.

### Slice 3: tier 3 and the physics opt-in

- Files: new `lib/assembly/tier.ts` (pure tier mapping from detect-gpu's result + `?tier=` override), `public/gpu-benchmarks/`, new `lib/assembly/perf-monitor.ts`, new `components/three/Effects.tsx` (dynamic import, tier 3 only), artefact `MeshPhysicalMaterial` at tier 3, new `components/three/CraftPhysics.tsx` (dynamic import on click) and `components/sections/Craft.tsx` (the toggle, hidden without `data-gl="live"`), `.size-limit.json` (effects and physics entries).
- Tests: tier table (default T2, override wins, resolution after first frame never changes `capacity`); DPR step-down decision table; the toggle is absent from the DOM when `data-gl` is unset and present when set; the physics module is not requested until click (perf smoke: no request for the rapier chunk during a scripted scroll).
- Acceptance: tier 3 shows bloom on the artefact only (threshold 0.8 keeps the cubes clean); `?tier=1` runs with no environment, no dust, DPR 1; a click loads physics and 300 cubes fall and can be flicked; Reset restores the formation; effects ≤ 60 kB, physics not in any initial or core budget.

### Slice 4: posters, OG and the device pass

- Files: new `apps/web/scripts/render-posters.ts` (Playwright, 1600×1000 and 800×1200 per formation, WebP + AVIF, committed to `public/posters/`), OG route backgrounds, `<noscript>` monolith poster in `app/layout.tsx`, `?perf=1` HUD (`components/three/PerfHud.tsx`, dev + flag only), `lighthouserc.cjs` (restore LCP to `error` if the measured numbers allow), §6 table in the website spec amended, §7.1 measured column filled in this document.
- Tests: poster script produces 14 files with the expected dimensions; OG route serves the poster; `<noscript>` snapshot.
- Acceptance: all four device classes measured and within §7.1, or the shortfall recorded with the mitigation taken (DPR step-down, tier cap); the R3F tripwire (§6) evaluated and recorded.

---

## 9. Decision log

| # | Decision | Chosen | Rejected | Reason |
|---|---|---|---|---|
| D1 | Hero artefact | Procedural: displaced icosahedron + glow + two rings, in code | A sourced or modelled GLB (`3d-asset-sourcing.md` §1) | No licence work, no loader, no asset pipeline dependency (M4), deterministic, ~3 kB of code; the GLB remains the v2 upgrade path and the artefact component is the slot it drops into |
| D2 | Morph execution | GPU: A/B attribute slots, `uMix`, stagger, curl, spin in the vertex shader | Keep the CPU lerp and add stagger/noise to it | Per-instance stagger, curl noise, rotation and dust on the CPU would triple the per-frame loop and still rewrite 48 kB of matrices per frame; the spec (§4.4, §11) already chose GPU; frame cost becomes independent of N |
| D3 | R3F | Keep for slices 1–4, budget 280 kB pinned, tripwire at 300 kB | Migrate to plain three now (125–145 kB est.) | Visible work first; CSM, post and rapier are R3F-native; migrating first delays the journey a slice and would rewrite the integrations twice |
| D4 | Colour | `aColT` + palette uniform + `uBias` | Per-instance RGB buffers with change tracking | One float instead of three per slot; colour never written per frame; section bias is one uniform |
| D5 | Environment lighting | Own 5-plane lightformer scene through `PMREMGenerator.fromScene` | drei `Environment` + `Lightformer` | Same look; drei's import graph carries HDR/EXR/gain-map loaders this scene never uses (30–50 kB gz est.); the builder measures and may switch if it is under 12 kB |
| D6 | Bloom | Tier 3 only, threshold 0.8 so only the artefact glow and dust bloom | None · Bloom at every tier | The 2D painter's halo pass is part of the design language; on tier 1–2 it costs full-screen passes on the devices least able to afford them |
| D7 | Physics | Opt-in button loads rapier (~1 MB) on click; 300 bodies | Always-on physics in Craft · No physics | A megabyte the visitor did not ask for is not "proof of craft"; the cheap gravity gives the section its moment for everyone, the opt-in gives the engineer who clicks the real thing |
| D8 | Trails | Dust `Points` layer lagging the morph | Feedback render target ghosting | One extra draw call versus a full-screen pass and a persistent render target at every tier |
| D9 | Formation slots | Ping-pong two slots + `uSwap` | Rewrite both slots on every change | Each formation change writes one slot, not two; the slot holding `from` is never touched mid-morph |
| D10 | Tier instance counts | Fixed by the 2D ladder's `keep`; tier controls fidelity | §4.4's 2 000 / 6 000 / 16 000 | The formations are measured designs with fixed `n`; the ladder already thins to 45 % on modest hardware |
| D11 | Tier detection | `detect-gpu` with self-hosted benchmarks, after first frame, default T2 | Benchmarks from unpkg · Heuristics only (cores, memory) | First-party-only is a site value; `hardwareConcurrency`/`deviceMemory` already drive the ladder and cannot tell an iGPU from a discrete one |
| D12 | Damping | Existing exponential damp | `maath/easing.damp3` | Already in the code; one function; no dependency |
| D13 | DPR step-down | Own monitor sampling only during morphs | drei `PerformanceMonitor` | The demand loop is idle most of the time; a continuous-loop monitor would read it as fast and never step down |
| D14 | Camera dolly | Move the camera, recompute scalars per frame | Scale the group | Scaling the group changes perspective nothing; the dolly is the feeling of moving between rooms |
| D15 | Mount timing | After the LCP entry + idle (2 s cap) | 300 ms idle timeout (today) | The M2 perf review measured 250–550 ms of long tasks landing while LCP was still pending |
| D16 | Artefact in orbit | Returns at 0.6 scale as the core's heart | Hero only | "A team around a centre" wants a centre; one object seen twice is a motif, not a repeat |
| D17 | Attractors on touch | The card nearest the viewport centre | No attractors without hover | Phones are the first audience (spec §1.2); the moment must exist there |
| D18 | 2D ladder | Kept whole; posters added for OG and `<noscript>` only | Replace the 2D rungs with posters (§4.5 as written) | The painted canvases are the M0 design and cross-fade under WebGL; posters are static and would lose the hero's 2D breathing |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| CSM lags a three release (it patches shader chunks) | Pin `three` and CSM together in one PR; the shader test renders one frame under SwiftShader in the perf smoke, so a chunk mismatch fails CI, not production |
| Stagger + curl make a formation land late on a fast scroll | The envelope is zero at `uMix = 1`; the scroll store's bands are ±0.35 vh so the morph always completes within the band; the perf smoke's scripted scroll checks the last frame of each section is on target (reads back `uMix === 1`) |
| PMREM generation stalls the first frames on a phone | Runs one frame after the first draw; tier 1 skips it; measured in the perf smoke's long-task window |
| The artefact clearance pass drifts the 3D monolith from the 2D poster | It moves 5–7 % of interior cubes by ≤ 0.1 units; the 2D path is untouched and its snapshots are the proof; slice 4's posters are rendered from the 3D scene so OG and `<noscript>` match the live hero |
| rapier's install scripts (pnpm 9 runs lifecycle scripts) | `@dimforge/rapier3d-compat` ships prebuilt WASM with no scripts; the security review of the slice-3 PR verifies this against the registry as in M2 |
| detect-gpu misclassifies and tier 3 lands on an iGPU | DPR monitor steps down; `?tier=` override for support; the effects chunk is also dropped when the monitor steps DPR below 1.25 |

---

## 11. Open questions for the owner (defaults so nothing blocks)

1. **Artefact silhouette:** crystalline (default) or more mechanical (more rings, flatter facets)? Slice 1b ships the default; a second variant is a parameter change in `lib/assembly/artefact.ts`.
2. **The on-load assembly duration:** 1.8 s (default) reads as deliberate; 1.2 s reads as snappy. Settable in one constant.
3. **Should the artefact also appear on deep-page headers** (the brief's "compact 3D badge")? Out of scope here; noted for M3.
