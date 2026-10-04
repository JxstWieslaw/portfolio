# 3D Asset Sourcing & Pipeline Guide

> **v1 of the site needs no external 3D assets** — "The Assembly" is fully procedural. This guide is for the optional v2 upgrades (a modelled hero artefact, an AR-placeable model, an HDRI at tier 3) and for the Lab. If you send me any of the below, I can wire it in.

---

## 1. What would actually improve the site (in priority order)

| # | Asset | Where it goes | Why it helps | Effort to integrate |
|---|---|---|---|---|
| 1 | **One hero artefact** (GLB): an abstract, faceted, "engineered" object — a crystal, a monolith, a gyroscope-like mechanism, an abstract "core" | Sits inside / replaces the monolith formation; case-study badge; the AR-placeable object | Gives the site a signature silhouette; makes AR meaningful | Low (gltfjsx → component) |
| 2 | **USDZ export of the same artefact** | iOS Quick Look "View in AR" (`<a rel="ar">`) | Android has WebXR; iOS Safari does not — USDZ is the only path | Low |
| 3 | **A 1k HDRI** (KTX2-compressed) | Tier-3 environment lighting | Richer reflections on the artefact | Trivial |
| 4 | **2–3 low-poly props** for the Lab physics playground (crates, spheres, tori) | `/lab` physics experiment | Variety in the flick/throw demo | Low |
| 5 | **A photo/avatar** | `/about`, OG default | Human presence | Trivial |

Everything else (skyboxes, characters, environments) is *not* needed and would fight the positioning.

---

## 2. Where to get assets (free / permissive first)

| Source | Best for | Licence | Notes |
|---|---|---|---|
| **Poly Haven** — polyhaven.com | HDRIs, PBR textures, some models | **CC0** | First stop for the HDRI. Download 1k HDR, convert to KTX2 (below). Blocked until its host is added to `SOURCE_HOSTS` in `apps/web/scripts/assets/hosts.ts` in a PR that names the source. |
| **Sketchfab** — sketchfab.com (filter: *Downloadable* → licence *CC0* or *CC-BY*) | Hero artefact, abstract sculptures, mechanisms | CC0 / CC-BY (credit required in the colophon) | Blocked until its host is added to `SOURCE_HOSTS` in `apps/web/scripts/assets/hosts.ts` in a PR that names the source. Check triangle count before downloading; prefer ≤ 50 k tris. Avoid "Editorial" and non-commercial licences. |
| **Kenney** — kenney.nl | Low-poly props, prototype kits | **CC0** | Great for Lab physics props; consistent style. |
| **Quaternius** — quaternius.com | Low-poly models | **CC0** | Same as Kenney; slightly more organic. Blocked until its host is added to `SOURCE_HOSTS` in `apps/web/scripts/assets/hosts.ts` in a PR that names the source. |
| **pmndrs Market** — market.pmnd.rs | HDRIs, models, materials curated for React Three Fiber | Mixed (each item states it) | Native to your toolchain; drag-and-drop into R3F. |
| **ambientCG** — ambientcg.com | PBR textures | **CC0** | Only if the artefact needs a real material. |
| **Spline** — spline.design (community) | Abstract 3D objects made for the web | Per item | Exports GLB; can also embed, but prefer GLB into R3F to stay one renderer. |
| **Blockade Labs Skybox** | AI skyboxes | Check current terms | Not recommended for this design (no skybox), listed for completeness. |
| **Blender** — you already list it | Making the artefact yourself | Yours | Honestly the best option: 30–60 minutes for a faceted abstract form beats an hour of licence-checking. See §4. |

**Fonts** (not 3D but same rule): Google Fonts (OFL) or Fontshare (free for commercial). Never self-host a font you don't have a licence for.

**Rule of thumb:** CC0 → use freely. CC-BY → add a line to the site colophon ("Model *X* by *Y*, CC-BY 4.0"). Anything else → don't.

---

## 3. Technical requirements for any model you supply

| Property | Requirement | Reason |
|---|---|---|
| Format | **glTF 2.0 binary (.glb)**, single file | R3F/drei loaders; one request |
| Triangles | **≤ 50 000** for the hero artefact; ≤ 5 000 per Lab prop | Mobile GPU budget alongside the Assembly |
| Materials | 1 material at tier 1, up to 2 at tiers 2 and 3 (see the Kenney note below); PBR metal/rough; **no** transmission/refraction baked in (we add `MeshTransmissionMaterial` in code if wanted) | Batching; we control the look in-shader |
| Textures | ≤ 2 (baseColor, normal), **≤ 2048 px**, power of two, no alpha unless needed | Memory on iOS Safari |
| Scale | 1 unit = 1 metre; artefact fits in a 1 m cube; origin at centre; Y-up | AR placement and camera rig assumptions |
| Rigging/animation | None (static) | Not used |
| Naming | Meaningful mesh/material names, no spaces | `gltfjsx` output readability |
| Draco/Meshopt | Do **not** pre-compress — send raw GLB; compression is done in the pipeline | Reproducible builds |

