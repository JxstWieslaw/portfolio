# The Model Platform: sourced and generated GLB models inside the Assembly

| | |
|---|---|
| **Owner** | Wieslaw Samushonga |
| **Date** | 2026-10-02 |
| **Status** | Proposed design, pre-implementation. Four PR-sized slices (section 9). |
| **Builds on** | [Assembly journey](2026-10-01-assembly-journey.md) section 3, 5, 6, 9 · [3D asset sourcing](../../3d-asset-sourcing.md) · [API service spec](2026-08-15-api-service-design.md) section 7 · [roadmap](../../roadmap.md) Lane B, Phase 4 · [skills assessment](../../lead/2026-10-02-skills-assessment.md) S1, S10 |
| **Revises** | Journey spec decision D1 (procedural artefact, "no GLB"): the procedural artefact stays the default and the fallback; a sourced or generated GLB becomes an optional upgrade behind the same slot. Journey non-goal "a modelled (GLB) artefact" is lifted for this platform only. |
| **Does not change** | The seven measured formations, the 2D fallback ladder, `shouldMountWebGL` (reduced motion never mounts WebGL), the 120 kB initial budget, the single persistent canvas. |

---

## 0. Summary

The site renders one persistent R3F canvas behind the page. Today its only non-cube object is the procedural artefact (`components/three/Artefact.tsx`). This spec adds a platform so that many small GLB models can be **ingested at build time, budget-checked, credited, and rendered inside that same canvas**, section by section, without touching the initial bundle and without any new runtime service.

Five moving parts:

1. **A model slot** in the scene: a per-section placement table (the chapter ledger), a residency policy of at most two loaded models, scale-in rather than alpha fades, GPU disposal, and a mixer driven by the existing priority-1 `useFrame`. No new render loop.
2. **A `models` chunk** (GLTFLoader + MeshoptDecoder, 21.5 kB gz measured) with its own `size-limit` entry. Nothing is added to the initial or core chunks beyond about 3 kB of glue.
3. **Contracts** in `packages/contracts`: licence allow-list, credit, variant, entry and manifest schemas, one budget table, one pure `selectVariant`. The shapes are what the future `GET /v1/assets/manifest?tier&caps` returns, so Phase 4 swaps the manifest source and nothing else.
4. **An ingest pipeline**: `npm run assets:ingest` turns raw sources (never committed) into hashed per-tier GLBs under `apps/web/public/models`, a committed default manifest and `content/credits.json`. `npm run assets:check` validates the committed result in CI.
5. **Animation** that fits the budgets: 0 kB DOM motion hygiene, one velocity uniform, scrubbed model clips, a CSS masked reveal. GSAP and Lenis are rejected for every route on the numbers in section 6.

What does not change for a visitor without WebGL, with reduced motion, on Save-Data, or on a tier-1 phone: the page they get today, plus, at most, a smaller model.

---

## 1. Evidence base (measured 2026-10-02 in `C:\tmp\model-platform`)

All sizes gzip -9. Loader code is measured with esbuild `--bundle --minify`, `three` external, because R3F's `import * as THREE` already puts the whole namespace (measured: 190.4 kB gz) in the core chunk. The loaders only add their own code.

| Piece | Raw | gz | Where it lives |
|---|---|---|---|
| `GLTFLoader` (+ `BufferGeometryUtils`) | 46.7 kB | **14.1 kB** | `models` chunk |
| `MeshoptDecoder` (wasm inlined as base64) | 26.5 kB | **7.3 kB** | `models` chunk |
| GLTFLoader + Meshopt together | 73.2 kB | **21.5 kB** | `models` chunk, the entry to budget |
| `KTX2Loader` (zstddec wasm inlined) | 60.1 kB | 24.3 kB | rejected for now |
| KTX2 transcoder `basis_transcoder.js` + `.wasm` | 57.5 + 527.3 kB | 15.1 + **247.5 kB** | self-hosted under `public/basis/`, fetched on first KTX2 texture only |
| `DRACOLoader` | 7.4 kB | 3.0 kB | rejected |
| Draco decoder `draco_wasm_wrapper.js` + `draco_decoder.wasm` | 58.5 + 192.4 kB | 11.7 + **63.4 kB** | would be self-hosted; fetched on first Draco mesh |
| GLTF + Meshopt + KTX2 | 133.4 kB | 45.7 kB | the "all codecs" ceiling |
| GSAP core / + ScrollTrigger / Lenis / all three | 70.7 / 115.2 / 18.6 / 133.9 kB | 27.7 / 45.3 / 5.4 / **50.3 kB** | rejected (section 6) |

Pipeline smoke (`@gltf-transform` 4.5.1 library API, `meshoptimizer` 1.3.0, `sharp` 0.35.5): a synthetic 40 000-triangle UV sphere with a 2048 px PNG, run through `dedup, flatten, join, weld, reorder, quantize, prune, textureCompress(webp, 1024 px, q80), meshopt(high)`: **2 555 200 B in, 620 832 B out, 40 000 triangles kept, and a second run produced a byte-identical file** (same sha256). So the pipeline is reproducible on one machine; cross-OS libwebp identity is not proven and is why generated assets start texture-free (section 5.4).

Install-script audit, scratch install of the five library packages: 47 packages, `hasInstallScript` false on **all** of them (lockfile scan), `npm audit` 0 vulnerabilities. Registry data: `@gltf-transform/{core,extensions,functions}` 4.5.1 MIT; `meshoptimizer` 1.3.0 MIT; `sharp` 0.35.5 Apache-2.0 (prebuilt `@img/sharp-*` optional packages, 26 platform variants in the lockfile, one installs per machine); `ktx-parse`, `draco3dgltf` no lifecycle scripts. `@gltf-transform/cli` 4.5.1 declares 20 direct dependencies (`sharp`, `draco3dgltf`, `gltf-validator`, `mikktspace`, `watlas`, `listr2`, `prompts`, `caporal` and others); a full scratch install of it did not finish inside the time box, so its transitive count is unmeasured and it is rejected on the direct count alone.

Budget headroom today (`apps/web/.size-limit.json`, skills assessment): initial JS 117.35 of 120 kB (2.65 kB free); core lazy limit 275 kB with about 12.6 kB free.

---

## 2. Decisions

