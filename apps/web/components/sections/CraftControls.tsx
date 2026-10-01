'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { HUD_PANEL, HUD_ROW, MICRO_LINK, NOTE, PHYSICS_OFF, PHYSICS_ON } from './craft-styles'

/**
 * The stateful part of Craft, and the only part of the section that hydrates.
 *
 * `Craft.tsx` is a server component: the section, its backdrop, the panel,
 * the eyebrow, the `h2` and the body never ship as client JavaScript. This
 * child holds exactly the markup that owns state or runs an effect — the
 * physics toggle and its Reset, the HUD disclosure and the panel it opens —
 * plus the two controls that share a row with them. The lab link is static,
 * so the shell renders it and hands it in as `labLink`.
 *
 * ── Honesty in a milestone with no engine ────────────────────────────────
 *
 * M0 ships no physics engine, no WebGL renderer and no `/lab` route. Three
 * controls therefore have to say so rather than perform:
 *
 *  1. **Enable physics** is a real toggle over exactly one piece of state — its
 *     own. It flips `aria-pressed` and its label, and touches nothing else. A
 *     visible note (referenced by `aria-describedby`, so it is announced with
 *     the control rather than only near it) says the engine ships later.
 *  2. **View in AR** is the designed permanently-unsupported state
 *     (reconciliation § 8): dashed border, `cursor: not-allowed`, the WebXR
 *     title, an inline `Unsupported` badge — and still focusable and announced,
 *     which is why it uses `aria-disabled` and never the `disabled` attribute.
 *  3. **The perf HUD reports only what it can measure.** `fps` and `frame` are
 *     sampled from a real `requestAnimationFrame` loop that runs only while the
 *     panel is open. `draw calls`, `instances` and `gpu tier` are renderer
 *     counters, and there is no renderer, so they render as `—` and the panel
 *     says why. The export's `fps 60.0 / 14.2 ms / 1 / 12 000 / 2` are design
 *     placeholders; shipping them as telemetry would be a fabricated
 *     measurement on a page whose entire pitch is measured performance.
 */

/* ── The perf sampler ─────────────────────────────────────────────────────── */

export interface PerfSample {
  /** Frames per second over the last window. */
  readonly fps: number
  /** Mean wall-clock time per frame, in milliseconds. */
  readonly frameMs: number
}

/** Long enough to be a measurement, short enough to feel live. */
const SAMPLE_WINDOW_MS = 500

/**
 * A real frame-rate sampler.
 *
 * It runs **only while the HUD is open**, which is why it can exist at all in a
 * milestone whose rule is that nothing animates except the hero canvas: closed
 * is the default, and closed costs nothing. It reports the main thread's frame
 * rate, which is a true measurement of this page in this browser — it says
 * nothing about a 3D renderer, and the panel is explicit about that.
 *
 * Returns `null` until a first full window has elapsed, and wherever
 * `requestAnimationFrame` does not exist. `null` renders as `—`; it never
 * renders as a number.
 */
export function usePerfSample(active: boolean): PerfSample | null {
  const [sample, setSample] = useState<PerfSample | null>(null)

  useEffect(() => {
    if (!active) {
      setSample(null)
      return
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return
    }

    let handle = 0
    let frames = 0
    let windowStart = 0
    let disposed = false

    const tick = (timestamp: number): void => {
      if (disposed) return
      if (windowStart === 0) windowStart = timestamp
      frames += 1

      const elapsed = timestamp - windowStart
      if (elapsed >= SAMPLE_WINDOW_MS && frames > 0) {
        setSample({ fps: (frames * 1000) / elapsed, frameMs: elapsed / frames })
        frames = 0
        windowStart = timestamp
      }

      handle = window.requestAnimationFrame(tick)
    }

    handle = window.requestAnimationFrame(tick)

    return () => {
      disposed = true
      window.cancelAnimationFrame(handle)
    }
  }, [active])

  return sample
}

/* ── The HUD ──────────────────────────────────────────────────────────────── */

