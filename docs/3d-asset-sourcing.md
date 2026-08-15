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
| **Poly Haven** — polyhaven.com | HDRIs, PBR textures, some models | **CC0** | First stop for the HDRI. Download 1k HDR, convert to KTX2 (below). |
| **Sketchfab** — sketchfab.com (filter: *Downloadable* → licence *CC0* or *CC-BY*) | Hero artefact, abstract sculptures, mechanisms | CC0 / CC-BY (credit required in the colophon) | Check triangle count before downloading; prefer ≤ 50 k tris. Avoid "Editorial" and non-commercial licences. |
| **Kenney** — kenney.nl | Low-poly props, prototype kits | **CC0** | Great for Lab physics props; consistent style. |
| **Quaternius** — quaternius.com | Low-poly models | **CC0** | Same as Kenney; slightly more organic. |
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
| Materials | 1 material, PBR metal/rough; **no** transmission/refraction baked in (we add `MeshTransmissionMaterial` in code if wanted) | Batching; we control the look in-shader |
| Textures | ≤ 2 (baseColor, normal), **≤ 2048 px**, power of two, no alpha unless needed | Memory on iOS Safari |
| Scale | 1 unit = 1 metre; artefact fits in a 1 m cube; origin at centre; Y-up | AR placement and camera rig assumptions |
| Rigging/animation | None (static) | Not used |
| Naming | Meaningful mesh/material names, no spaces | `gltfjsx` output readability |
| Draco/Meshopt | Do **not** pre-compress — send raw GLB; compression is done in the pipeline | Reproducible builds |

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
> visitor the right variant for their GPU tier and codec support. The commands below are what
> that service runs, and what you run by hand before M4. See the
> [API service spec §7](superpowers/specs/2026-08-15-api-service-design.md).
>
> Sourcing and licensing are **not** automated: licence is a required field at upload and feeds
> the site colophon. §6 below still applies.

```bash
# 1. Inspect
npx @gltf-transform/cli inspect artefact.glb

# 2. Optimise: dedupe, prune, weld, reorder, Meshopt-compress geometry, KTX2 textures
npx @gltf-transform/cli optimize artefact.glb public/models/artefact.glb \
  --compress meshopt --texture-compress ktx2

# 3. Generate a typed React component (once; commit the output)
npx gltfjsx public/models/artefact.glb --types --transform -o components/three/models/Artefact.tsx

# 4. HDRI → KTX2 cubemap (tier 3 only)
#    (Poly Haven 1k .hdr → toktx / gltf-transform ktxfix as documented in the repo scripts)
```
Loading in the site: `useGLTF` with `MeshoptDecoder`/`KTX2Loader` set once in `PersistentCanvas`; the model is `dynamic()`-imported so it never touches the initial JS budget; a poster covers it until loaded.

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