| # | Decision | Chosen | Rejected | Reason, with numbers |
|---|---|---|---|---|
| M1 | Artefact default | Procedural artefact stays default and fallback; GLB is an optional upgrade behind the same slot (D1 revised) | Make GLB mandatory | The procedural path costs 0 requests; every failure of the platform (blocked asset, bad hash, slow network, WebGL loss) lands on something already designed |
| M2 | Scroll and motion libraries | No GSAP, no Lenis on any route's shared bundle | GSAP + ScrollTrigger + Lenis | 50.3 kB gz against 2.65 kB initial headroom is 19x the headroom; Lenis' inertial scroll events would also keep the demand loop rendering. See section 6 |
| M3 | Licences | `CC0-1.0`, `own`, and `CC-BY-4.0` only with a footer credit; nothing else is representable (Zod enum) | Free-text licence field | A free string cannot be gated in CI; an enum can |
| M4 | Where files live | Optimised GLBs in `apps/web/public/models` (committed, content-hashed names); raw sources in gitignored `assets-src/` | Raw sources committed; Git LFS | The repo is public and history is permanent. Rules added to D4: each GLB <= 400 kB, all tracked models <= 1.5 MB, hashed names so a changed asset is a new file and the old one is deleted from the tree (it stays in history, hence the cap) |
| M5 | Manifest | Zod schemas now in contracts, committed default manifest, read from inside the `models` chunk; API swap later | Call the API now; fetch a JSON at runtime | Roadmap Phase 4 is conditional and the API has no assets route. A JSON import inside the lazy chunk is zero initial bytes and zero extra requests. `loadManifest()` is the only seam to change |
| M6 | One canvas | Models are children of the existing rig group | A second `<Canvas>` per model | Honoured. One GL context; `gl.info.memory` is the single place to look for leaks |
| M7 | Mesh codec | Meshopt on; Draco off | Draco | Meshopt decoder 7.3 kB gz inline; Draco 75 kB gz fetch (63.4 + 11.7) to save, on a 20k-triangle model, an estimated 10 to 20 kB. Not worth 4x to 10x the decoder |
| M8 | Texture codec | WebP first (`EXT_texture_webp`, native in `GLTFLoader`); KTX2 later | KTX2 now | KTX2 costs 24.3 kB code plus a 262.7 kB transcoder fetch (self-hosted) to save VRAM: a 1024 px RGBA texture with mips is about 5.6 MB decoded, 1 to 1.4 MB as BC7/ASTC. At 1 to 2 textures per model and one resident pair, the saving is under 10 MB on devices that already hold a 3 000-cube scene in about 40 MB. Needs `toktx` (an external binary) in CI and on the owner's machine too. Revisit trigger: a tier-3 model needing a texture over 1024 px, or `gl.info.memory.textures` above 25 MB measured on a phone |
| M9 | Ingest tooling | `@gltf-transform/{core,extensions,functions}` + `meshoptimizer` + `sharp` as exact-pinned devDependencies, driven by a `tsx` script | `@gltf-transform/cli`; `gltfpack` | Library API is what the smoke test used. The CLI adds 20 direct deps for a one-line wrapper. `gltfpack` is a second toolchain with no hook into our validators |
| M10 | Integrity | `fetch(url, { integrity })` then `loader.parse(buffer)` | Hash in JS with `crypto.subtle`; trust the URL | Native SRI check, zero JS bytes. Mismatch rejects the fetch and the slot falls back to procedural. `GLTFLoader.load` cannot pass `integrity`, so the slot fetches itself |
| M11 | Frame loop | Models ride the existing `frameloop="demand"` and the 20/30 fps idle ticker | `frameloop="always"`; a per-model rAF | See 3.5 |
| M12 | Crossfade | Scale-in with the artefact's `easeOutBack`, plus bundle-level cube clearance | Alpha fade of the model | Transparent PBR meshes need sorting and a second draw per material; scale-in reuses the shipped ignition and costs nothing |
| M13 | Texture non-power-of-two | Not enforced | Keep `3d-asset-sourcing.md` rule "power of two" | WebGL2 handles NPOT with mips. The cap is on the long edge (section 4.3) |

D1 and D4 of the lead's list are amended as M1 and M4. D2, D3, D5, D6 are honoured; the numbers behind D2 are in section 6, and D5's "shaped like the API" is made concrete in section 5 because the API spec states only the URL and query, not a body.

---

## 3. Runtime: the model slot inside the persistent canvas

### 3.1 The chapter ledger (new, pure)

Today the per-section rig lives in `lib/assembly/camera.ts` (`CAMERA_RIGS`) and the pointer/idle weights in `lib/assembly/motion.ts` (`SECTION_MOTION`). Both are tested "verbatim from the spec" tables; merging them would collide with every parallel builder. A third table sits beside them and holds only what is new. Skills assessment S10 (camera target offset, key/fill) lands in the same file.

New file `apps/web/lib/assembly/chapters.ts`, no three import:

```ts
import type { FormationId } from '@/lib/formations/config'
import type { BundleKind } from '@/lib/assembly/targets'

export interface ModelPlacement {
  /** Manifest entry id, kebab-case. */
  readonly asset: string
  /** `artefact` replaces the procedural artefact (hero, orbit core); `prop` sits beside the cubes. */
  readonly role: 'artefact' | 'prop'
  /** Model units relative to the formation anchor (the monolith's units: radius 0.42 fits the column). */
  readonly position: readonly [number, number, number]
  /** World radius in model units. Ingest normalises every asset to bounding radius 1, so this is the only size knob. */
  readonly scale: number
  readonly rotation: readonly [number, number, number]
  /** rad/s about y while visible; 0 is static. */
  readonly spin: number
  /** Cubes inside this radius are moved to it by the bundle clearance pass, whether or not the GLB has loaded. */
  readonly exclusion: number
  /** Weight window on the formation's on-screen weight (0..1): model scale is 0 below `appear[0]`, full above `appear[1]`. */
  readonly appear: readonly [number, number]
  readonly clip?: { readonly name: string; readonly mode: 'scrub' | 'loop' }
}

export interface Chapter {
  /** Camera look-at offset from the origin, model units. `[0,0,0]` today's behaviour. */
  readonly target: readonly [number, number, number]
  /** Multipliers on the hemisphere + sun intensity for this section. 1 is today. */
  readonly keyBias: number
  readonly fillBias: number
  readonly model: ModelPlacement | null
}

export const CHAPTERS: Readonly<Record<FormationId, Chapter>> /* all null models and neutral values at merge */
export function chapterFor(kind: BundleKind): Chapter            // 'cloud' resolves to monolith, as camera.ts does
export function lerpChapter(a: Chapter, b: Chapter, mix: number): Pick<Chapter, 'target' | 'keyBias' | 'fillBias'>
export function modelWeight(from: BundleKind, to: BundleKind, mix: number, formation: FormationId): number // same shape as motion.ts scatterWeight
export function modelScale(weight: number, appear: readonly [number, number]): number                      // 0 below appear[0], easeOutBack up to appear[1]
```

