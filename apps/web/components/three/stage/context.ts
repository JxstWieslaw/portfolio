import { createContext } from 'react'
import type { RootState, Stage } from './stage'

/** What the stage's `Canvas` provides to its children: the core (for `useFrame`) and its latest state (for `useThree`). */
export interface StageRoot {
  readonly stage: Stage
  readonly state: RootState
}

export const StageContext = createContext<StageRoot | null>(null)
