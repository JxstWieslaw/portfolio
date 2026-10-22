/**
 * The Assembly's stage: a small host for a plain-three scene, with no React Three Fiber.
 *
 * Its surface is what `AssemblyCanvas` used from R3F: `Canvas`, `useThree` (`gl`, `scene`, `camera`, `size`,
 * `invalidate`, `clock`) and `useFrame(fn, priority)`. Slice S1 of the plain-three migration
 * (docs/superpowers/specs/2026-10-21-plain-three-migration.md) put this surface over R3F's `createRoot`; slice S2
 * reimplements it over `WebGLRenderer`, `PerspectiveCamera` and `Clock` (`stage.ts`) with R3F's defaults and loop
 * semantics, so the scene is unchanged and draws the same pixels.
 */
export { Canvas, type StageProps } from './Canvas'
export { useFrame, useThree } from './hooks'
export { createStage, resolveDpr, type CameraOptions, type Dpr, type Frameloop, type GlOption, type RenderCallback, type RootState, type Size, type Stage } from './stage'
