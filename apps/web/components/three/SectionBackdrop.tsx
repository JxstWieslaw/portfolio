import { FieldCanvas } from './FieldCanvas'
import { SCRIMS, washCss, type FormationId } from '@/lib/formations/config'

export interface SectionBackdropProps {
  readonly formation: FormationId
  /**
   * Which scrim to lay over the canvas. Defaults to the formation's own, which
   * is the 1:1 mapping the design uses; the override exists for the case where
   * a section reuses a formation under different panel anchoring.
   */
  readonly scrim?: FormationId
  /** Run the animation loop. Only the hero does. */
  readonly animate?: boolean
}

/**
 * The decorative backdrop a section owns.
 *
 * ```
 * <div aria-hidden absolute inset-0>      <- never affects flow
 *   <div sticky top-0 h-screen>           <- holds the field still as the section scrolls
 *     <div wash />                        <- rung 5, always present
 *     <canvas data-f="…" />               <- rungs 1-4
 *     <div scrim />                       <- keeps the panel copy readable
 * ```
 *
 * This is the export's structure, not the M0 plan's single global fixed layer
 * (reconciliation § 5). The per-section shape is what M2's Assembly needs, so
 * building the plan's version would mean building it twice.
 *
 * The wash sits *under* the canvas rather than replacing it, which is what
 * makes the ladder shift-free: when the canvas cannot paint it simply stays at
 * opacity 0 and the wash is already in place.
 *
 * The parent section must be `position: relative`. Nothing here participates in
 * layout, so no rung can move a pixel of content.
 */
export function SectionBackdrop({ formation, scrim = formation, animate = formation === 'monolith' }: SectionBackdropProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="sticky top-0 h-screen max-h-full w-full overflow-hidden">
        {/* Rung 5 — the section's radial accent wash, pure CSS, always painted. */}
        <div className="absolute inset-0" style={{ background: washCss(formation) }} />
        <FieldCanvas formation={formation} animate={animate} />
        <div className="absolute inset-0" style={{ background: SCRIMS[scrim] }} />
      </div>
    </div>
  )
}

/**
 * The layer's single screen-reader note — reconciliation § 8.2.
 *
 * Mount this **once for the page**, not once per section: seven identical
 * announcements would be worse than none. Every canvas is `aria-hidden`, so
 * this sentence is the only thing assistive technology hears about the whole
 * visualisation.
 */
export function DecorativeLayerNote() {
  return <p className="sr-only">Decorative 3D visualisation; all content is available as text.</p>
}
