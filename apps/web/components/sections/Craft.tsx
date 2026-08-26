'use client'

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { Reveal } from '@/components/ui/Reveal'

/**
 * Craft — the mirror of the hero, and the one section where the 3D comes
 * forward and the content steps back (design-home.md § 7).
 *
 * Hero:  panel LEFT,  scrim darkest at 2%,   formation `monolith` at cx 0.74.
 * Craft: panel RIGHT, scrim darkest at 100%, formation `scatter`  at cx 0.34.
 *
 * The panel is a slim rail — `min(38%, 460px)` with a 320px floor — not a
 * full-width block, and it carries a cyan `border-top` instead of the glass
 * highlight. `min-height: 88vh` with `align-items: center` gives the canvas the
 * room the composition needs.
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

/* ── Measured values ──────────────────────────────────────────────────────
 * Every constant below is transcribed from design-home.md § 7. They are inline
 * styles rather than utilities because `app/globals.css` is owned elsewhere and
 * this section may not add to it; nothing here is a raw colour, only tokens.
 * -------------------------------------------------------------------------- */

/**
 * § 3.3 — below 768 the panel goes full-width and the scrim flips to vertical.
 * Same three stops as `SCRIMS.scatter`, rotated onto the vertical axis so the
 * dark end lands where the panel does. Layered over the section's own radial
 * rather than replacing it: `SectionBackdrop` owns that one and is not this
 * component's to change.
 */
const MOBILE_SCRIM =
  'linear-gradient(180deg, rgba(13, 17, 23, 0) 0%, rgba(13, 17, 23, 0.55) 45%, rgba(13, 17, 23, 0.94) 100%)'

/**
 * The only `h2` on the page with a **fixed** size rather than the `--h2` clamp,
 * and the only one at `wdth 92` rather than 95 — because the panel it sits in
 * is already capped at 460px, so there is nothing for a clamp to respond to.
 */
const STATEMENT: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontVariationSettings: "'wdth' 92",
  fontWeight: 600,
  fontSize: '2rem',
  lineHeight: 1.1,
  letterSpacing: '-0.015em',
  textWrap: 'balance',
}

const PHYSICS_OFF: CSSProperties = {
  border: '1px solid var(--line-2)',
  background: 'transparent',
  color: 'var(--fg-1)',
}

const PHYSICS_ON: CSSProperties = {
  border: '1px solid rgba(34, 211, 238, 0.5)',
  background: 'rgba(34, 211, 238, 0.12)',
  color: 'var(--fg-0)',
  boxShadow: 'var(--glow-cyan)',
}

/** Mono micro-label chrome, shared by the HUD toggle and the lab link. */
const MICRO_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.4,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
}

const HUD_PANEL: CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: '1px solid var(--line-1)',
  borderRadius: 'var(--r-card)',
  background: 'rgba(13, 17, 23, 0.86)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--label)',
  lineHeight: 1.9,
  color: 'var(--fg-1)',
}

const HUD_ROW: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
}

const NOTE: CSSProperties = {
  margin: 0,
  color: 'var(--fg-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.6,
  letterSpacing: '0.02em',
  textTransform: 'none',
}

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

/* ── The section ──────────────────────────────────────────────────────────── */

export interface CraftProps {
  /** Two-digit ordinal in the eyebrow — rendered as `03 — Craft: 3D & AR`. */
  readonly index?: string
  readonly eyebrow?: string
  /** The `h2`. Spec § 5.5 copy; kept from the export unchanged (§ 1). */
  readonly statement?: string
  readonly body?: string
  /**
   * The lab route. **Omit it in M0** — `/lab` is out of scope (§ 9), and the
   * link then renders as a focusable, announced `Coming soon` affordance rather
   * than a 404 trap. Pass a path once the route exists and it becomes a link
   * with no other change.
   */
  readonly labHref?: string
}

const DEFAULT_STATEMENT =
  'The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone.'

const DEFAULT_BODY =
  'Rigid-body physics, spatial audio, mobile joystick controls — and the performance budgets that make it viable.'

const PHYSICS_NOTE_ID = 'craft-physics-note'
const HUD_PANEL_ID = 'craft-perf-hud'

export function Craft({
  index = '03',
  eyebrow = 'Craft: 3D & AR',
  statement = DEFAULT_STATEMENT,
  body = DEFAULT_BODY,
  labHref,
}: CraftProps) {
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
    <Section
      id="craft"
      formation="scatter"
      labelledBy="craft-h"
      className="md:flex md:min-h-[88vh] md:items-center"
      innerClassName="flex justify-end"
      backdrop={
        <>
          <SectionBackdrop formation="scatter" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 md:hidden"
            style={{ background: MOBILE_SCRIM }}
          />
        </>
      }
    >
      <Reveal className="w-full md:w-[min(60%,460px)] md:min-w-[320px] lg:w-[min(38%,460px)]">
        {/*
          `padded={false}` + `p-6 md:p-8`: the `craft` glass variant carries the
          hero's 24 → 40 → 48 padding ladder, but the craft panel measures 32px
          (design-home.md § 7 — "panel content = width − 64px"). The variant is
          still what supplies the 0.76 ground, and `tone` the cyan top edge at
          30% alpha.
        */}
        <GlassCard variant="craft" tone="cyan-400" padded={false} className="p-6 md:p-8">
          <Eyebrow tone="cyan-400" className="mb-4">{`${index} — ${eyebrow}`}</Eyebrow>

          <h2 id="craft-h" className="mb-4" style={STATEMENT}>
            {statement}
          </h2>

          <p className="mb-8 text-[var(--fg-1)]">{body}</p>

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

            <LabLink href={labHref} />
          </div>

          {hud ? <PerfHud id={HUD_PANEL_ID} sample={sample} /> : null}
        </GlassCard>
      </Reveal>
    </Section>
  )
}

/**
 * `/lab` does not exist in this milestone (§ 9), so the link renders as a
 * disabled control with a visible, announced `Coming soon` badge rather than as
 * a 404 trap. Same convention as the AR button: `aria-disabled` on a real
 * `<button>`, which keeps it focusable and in the accessibility tree.
 */
function LabLink({ href }: { href?: string }): ReactNode {
  if (href === undefined) {
    return (
      <button
        type="button"
        aria-disabled="true"
        data-coming-soon="true"
        title="The lab ships in a later milestone"
        style={{ ...MICRO_LINK, cursor: 'not-allowed' }}
        className="text-[var(--fg-2)]"
      >
        Open the lab
        <Badge status="in-preparation">Coming soon</Badge>
      </button>
    )
  }

  return (
    <a href={href} style={MICRO_LINK}>
      Open the lab <span aria-hidden="true">→</span>
    </a>
  )
}