At merge of the runtime slice every `model` is `null`, so no pixel changes. The integration slice fills rows. `target` and the bias values default to neutral so the ledger can ship before S10's art direction.

Artefact semantics: `role: 'artefact'` with a loaded model drives `artefact.group.scale` to 0 and the model to `modelScale(...)`; if the model is absent or failed, nothing changes. The existing rule stands: never toggle `visible` on a group that holds a light, scale it (journey spec, M2 learnings).

### 3.2 Residency, mount, unmount

New `apps/web/components/three/models/ModelSlot.ts` (imports three) and `ModelLoader.ts` (the only importer of `GLTFLoader` and `MeshoptDecoder`), the latter loaded with `import()` the first time `shouldLoadModels` says yes.

- **Wanted set** per frame is the `asset` of the placements of `from` and `to` whose `modelWeight > 0`. At most 2. A third asset is never resident.
- **Load**: when a wanted asset is not resident, `fetch(variant.url, { integrity, priority: 'low' })`, `arrayBuffer`, `loader.parse`, normalise materials (`envMapIntensity 0.8`, `toneMapped true`), then `await gl.compileAsync(group, camera)`, then add to the rig group. A model never reaches the scene before its programs have linked, same rule as the rest of the scene.
- **Prefetch one ahead**: while the visitor is settled in section k (`settledFormation`), `requestIdleCallback` (2 s timeout) fetches the asset of the next formation with a placement. Bytes only, no parse, into a `Map<url, Promise<ArrayBuffer>>` cache.
- **Evict**: an asset leaves the wanted set, waits 2 s (hysteresis against scroll jitter), then `disposeModel`.
- **Failure**: one failed or rejected-integrity fetch marks the asset failed for the session (no retry loop), sets `document.documentElement.dataset.modelsFailed` to the count, logs a `console.warn` once, and the procedural artefact or nothing remains. Never an exception into the error boundary.

Disposal (`apps/web/lib/models/dispose.ts` is pure over a minimal interface so a unit test can use fakes): traverse the model, `geometry.dispose()`, every material, every texture map (`texture.dispose()`; close `ImageBitmap`-backed `texture.source.data` when it has `close`), `skeleton.dispose()` for skinned meshes, `mixer.stopAllAction()` and `mixer.uncacheRoot(root)`, remove from parent. `html[data-models]` holds the current resident count so an e2e test can assert disposal, and the dev log prints `gl.info.memory` after each eviction.

Context loss: the slot keeps its CPU-side objects across a loss. The existing restore path already re-runs `compileAsync`; three re-uploads buffers and textures on the next render. A second loss gives up for the session as today and takes the slot with it.

### 3.3 Crossfade and occlusion against the cubes