function HudRow({
  metric,
  label,
  value,
  measured,
}: {
  metric: string
  label: string
  value: string
  measured: boolean
}) {
  return (
    <div data-metric={metric} style={HUD_ROW}>
      <dt style={{ margin: 0, color: 'var(--fg-2)' }}>{label}</dt>
      <dd
        data-measured={measured ? 'live' : 'none'}
        style={{ margin: 0, color: measured ? 'var(--fg-0)' : 'var(--fg-2)' }}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * Two live rows and three honest blanks.
 *
 * The export colours `fps` in `--success`, which reads as "budget met". M0
 * measures nothing about the 3D budget, so the green is dropped: a live sample
 * is `--fg-0`, an unmeasured counter is `--fg-2`. That is the whole visual
 * grammar of the panel — bright means measured.
 */
export function PerfHud({ id, sample }: { id: string; sample: PerfSample | null }) {
  const live = sample !== null

  return (
    <div id={id} data-hud="" data-live={live ? 'true' : 'false'} style={HUD_PANEL}>
      <dl style={{ margin: 0 }}>
        <HudRow metric="fps" label="fps" value={live ? sample.fps.toFixed(1) : '—'} measured={live} />
        <HudRow
          metric="frame"
          label="frame"
          value={live ? `${sample.frameMs.toFixed(1)} ms` : '—'}
          measured={live}
        />
        <HudRow metric="draw-calls" label="draw calls" value="—" measured={false} />
        <HudRow metric="instances" label="instances" value="—" measured={false} />
        <HudRow metric="gpu-tier" label="gpu tier" value="—" measured={false} />
      </dl>
      <p style={{ ...NOTE, marginTop: 12 }}>
        fps and frame time are sampled live in this browser while the HUD is open. Draw calls,
        instances and GPU tier come from the WebGL renderer, which ships in a later milestone —
        they are not measured here.
      </p>
    </div>
  )
}

/* ── The controls ─────────────────────────────────────────────────────────── */

const PHYSICS_NOTE_ID = 'craft-physics-note'
const HUD_PANEL_ID = 'craft-perf-hud'

export interface CraftControlsProps {
  /** The lab affordance, rendered by the server shell — see `LabLink` in `Craft.tsx`. */
  readonly labLink: ReactNode
}

export function CraftControls({ labLink }: CraftControlsProps) {
  const [physics, setPhysics] = useState(false)
  const [hud, setHud] = useState(false)
  const sample = usePerfSample(hud)

  const togglePhysics = useCallback(() => {
    setPhysics((previous) => !previous)
  }, [])

  /** The export's `resetScene`: `physics: false`, unconditionally. */
  const reset = useCallback(() => {
    setPhysics(false)
  }, [])

  const toggleHud = useCallback(() => {
    setHud((previous) => !previous)
  }, [])

  return (
    <>
      {/* Control row — wraps to two or three rows at 320px, by design. */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={togglePhysics}
          aria-pressed={physics}
          aria-describedby={PHYSICS_NOTE_ID}
          data-size="md"
          data-physics={physics ? 'on' : 'off'}
          className="btn"
          style={physics ? PHYSICS_ON : PHYSICS_OFF}
        >
          {physics ? 'Physics on' : 'Enable physics'}
        </button>

        <Button variant="secondary" onClick={reset}>
          Reset
        </Button>

        {/*
          Reconciliation § 8 — a designed graceful-degradation state, not a
          bug to fix. `unsupported` is `aria-disabled`, never `disabled`, so
          it keeps its place in the tab order and is announced.
        */}
        <Button variant="unsupported" title="WebXR is not available in this browser">
          View in AR
        </Button>
      </div>

      <p id={PHYSICS_NOTE_ID} className="mb-5" style={NOTE}>
        The physics engine ships in a later milestone — Enable physics and Reset are inert
        until then, and change nothing but this button&rsquo;s own label.
      </p>

      <div
        className="flex flex-wrap items-center justify-between gap-4 pt-5"
        style={{ borderTop: '1px solid var(--line-1)' }}
      >
        {/*
          A disclosure, so `aria-expanded` + `aria-controls` rather than the
          export's `aria-pressed` — the button does not have a pressed
          state, it shows and hides a panel.
        */}
        <button
          type="button"
          onClick={toggleHud}
          aria-expanded={hud}
          aria-controls={HUD_PANEL_ID}
          style={MICRO_LINK}
          className="cursor-pointer text-[var(--fg-2)] hover:text-[var(--cyan-300)] focus-visible:text-[var(--cyan-300)]"
        >
          {`Perf HUD · ${hud ? 'on' : 'off'}`}
        </button>

        {labLink}
      </div>

      {hud ? <PerfHud id={HUD_PANEL_ID} sample={sample} /> : null}
    </>
  )
}
