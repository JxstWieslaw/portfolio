/**
 * The pointer as a ray — journey spec § 5.1.
 *
 * PURE. Under a perspective camera the pointer is not a parallel line through
 * the z = 0 plane: it is the line from the camera through the pixel. The M2
 * slice used `(0, 0, 1)` as the direction, which drifts off-centre; this is the
 * correct ray in world space. The scene moves it into group space with the
 * group's inverse matrix and the shader (or the CPU loop) measures each
 * instance's perpendicular distance to it.
 */

import { pixelToWorld, type Frame } from '@/lib/assembly/targets'

export interface Ray {
  /** The camera position, world space. */
  readonly origin: readonly [number, number, number]
  /** Unit direction from the camera through the pointer's point on z = 0. */
  readonly direction: readonly [number, number, number]
}

/** The camera sits on +Z at `frame.distance`, looking at the origin (see `AssemblyCanvas`). */
export function pointerRay(frame: Frame, px: number, py: number): Ray {
  const [wx, wy] = pixelToWorld(frame, px, py)
  const dz = -frame.distance
  const length = Math.sqrt(wx * wx + wy * wy + dz * dz) || 1
  return { origin: [0, 0, frame.distance], direction: [wx / length, wy / length, dz / length] }
}

/** Where the ray crosses the z = 0 plane; the test oracle for `pointerRay`. */
export function rayAtPlane(ray: Ray): readonly [number, number, number] {
  const [ox, oy, oz] = ray.origin
  const [dx, dy, dz] = ray.direction
  if (dz === 0) return [ox, oy, oz]
  const t = -oz / dz
  return [ox + dx * t, oy + dy * t, 0]
}