- **No alpha**. The model scales in over its `appear` window of the formation weight with `easeOutBack` (the artefact's ignition curve), and out symmetrically. At weight 0 scale is exactly 0, so it costs vertex work only while visible; set `frustumCulled` and skip `updateMatrixWorld` when scale is 0.
- **Cubes make room at the bundle level**. `clearArtefact` in `lib/assembly/targets.ts` (line 332) already moves interior cubes out to a radius in the bundle, once, never in the generator, so the 2D painter stays byte-identical. The runtime slice generalises it to `clearSphere(bundle, centre, radius)` (the old name stays as a thin wrapper) and calls it for every formation whose chapter has `exclusion > 0`. The exclusion belongs to the formation, not to the load state: the procedural artefact, the GLB and the failure case all see the same hole, so nothing pops when a model arrives late.
- **Light bias**: `keyBias` and `fillBias` multiply the existing hemisphere and sun intensities, lerped by the scroll mix and damped at `CAMERA_DAMP`. The artefact's point light stays driven by the artefact.

### 3.4 Gating (pure, `apps/web/lib/models/gate.ts`)

```ts
export interface ModelGateInputs {
  readonly rung: FallbackRung            // from lib/formations/fallback.ts
  readonly glLive: boolean               // html[data-gl="live"] has been set
  readonly tier: 1 | 2 | 3
  readonly saveData: boolean             // navigator.connection?.saveData === true
  readonly effectiveType: string | undefined
  readonly noModels: boolean             // ?nomodels=1
}
export function shouldLoadModels(i: ModelGateInputs): boolean
export function variantTier(i: ModelGateInputs): 1 | 2 | 3 | null
```

Rules, in order: no `glLive` or `noModels` -> `false`. `reduced-motion` rung -> `false` (cannot occur because WebGL never mounts, asserted anyway). `saveData` or `effectiveType` in `slow-2g | 2g` -> `false`. `effectiveType === '3g'` -> tier capped at 1. `reduced-instances` rung -> tier capped at 1. Otherwise the detected tier. Until journey slice 3's `tier.ts` (detect-gpu) lands, the tier is `1` for `reduced-instances`, `2` for `live`, overridable by `?tier=`, with `readTier()` as the single seam. Reduced motion never mounts WebGL, so the model platform is inert there by construction, not by an extra check.

### 3.5 Frame loop and animation clips

The scene's frame loop is `demand`. R3F renders on `invalidate`; scroll, pointer, resize, attractors and a 30 fps (20 on touch) idle ticker invalidate (`AssemblyCanvas.tsx`, the `setInterval` ticker and the priority-1 `useFrame`). GLTF clips need time to advance, and there are three ways to get it:

1. `frameloop="always"`: rejected. 60 fps on every section on every device for a decorative layer, against the 30/20 fps design the perf review set.
2. A per-model rAF: rejected. A second clock that has to be paused for `document.hidden`, opacity 0 and context loss, all of which the ticker already handles.
3. **Chosen**: one `AnimationMixer` per resident model, updated inside the existing priority-1 `useFrame` with the real `dt` (clamped to 0.1 as today). Two modes:
   - `scrub`: `action.time = progress * clip.seconds` where `progress` is the model's formation weight, then `mixer.update(0)`. Deterministic, needs no ticker, and is a pure function of scroll, so it is testable. Default.
   - `loop`: `mixer.update(dt)` only when the formation is settled (`settledFormation`) and `weight > 0.5`. It advances at the ticker rate (20 or 30 fps) using real `dt`, so speed is correct and sampling is coarse, which is right for ambient motion. Nothing runs under `document.hidden` or at opacity 0 because the frame body already returns early.

Cost of the mixer is nil in the bundle: R3F's namespace import already carries `AnimationMixer` and `SkinnedMesh`.

### 3.6 Tier and budget table (per variant; enforced by `assets:check` and mirrored in contracts as `MODEL_BUDGETS`)

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Max bytes per GLB | 70 kB | 180 kB | 400 kB |
| Max triangles | 6 000 | 20 000 | 50 000 (the existing hero limit in 3d-asset-sourcing) |
| Max texture long edge | 512 px | 1 024 px | 2 048 px, at most one |
| Max textures / materials | 1 / 1 | 2 / 2 | 2 / 2 |
| Allowed extra glTF extensions | none | none | `KHR_materials_transmission`, `KHR_materials_volume`, `KHR_materials_ior` (the journey's tier-3 transmissive artefact) |
| Clips | `scrub` only, <= 1 | <= 2 | <= 2 |
| Resident at once | 2 | 2 | 2 |
| Decoded GPU memory per model (estimate, hand-checked) | <= 4 MB | <= 12 MB | <= 30 MB |

Repo hygiene across all tiers: each tracked GLB <= 400 kB, **all** tracked models <= 1.5 MB.

Network: a tier-2 hero is <= 180 kB plus the 21.5 kB `models` chunk, fetched after `data-gl="live"`, `priority: low`, so it never competes with LCP (journey spec D15 keeps the mount behind the LCP entry).

### 3.7 Delivery headers

Files in `public/` are served by Next with a revalidating `Cache-Control` by default (to be confirmed against the installed Next 15.5 in the PR). Hashed filenames make `public, max-age=31536000, immutable` safe, so the runtime slice adds a `headers()` entry in `next.config.ts` for `/models/:path*`. `manifest.json` itself is not served (it is imported into the chunk), so there is no stale-manifest case.

---

## 4. Loader chunk and size budgets

### 4.1 The `models` chunk

`ModelLoader.ts` is the only static importer of `three/examples/jsm/loaders/GLTFLoader.js` and `three/examples/jsm/libs/meshopt_decoder.module.js`, reached only through `import('./models/ModelLoader')` from `ModelSlot`. Measured payload: 21.5 kB gz. Plus the manifest JSON (about 1 kB per entry) and about 1 kB of glue.

### 4.2 `size-limit`

Three entries change; the others keep their numbers.

| Entry | Limit | Note |
|---|---|---|
| initial JS (non-3D) | 120 kB | unchanged, nothing here may land in it |
| assembly core | 275 kB, **excluding the models chunk** | glue (`chapters.ts`, `gate.ts`, `ModelSlot.ts`, `dispose.ts`) is about 3 kB against 12.6 kB headroom; the PR pins at measured + 5 % |
| **assembly models (loader + manifest)** | **26 kB** (21.5 kB measured loaders + manifest + glue, then pinned at measured + 5 %) | new |

The risk is identification: the core entry's glob is `.next/static/chunks/*.*.js` minus two page-router chunk ids, so a new async chunk would be counted in the core. The runtime PR names the chunk through a `splitChunks.cacheGroups.models` entry in the existing `webpack` hook of `next.config.ts` (`chunks: 'async'`, `test` on `components/three/models` and the two three/examples paths, `enforce: true`), runs `npm run build && npm run size -w @repo/web -- --json`, and adds the emitted file pattern to the core entry's exclusions and to the new entry's path. If Next ignores the name for this chunk (the repo card records it ignoring `webpackChunkName`), the fallback is to read the chunk file from `.next/react-loadable-manifest.json` in a tiny `.size-limit.mjs` that builds the config. Either way the acceptance check is the same: the two entries report disjoint files whose sum equals the previous core number plus the models number.

Not budgeted now, listed so growth is visible: KTX2 transcoder (262.7 kB gz, only if M8's trigger fires; its own entry and its own `public/basis/` files).

---

## 5. Types, manifest, credits, ingest

### 5.1 Contracts (`packages/contracts/src/models.ts`, exported from `index.ts`)

Zod 3 (the repo's `zod ^3.24`). `slugSchema` and `formationIdSchema` already exist in `content.ts`.

```ts
import { z } from 'zod'
import { formationIdSchema, slugSchema } from './content.js'

/** The only licences the site can represent. Adding one is a reviewed code change. */
export const licenceSchema = z.enum(['CC0-1.0', 'CC-BY-4.0', 'own'])
export type Licence = z.infer<typeof licenceSchema>
export const LICENCES_REQUIRING_CREDIT: readonly Licence[] = ['CC-BY-4.0']

// https only: z.string().url() alone accepts javascript: (security audit 2026-10-01).
const httpsUrl = z.string().url().refine((u) => u.startsWith('https://'), 'must be an https URL')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const modelTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type ModelTier = z.infer<typeof modelTierSchema>

/** What the client can decode. `ktx2` is reserved: no loader ships for it yet. */
export const modelCapSchema = z.enum(['meshopt', 'webp', 'ktx2'])
export type ModelCap = z.infer<typeof modelCapSchema>

export const gltfExtensionSchema = z.enum([
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'EXT_texture_webp',
  'KHR_texture_transform',
  'KHR_materials_emissive_strength',
  'KHR_materials_transmission',
  'KHR_materials_volume',
  'KHR_materials_ior',
])

export const creditSchema = z
  .object({
    assetId: slugSchema,
    title: z.string().min(1).max(120),
    author: z.string().min(1).max(120),
    sourceUrl: httpsUrl,
    licence: licenceSchema,
    licenceUrl: httpsUrl.optional(),
    retrievedAt: isoDate,
  })
  .superRefine((c, ctx) => {
    if (LICENCES_REQUIRING_CREDIT.includes(c.licence) && !c.licenceUrl)
      ctx.addIssue({ code: 'custom', path: ['licenceUrl'], message: 'CC-BY requires a licenceUrl' })
  })
export type Credit = z.infer<typeof creditSchema>

export const MODEL_BUDGETS = {
  1: { bytes: 70_000, triangles: 6_000, texturePx: 512, textures: 1, materials: 1, clips: 1, gpuMb: 4 },
  2: { bytes: 180_000, triangles: 20_000, texturePx: 1_024, textures: 2, materials: 2, clips: 2, gpuMb: 12 },
  3: { bytes: 400_000, triangles: 50_000, texturePx: 2_048, textures: 2, materials: 2, clips: 2, gpuMb: 30 },
} as const satisfies Record<ModelTier, Record<string, number>>
export const MODEL_REPO_BYTES = 1_500_000
export const MODEL_FILE_BYTES = 400_000

export const modelVariantSchema = z.object({
  tier: modelTierSchema,
  /** Codecs the client must support to use this variant. */
  requires: z.array(modelCapSchema).default([]),
  /** Same-origin committed path, or an https URL once the API serves it. */
  url: z.union([z.string().regex(/^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.t[123]\.[0-9a-f]{8}\.glb$/), httpsUrl]),
  bytes: z.number().int().positive().max(MODEL_FILE_BYTES),
  triangles: z.number().int().positive(),
  maxTexturePx: z.number().int().nonnegative(),
  /** Subresource-Integrity string, passed to `fetch({ integrity })`. */
  integrity: z.string().regex(/^sha256-[A-Za-z0-9+/]{43}=$/),
  extensions: z.array(gltfExtensionSchema).default([]),
})
export type ModelVariant = z.infer<typeof modelVariantSchema>

export const modelEntrySchema = z
  .object({
    id: slugSchema,
    title: z.string().min(1).max(120),
    kind: z.enum(['hero', 'prop']),
    /** `false` keeps the files and credits but the ledger never loads it. The rollback switch. */
    enabled: z.boolean(),
    /** Always 1 for ingest output (normalised); stored so a future transcoder can differ. */
    boundsRadius: z.number().positive(),
    clips: z.array(z.object({ name: slugSchema, seconds: z.number().positive().max(20) })).max(2).default([]),
    variants: z.array(modelVariantSchema).min(1),
  })
  .superRefine((e, ctx) => {
    const seen = new Set<string>()
    for (const v of e.variants) {
      const key = `${v.tier}:${[...v.requires].sort().join(',')}`
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants'], message: `duplicate variant ${key}` })
      seen.add(key)
    }
  })
export type ModelEntry = z.infer<typeof modelEntrySchema>

/** The body of GET /v1/assets/manifest?tier&caps, and of the committed default manifest. */
export const modelManifestSchema = z.object({
  version: z.literal(1),
  /** sha256 over the canonical JSON of `models`, first 16 hex. No timestamps: ingest output must be reproducible. */
  contentHash: z.string().regex(/^[0-9a-f]{16}$/),
  models: z.array(modelEntrySchema),
})
export type ModelManifest = z.infer<typeof modelManifestSchema>

export const creditsFileSchema = z.array(creditSchema)

/** Highest tier <= `tier` whose `requires` the client satisfies; `null` means "stay procedural". Pure; the API will reuse it. */
export function selectVariant(entry: ModelEntry, tier: ModelTier, caps: ReadonlySet<ModelCap>): ModelVariant | null
```

`selectVariant` is the one function with logic; it is specified by its test (section 8). The runtime imports the contracts **types only** (no Zod in the client bundle): validation happens in `assets:check` and in tests; the JSON import is cast through the inferred type.

### 5.2 Files and ownership

| Path | Committed | Purpose |
|---|---|---|
| `assets-src/<id>/...` | no (gitignored) | raw downloads and a `SOURCE.txt` the owner pastes the licence page text into |
| `content/models/sources.json` | yes | hand-authored registry (below) |
| `apps/web/public/models/<id>.t<tier>.<hash8>.glb` | yes | optimised output, `hash8` = first 8 hex of the sha256 |
| `apps/web/public/models/manifest.json` | yes, generated | the default manifest (`modelManifestSchema`) |
| `content/credits.json` | yes, generated | credits of every **enabled** entry, in manifest order |

`sources.json` entry (schema lives in `apps/web/scripts/assets/sources.ts`, not in contracts, because only the script reads it):

```ts
{ id, title, kind, enabled,
  origin: { type: 'file', path: 'assets-src/<id>/model.glb', sha256: '<64 hex of the raw file>' }
        | { type: 'generated', generator: 'gyroscope' },
  credit: { author, sourceUrl, licence, licenceUrl?, retrievedAt },
  clips?: [{ from: '<clip name in the source>', as: 'idle' }],
  tiers?: [1, 2, 3] }          // default all three
```

The raw sha256 pins the unseen input: a changed download fails ingest unless `--accept-source-change` is passed.

### 5.3 Ingest pipeline

Tooling: `apps/web/scripts/assets/{ingest.ts,check.ts,pipeline.ts,validators.ts,sources.ts,generators/}` run by `tsx` (already a devDependency). New **exact-pinned** devDependencies in `apps/web`: `@gltf-transform/core@4.5.1`, `@gltf-transform/extensions@4.5.1`, `@gltf-transform/functions@4.5.1`, `meshoptimizer@1.3.0`, `sharp@0.35.5`. Each PR line records: MIT/MIT/MIT/MIT/Apache-2.0, no lifecycle scripts (lockfile `hasInstallScript` scan: none), 47 packages in scratch, `npm audit` clean on 2026-10-02. CI already runs `npm audit signatures`, which covers the new packages. Not added: `@gltf-transform/cli` (20 direct deps), `gltf-validator` (latest tag is the pre-release `2.0.0-dev.3.10`; revisit when it publishes a stable 2.0), `gltfpack`, `ktx-parse` directly, `draco3dgltf`, `toktx`.

CLI (root scripts delegate to `@repo/web`):

```
npm run assets:ingest                          # all enabled and disabled sources, rewrite outputs, manifest, credits
npm run assets:ingest -- --id core-crystal     # one source
npm run assets:ingest -- --only generated      # sources with origin.type 'generated' (CI-safe: no raw input needed)
npm run assets:ingest -- --verify              # run into a temp dir, fail if any output hash differs from the committed one
npm run assets:ingest -- --dry-run             # print the report, write nothing
npm run assets:ingest -- --accept-source-change
npm run assets:check                           # validate the committed result; no raw input; exit 1 on any violation
```

Per source, per tier `t` in `tiers`:

1. Load: `NodeIO` with `EXTMeshoptCompression`, `EXTTextureWebP`, `KHRMeshQuantization` registered (the smoke test's setup). Generated sources build a `Document` in code.
2. Hash the raw file; compare to `origin.sha256`.
3. Strip: cameras, lights, extras, unused data; keep only the clips named in `clips`; reject sources with more than two materials, any skin without a declared clip, or any extension outside the allow-list for that tier.
4. Normalise: `center`, then scale the root node so the bounding radius is exactly 1 (so the ledger's `scale` is the only size knob). This replaces the "1 unit = 1 m, fits a 1 m cube" rule of `3d-asset-sourcing.md` section 3, which assumed hand-made input.
5. Reduce: `dedup, flatten, weld`, `join` only when the document has no animation or skin, `simplify` (MeshoptSimplifier, error 0.001, ratio = `min(1, budget.triangles / triangles)`), `reorder`, `quantize`, `prune`.
6. Textures: `textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: 80 })` with `px = MODEL_BUDGETS[t].texturePx`; never up-scales.
7. `meshopt({ encoder: MeshoptEncoder, level: 'high' })`; write; read it back and build a `GlbReport`.
8. Validate the report (section 5.4); any violation aborts that source and nothing is written for it.
9. Write `<id>.t<t>.<hash8>.glb`, delete stale files for the id, then write `manifest.json` and `credits.json` canonically (sorted keys and entries, LF, trailing newline).

Reproducibility: every step is deterministic on one machine (the smoke test: identical sha256 over two runs); `--verify` is the proof and runs in CI for `generated` sources. Generated sources start **texture-free**, so their bytes do not depend on libwebp builds across Windows and Linux. Raw-file sources are verified locally by the owner or builder only, because CI has no raw input; CI instead proves the committed outputs are internally consistent (5.4).

Generators (`scripts/assets/generators/*.ts`): small, seeded geometry builders with `@gltf-transform/core` (the repo's `createRng`/`seedFor` is app code and is not imported; the generators take a seed constant). They give the owner licence-free "own" assets on day one and keep D3 trivially true.

### 5.4 Validators (`validators.ts`, pure over a `GlbReport`, shared by ingest and check)

| Code | Rule |
|---|---|
| `LICENCE` | `licence` is in the enum; CC-BY has `licenceUrl`; `credit.sourceUrl` is https; an enabled entry has a matching row in `credits.json` and the file equals the derived one |
| `BYTES` | file bytes <= `MODEL_BUDGETS[tier].bytes`, <= `MODEL_FILE_BYTES`; sum over all tracked models <= `MODEL_REPO_BYTES` |
| `TRIS` | triangle count <= tier budget |
| `TEXTURE` | each texture long edge <= tier cap; count <= tier cap; MIME is `image/webp` (or none) until M8's trigger |
| `MATERIALS` | count <= tier cap |
| `EXTENSIONS` | `extensionsUsed` is a subset of the tier's allow-list (the table in 3.6) |
| `CLIPS` | <= tier cap, each <= 20 s, names kebab-case, present in the manifest entry |
| `NAMING` | file matches `^[a-z0-9]+(-[a-z0-9]+)*\.t[123]\.[0-9a-f]{8}\.glb$`; id is kebab-case; no node, mesh or material name contains a space |
| `HASH` | sha256 of the file bytes equals `integrity` and its first 8 hex equal the filename suffix |
| `ORPHAN` | no file in `public/models` that the manifest does not reference; no manifest URL without a file |
| `SCHEMA` | `manifest.json` and `credits.json` parse with the Zod schemas; `contentHash` recomputes |
| `COMPLETE` | an `enabled` entry has a variant for every tier in its source's `tiers` |

### 5.5 CI hook

In `.github/workflows/ci.yml`, job `verify`, after `npm run test` and before `lint:content`:

```yaml
      - name: Validate 3D assets
        run: |
          npm run assets:check
          npm run assets:ingest -- --only generated --verify
```

`budgets` and `e2e` need no change: `size` picks up the new entry, Playwright picks up the new spec. `assets:check` is fast (no build); the `--verify` run only touches generated sources.

### 5.6 Where credits render

`components/layout/Footer.tsx` (server component) takes a `credits` prop with the default read from `content/credits.json` through `lib/content.ts`, which already owns JSON access ("sections never import this module"; same rule: the page passes them in). Under the colophon paragraph, one line per credit: `Model "<title>" by <author>, <licence label>`, the source as a link (`rel="noopener noreferrer"`, `target="_blank"`), CC0 and `own` entries included for good practice (the sourcing guide's checklist), CC-BY ones mandatory. Only `enabled` entries appear. The colophon sentence ("The backdrop is a 2D canvas...") is stale since #22 and is rewritten in the same PR, by the owner's wording.

---

## 6. Animation

Ranked by value over cost, using the skills assessment's S1 and S10 and this platform:

| # | What | How | Cost | Slice |
|---|---|---|---|---|
| A1 | Motion hygiene (S1): reveal stagger by observer batch capped at about 3 steps, Nav height as a transform, hover motion behind `@media (hover: hover)`, BottomSheet enter 560 to 320 ms | Edits in `Reveal.tsx`, `Nav.tsx`, `BottomSheet.tsx`, `globals.css`; CSS tokens only (`--d-*`, `--ease`) | 0 kB | P3a |
| A2 | Scroll-velocity response (S10): a damped `uVelocity` uniform stretches cube scale along the travel axis by `1 + 0.35 * |v|` and lags the swirl, so scroll speed is felt in the world | One uniform in `AssemblyMaterial.ts`, about 10 lines of GLSL in `assembly.glsl.ts`, one damped scalar in `AssemblyCanvas.tsx` | about 0.3 kB, in core | P3b |
| A3 | Model scrub clips: a model's idle pose is a function of the section's weight, so the section's object is "assembled" by scrolling it | `ModelPlacement.clip.mode: 'scrub'` (3.5) | 0 kB beyond the runtime slice | P4 data |
| A4 | Masked line reveal for section headings | Plain CSS `clip-path`/`mask` with `animation-timeline: view()` inside `@supports`, falling back to the visible final state (markup ships visible; this site's rule) | 0 kB JS | P3a |
| A5 | Chapter camera target and key/fill bias (S10) | Data in `CHAPTERS`, applied by the runtime slice | 0 kB beyond the slice | P2 + P4 |

Not adding: bloom or post at tier 1 and 2 (journey D6), custom cursor, magnetic buttons, KPI count-up (assessment: negative value), a second scroll-linked system for the DOM.

**Verdict on GSAP and Lenis, any route.** Measured today: GSAP core 27.7 kB, GSAP + ScrollTrigger 45.3 kB, Lenis 5.4 kB, all three 50.3 kB gz. Against the home route's 2.65 kB initial headroom the three are 19 times over, and even Lenis alone is twice it. Beyond bytes: `resolveScroll` already maps scroll to state, Lenis' smoothed scroll fires scroll events on every inertial frame which defeats the demand loop's idle, and ScrollTrigger pre-hide patterns contradict "markup ships visible". Verdict: **no GSAP, no Lenis in any shared or layout chunk, and none on the home route.** For a future route that is its own lazy chunk with its own `size-limit` entry (the Lab, already carrying rapier at about 1 MB on click), GSAP core alone (27.7 kB) may be proposed in that route's spec with that entry; it is not pre-approved here. Native CSS scroll-driven animations plus the repo's scroll store cover this site's motion at 0 kB.

---

## 7. Fallback ladder and tests

### 7.1 What each visitor sees

| Visitor | WebGL | Models | Sees |
|---|---|---|---|
| No WebGL2, `?nogl=1`, JS blocked at the layer | not mounted | none, no request to `/models/`, no `models` chunk | the shipped 2D site, byte-identical |
| `prefers-reduced-motion` | **never mounted** (`shouldMountWebGL`, unchanged) | none | the static 2D frame |
| Save-Data, `2g`/`slow-2g` | mounted | none | cubes plus the procedural artefact |
| `3g` or `reduced-instances` rung (tier 1) | mounted | tier-1 variants only (<= 70 kB, <= 6 k tris) | cubes plus a small model |
| Tier 2, default | mounted | tier-2 variants (<= 180 kB) | the full journey |
| Tier 3 | mounted | tier-3 variants (<= 400 kB) | the full journey, transmissive extras allowed |
| Model fetch fails, integrity mismatch, parse error, `compileAsync` rejects | mounted | none for that asset, `data-models-failed` set | procedural artefact or nothing, no error boundary trip |
| Context lost twice | gives up | disposed with the scene | 2D site |

### 7.2 Unit tests (vitest, next to the code per repo convention under `apps/web/tests/unit/` and `packages/contracts/src/`)

- `models.test.ts` (contracts): enum rejects `CC-BY-NC-4.0`; CC-BY without `licenceUrl` fails; `javascript:` and `http:` URLs fail; bad integrity string fails; duplicate tier/requires fails; `selectVariant` table (tier 3 asked and only tier 2 exists returns tier 2; `requires ktx2` with caps `{meshopt, webp}` skipped; none match returns `null`; `enabled` is the caller's concern, not the function's).
- `assets-validators.test.ts`: one case per code in 5.4 with a fabricated `GlbReport`.
- `assets-pipeline.test.ts`: builds a 5 000-triangle generated document, runs the pipeline, asserts bounds radius 1, triangles <= tier budget, extensions subset, and that two runs give the same sha256 (the smoke test, pinned).
- `assets-check.test.ts`: the committed manifest passes `check`; mutating a byte of a committed GLB in a temp copy yields `HASH`.
- `assembly-chapters.test.ts`: ledger covers all `FormationId`; `modelWeight` equals `scatterWeight`'s shape for a given formation; `modelScale` is 0 below `appear[0]`, 1 above `appear[1]`, monotonic.
- `models-gate.test.ts`: the section 3.4 rules as a truth table, including `reduced-motion` and `3g`.
- `models-dispose.test.ts`: fakes with `dispose` spies; every geometry, material, texture, skeleton and the mixer is disposed exactly once.
- `models-residency.test.ts`: pure residency planner (wanted set, grace period, cap of 2, failed assets never retried).
- Existing: `assembly-targets.test.ts` gains the `clearSphere` cases and a "formation outputs unchanged when `exclusion` is 0" snapshot; `assembly-journey.test.ts` and `assembly-capabilities.test.ts` stay untouched and green (the contract that reduced motion never mounts).

### 7.3 E2E smoke (`apps/web/tests/e2e/models.spec.ts`, Chromium `--use-angle=swiftshader`, as the perf smoke)

1. `?nomodels=1`: no request matching `/models/` and no models chunk during a full scripted scroll.
2. `?nogl=1`, and a context with `reducedMotion: 'reduce'`: same, plus `data-gl` never `live`.
3. Default with the fixture manifest enabled (a 2 kB generated cube GLB served by `page.route` from `tests/fixtures/`, so e2e never depends on a shipped model): scroll to its section, `html[data-models]` reaches `1`; the response bytes are within `MODEL_BUDGETS[2]`; scroll away, `data-models` returns to `0` within 3 s.
4. Abort the GLB request: page stays up, `data-models-failed="1"`, no `pageerror`, procedural artefact still renders (`data-gl="live"` holds).
5. Fulfil the GLB with one flipped byte: same as 4 (integrity rejected).
6. The existing `a11y.spec.ts` and the `?nogl=1` visual snapshots must pass unchanged; the footer credit list adds an `axe` check for link names.

Existing gates stay: typecheck, lint, vitest, `size`, `lighthouse` (LCP stays `warn`; models mount after `live`, so this spec adds nothing to LCP).

---

## 8. Phased rollout, acceptance, rollback

| Phase | Slice | Acceptance (all must hold) | Rollback |
|---|---|---|---|
| 0 | This spec, plus the measurements in section 1 | Spec committed; owner confirms the amended D1 and D4 | Revert the doc |
| 1 | P1 platform contracts and ingest | `assets:check` green on an empty manifest; one generated entry round-trips through `assets:ingest --verify` with identical hashes; `typecheck`, `lint`, `test` green; no new runtime import; `package-lock` diff reviewed (47 packages, no install scripts) | Revert the PR; nothing in the app imports it |
| 2a | P2 runtime slot, all ledger models `null` | No pixel change on any snapshot; `size`: initial unchanged, core <= 275 kB, models entry reports the measured number <= 26 kB; e2e 1, 2, 4, 5 green with the fixture; `data-models` returns to 0 after leaving a section | Revert; or `?nomodels=1` and an empty ledger |
| 2b | P3a DOM motion, P3b velocity uniform | S1 items done with 0 kB (initial JS delta <= 0.2 kB); velocity at rest reads 0 and adds no per-frame buffer writes; reduced-motion snapshots unchanged | Revert per PR; P3b is one uniform |
| 3 | P4 model integration | The owner's picks ingested; every placement in the ledger; credits in the footer; per-section tier budgets hold on the four device classes of the journey spec 7.1 (hand-measured, recorded); `assets:check` green | Set `enabled: false` in `sources.json`, `assets:ingest`, deploy (files and credits stay, nothing loads); or revert the PR |
| 4 | Phase 4 API manifest (later, conditional) | `GET /v1/assets/manifest?tier&caps` returns `modelManifestSchema`; client calls it once after hydration, falls back to the committed manifest when offline | Remove the call; the committed manifest is already the fallback |

---

## 9. Slices and exact file lists

Four PRs, each one concern, each targeting `develop`. P1 and P3a run in parallel; P2 starts after P1's contracts merge (it type-imports them); P3b and P4 start after P2 because both edit files P2 owns.

### P1: platform contracts and ingest (`feat(web): models can be ingested, budget-checked and credited`)

- New: `packages/contracts/src/models.ts`, `packages/contracts/src/models.test.ts`
- Edit: `packages/contracts/src/index.ts` (one export line)
- New: `apps/web/scripts/assets/ingest.ts`, `check.ts`, `pipeline.ts`, `validators.ts`, `sources.ts`, `generators/gyroscope.ts` (one tiny generator to exercise the path)- New: `content/models/sources.json` (the gyroscope generated entry only, `enabled: false`), `apps/web/public/models/manifest.json` (generated; the gyroscope's files exist but nothing loads them), `content/credits.json` (empty array, because nothing is enabled)
- New tests: `apps/web/tests/unit/assets-validators.test.ts`, `assets-pipeline.test.ts`, `assets-check.test.ts`
- Edit: `apps/web/package.json` (scripts `assets:ingest`, `assets:check`; the five exact devDependencies), root `package.json` (two passthrough scripts), `package-lock.json`, `.gitignore` (`assets-src/`), `.github/workflows/ci.yml` (step in 5.5)
- Budget numbers it must hold: initial 120 kB and core 275 kB unchanged (no runtime import); tracked models <= 1.5 MB; gyroscope tiers inside `MODEL_BUDGETS`.

### P2: runtime slot (`feat(web): the Assembly can host a model per section`)

- New: `apps/web/lib/assembly/chapters.ts`, `apps/web/lib/models/{gate.ts,dispose.ts,residency.ts,manifest.ts}` (`manifest.ts` is `loadManifest()` reading `public/models/manifest.json`, the Phase 4 seam), `apps/web/components/three/models/{ModelSlot.ts,ModelLoader.ts}`
- Edit: `apps/web/components/three/AssemblyCanvas.tsx` (create the slot with the rig, wanted set and mixer in the priority-1 `useFrame`, `data-models` and `data-models-failed`, dispose in `rig.dispose()`), `apps/web/lib/assembly/targets.ts` (`clearSphere`, `clearArtefact` kept as a wrapper), `apps/web/next.config.ts` (`models` cache group, immutable headers for `/models/:path*`), `apps/web/.size-limit.json` (core exclusion, new entry)
- New tests: `assembly-chapters.test.ts`, `models-gate.test.ts`, `models-dispose.test.ts`, `models-residency.test.ts`; extend `assembly-targets.test.ts`
- New e2e: `apps/web/tests/e2e/models.spec.ts`, `apps/web/tests/fixtures/cube.glb` (generated by a script test helper; 2 kB)
- Budget numbers: initial unchanged; core <= 275 kB with glue <= 3 kB; models entry pinned at measured + 5 % (about 21.5 kB loaders + manifest, ceiling 26 kB); no frame-loop change at rest (idle ticker rate unchanged); a leave-and-return loop leaves `gl.info.memory` geometries and textures at baseline.

### P3a: DOM motion hygiene and CSS reveal (`feat(web): motion settles faster and respects hover devices`)

- Edit: `apps/web/components/ui/Reveal.tsx`, `apps/web/components/layout/Nav.tsx`, `apps/web/components/layout/BottomSheet.tsx` (confirm path in the PR), `apps/web/app/globals.css`
- Edit tests: `reveal.test.tsx`, `nav.test.tsx`
- Budget numbers: initial JS delta <= 0.2 kB; no layout shift introduced; hover rules gated on `(hover: hover)`; reduced-motion snapshots unchanged.

### P3b: scroll-velocity response (`feat(web): scroll speed changes how the cubes move`) after P2

- Edit: `apps/web/components/three/AssemblyMaterial.ts`, `apps/web/components/three/assembly.glsl.ts`, `apps/web/components/three/AssemblyCanvas.tsx` (one damped scalar; rebase on P2), `apps/web/lib/assembly/motion.ts` (the pure `velocityWeight` function)
- New/extend tests: `assembly-set-pieces.test.ts` (velocity 0 at rest, clamped, symmetric)
- Budget numbers: core grows <= 0.5 kB; zero per-instance writes per frame.

### P4: model integration (`feat(web): sourced models join the journey with credits`) after P2

- Owner decision first (section 11): which assets. The builder shortlists, the owner picks.
- New/edit: `content/models/sources.json` (entries), `apps/web/public/models/*.glb` and `manifest.json` (regenerated), `content/credits.json` (regenerated), `apps/web/lib/assembly/chapters.ts` (placement rows, camera `target`, light bias values), `apps/web/components/layout/Footer.tsx`, `apps/web/lib/content.ts` (credits access), `apps/web/tests/unit/footer.test.tsx`
- Not touched: anything in P2's runtime files other than the data rows in `chapters.ts`.
- Budget numbers: every variant inside `MODEL_BUDGETS`; tracked models <= 1.5 MB; per-section frame time inside the journey spec 7.1 targets on the device class table (hand-measured).

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| The `models` chunk lands in the core budget glob | The runtime PR proves disjoint entries with `size-limit --json` (section 4.2) before it merges |
| Public-repo history grows with every re-ingest | Hash-named files, 400 kB per file, 1.5 MB total, `ORPHAN` and `BYTES` in CI |
| `sharp`'s libwebp output differs between Windows and Linux | Generated sources start texture-free; raw-source textures are not re-verified in CI; `assets:check` proves hashes of committed bytes, not reproducibility |
| A CC-BY model ships without a credit | `LICENCE` validator fails CI when an enabled entry has no matching credit row; Footer test asserts the line |
| Model art does not match the cubes' look | Placement is data (`CHAPTERS`) and `enabled: false` is a one-line rollback; the procedural artefact is always the fallback |
| `fetch` `priority` option and `integrity` support differ across browsers | Both are progressive: an unsupported `priority` is ignored; unsupported `integrity` is a no-op and the file is same-origin and committed |
| GLB with skinning costs more on a phone than the triangle count says | Clips capped, tier-1 `scrub` only, bones counted by `assets:check` in P1 (added as `MATERIALS`-style rule if a skinned source appears) |
| Dev tooling supply chain | Five exact-pinned packages, no install scripts, `npm audit signatures` in CI, Dependabot already present |

---

## 11. Open questions for the owner (defaults so nothing blocks)

1. **Which models.** Default: P4 ships two "own" generated objects (a gyroscope for the orbit section, one faceted prop for Stack) and one CC0 pick. For the CC0 pick the builder brings six candidates from Poly Haven, Kenney and Quaternius (the sources the sourcing guide already names), each with its licence page URL and retrieval date, and you choose. No specific third-party asset is named here because none was fetched or licence-checked for this spec.
2. **Hero GLB or stay procedural.** Default: procedural hero stays until a hero candidate you like exists; the platform does not need one to ship.
3. **CC-BY at all.** Default: allowed by the enum with a footer credit (decision D3). Say so if you would rather have CC0 and own only; it is a one-word change in `licenceSchema`.
4. **Owner-side tools.** KTX2 needs `toktx`; this spec does not. Default: WebP only until the M8 trigger fires.
