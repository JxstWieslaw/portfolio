'use client'

import { LateIsland } from '@/components/sections/LateIsland'
import type { CraftControls, CraftControlsProps } from './CraftControls'

/**
 * Craft's stateful controls, out of the initial bundle (chunk `late-ui`), on the same terms as `ContactFormLazy`:
 * the server HTML is the controls' own markup, so nothing shifts, and they hydrate when the visitor nears them or
 * touches them.
 */
const ServerControls =
  typeof window === 'undefined'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./CraftControls') as { CraftControls: typeof CraftControls }).CraftControls
    : null

const load = () => import(/* webpackChunkName: "late-ui" */ './CraftControls').then((m) => m.CraftControls)

export function CraftControlsLazy(props: CraftControlsProps) {
  return (
    <LateIsland
      name="craft-controls"
      load={load}
      props={props}
      server={ServerControls === null ? null : <ServerControls {...props} />}
    />
  )
}