What `assets:ingest` does to a source rather than refusing it:

- `KHR_lights_punctual` and cameras are removed (lights and camera are ours).
- `KHR_materials_unlit` is removed, so the material is lit by our lighting.
- `KHR_materials_emissive_strength` is folded into `emissiveFactor` (factor x strength, clamped to 1) and then removed. A strength above 1 loses its overdrive, because no tier lists the extension.
- Custom `_UPPERCASE` attributes (Blender's `_BATCHID` and similar) are removed; nothing reads them.
- Sparse accessors are written dense.
- Animations not listed in `clips` are dropped with their keyframe data.

**Kenney pieces need a material merge.** Kenney kits arrive with 3 to 5 materials against a budget of 1 (tier 1) or 2 (tiers 2 and 3). Ingest stops with `materials: N > budget M: needs a material merge, see docs/3d-asset-sourcing.md`. The merge (one atlas or recolour pass) is not built yet; it is the integration PR's job, so a Kenney model cannot be ingested before that lands.

**Residual risk: meshopt payloads.** The scanner checks that each meshopt view's `count x byteStride` equals its declared length and that the compressed range is in range, referenced and not overlapping, but it cannot tell whether the compressed bytes themselves carry extra bits: that would need a re-encode comparison. For a third-party source the maintainer re-verifies with `npm run assets:ingest -- --id <id> --verify` from the pinned raw file before committing. Bits hidden inside real geometry cannot be detected by any scan.

**Residual risk: attribute cross-checks.** The scanner checks that every accessor is read, in range, typed and tiled, but it does not yet cross-check each attribute's type, normalisation and count against its semantic (for example that `POSITION` is a VEC3 and `TEXCOORD_0` a VEC2 with the same count). A source that passes can still carry a wrongly typed attribute; the renderer would draw it wrongly rather than leak anything. Both this and the meshopt payload are deferred and listed here so they are decided, not forgotten.

For the **USDZ** (iOS AR): same model, exported via Blender's USD exporter or converted with Apple's Reality Converter; ≤ 10 MB; textures baked.

---

## 4. Making the artefact in Blender (fastest path)

1. Start from an Icosphere (subdiv 2) or a Cube with a **Bevel** + **Subdivision** stack; add **Displace** with a Voronoi/Musgrave texture at low strength for facets; or use **Cast** to a sphere partially and **Decimate → Planar** for a crystalline look.
2. Keep it abstract and symmetrical-ish; it will be lit by cyan/violet and seen from all sides.
3. Apply modifiers, **Decimate** to ≤ 50 k tris, **Shade Smooth** with auto-smooth ~30°.
4. One Principled BSDF material (metallic 0.6–0.9, roughness 0.2–0.4). No textures needed — the site drives colour.
5. Set origin to geometry centre, scale to fit 1 m, apply transforms.
6. Export → glTF 2.0 → **glb**, "Selected objects", +Y up, no animation, no cameras/lights.
7. Optionally export USDZ (File → Export → Universal Scene Description → .usdz).

---

## 5. Integration pipeline (what happens to whatever you send)

> **From milestone M4 this is automated.** You upload a raw GLB through the admin surface and
> the transcoder service (Cloud Run) runs every step below, producing per-tier LODs, KTX2
> textures, the USDZ for iOS AR and a render poster — then `GET /v1/assets/manifest` serves each
> visitor the right variant for their GPU tier and codec support. Until then the repo's own
> `assets:*` commands below do the work by hand. See the
> [API service spec §7](superpowers/specs/2026-08-15-api-service-design.md) and the
> [model platform spec](superpowers/specs/2026-10-02-model-platform.md) §5.
>
> Sourcing and licensing are **not** automated: licence is a required field at upload and feeds
> the site colophon. §6 below still applies.

```bash
# 1. Register the source in content/models/sources.json (url, sha256, licenceId, licenceEvidence), then
#    download it. Only kenney.nl (CC0) is reachable; the file lands in the gitignored
#    assets-src/<id>/ and must match its sha256.
#    The pinned sha256 is trust-on-first-use: it records what you read the licence page for. If the
#    download later changes, ingest refuses it until you re-read the licence and rerun with
#    --accept-source-change <the new sha256> (exit code 3 reminds you to pin it in sources.json).
npm run assets:fetch -- --id artefact

# 2. Optimise with the pinned toolchain (no unpinned `npx @gltf-transform/cli`): dedupe, weld,
#    simplify to the tier budget, quantize, Meshopt-compress, WebP textures, strip all metadata,
#    hashed per-tier GLBs, manifest and credits.
npm run assets:ingest -- --id artefact
npm run assets:check          # what CI runs: budgets, hashes, licences, metadata scan

# 3. Generate a typed React component (once; commit the output)
npx gltfjsx public/models/artefact.glb --types --transform -o components/three/models/Artefact.tsx

# 4. HDRI → KTX2 cubemap (tier 3 only)
#    (Poly Haven 1k .hdr → toktx / gltf-transform ktxfix as documented in the repo scripts)
```
Loading in the site: `useGLTF` with `MeshoptDecoder`/`KTX2Loader` set once in `PersistentCanvas`; the model is `dynamic()`-imported so it never touches the initial JS budget; a poster covers it until loaded.

### 5.1 Flat-colour kit models: the `look` block (material merge and recolour)

Kits such as Kenney's Space Kit colour a model with one flat material per colour (3 or 4 per piece), and the tier budgets allow one material at tier 1 and two at tiers 2 and 3. A source entry with a `look` block in `content/models/sources.json` is merged to **one** material by the pipeline (`apps/web/scripts/assets/look.ts`). Without a `look` block nothing changes.

The rule, in full:

1. Each primitive's material colour is baked into a constant per-vertex `COLOR_0` (VEC3, linear) on a vertex stream of its own (unused vertices dropped), all primitives then share one material with a white base colour, and `join` fuses them into a single draw call. UV sets are dropped (nothing reads them without a texture).
2. A source with any texture is refused: flattening it would lose the texture.
3. **Recolour toward the site palette is explicit, never guessed.** `look.palette` maps a source material name to the sRGB hex it becomes (the site's tokens: violet `#7C3AED` / `#A78BFA`, cyan `#22D3EE` / `#67E8F9`, and the cool neutrals around `#1E2238` to `#D3D9F2`). A material not named keeps its source colour. A palette key that matches no material fails the ingest, so a typo cannot pass silently.
4. The merged material gets `look.metallic` and `look.roughness` (defaults 0.6 and 0.3), and an optional uniform emissive accent (`look.emissive`: colour and an amount from 0 to 1). A uniform emissive lifts the whole piece, not just its crystal, so keep the amount small or leave it out.
5. Centring on the origin and scaling to bounding radius 1 are the existing normalise step; the ledger's `scale` stays the only size knob.

Why vertex colour and not a texture atlas: it adds no image, no WebP capability and no sampler, the output is a few kilobytes, and the look stays editable in one JSON block.

The first sourced models (all enabled, tiers 1 and 2): `crystal-cluster` (Kenney Space Kit `rock_crystalsLargeB`) in Craft, `gate-complex` (Kenney Space Kit `gate_complex`) in Stack, and the generated `gyroscope` in How I Lead. Why the gate sits in Stack: How I Lead already hosts the gyroscope and the ledger holds one model per formation, and the gate is a threshold into an ordered structure, which is what the turning lattice of Stack is (journey spec section 3.6).

### 5.2 Verifying a raw-source model (CI cannot)

CI has no raw input, so its verify step is `npm run assets:ingest -- --only generated --verify`. For a raw-source model the maintainer re-proves the committed bytes from the pinned source before committing and before merging a change to its `look` block:

```bash
npm run assets:fetch -- --id crystal-cluster     # checks archiveSha256, extracts to assets-src/ (gitignored)
npm run assets:fetch -- --id gate-complex
npm run assets:ingest -- --verify                # every source, raw ones included: exit 1 on any difference
npm run assets:check                             # what CI runs
git ls-files assets-src                          # must print nothing: raw sources and zips are never committed
```

---

## 6. Licence & credit checklist (before anything goes live)
- [ ] Licence recorded in `content/credits.json` (asset, author, URL, licence)
- [ ] CC-BY credits rendered in the footer colophon
- [ ] No "non-commercial" or "editorial" assets anywhere
- [ ] Fonts licensed for web self-hosting
- [ ] HDRI/texture sources noted even when CC0 (good practice)

---

## 7. If you send nothing
The site ships with the procedural monolith, the CSS-generated monogram avatar, and Lightformer-based lighting. It will look finished. The artefact is a nice-to-have, not a dependency.
