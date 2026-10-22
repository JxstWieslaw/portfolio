/**
 * The Assembly's stage: the only module in the app that imports `@react-three/fiber`.
 *
 * Its surface is exactly what `AssemblyCanvas` uses: `Canvas`, `useThree` (`gl`, `scene`, `camera`, `size`,
 * `invalidate`, `clock`) and `useFrame(fn, priority)`. Slice S1 of the plain-three migration
 * (docs/superpowers/specs/2026-10-21-plain-three-migration.md) implements it over R3F's `createRoot`; slice S2
 * reimplements it over plain three behind the same surface.
 */
export { Canvas, type StageProps } from './Canvas'
export { useFrame, useThree } from './hooks'
export type { RenderCallback, RootState } from '@react-three/fiber'
