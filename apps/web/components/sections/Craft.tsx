import type { ReactNode } from 'react'
import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { Reveal } from '@/components/ui/Reveal'
import { CraftControls } from './CraftControls'
import { MICRO_LINK, MOBILE_SCRIM, STATEMENT } from './craft-styles'

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
 * The section is a server component, on the same shell/child split as
 * `Contact.tsx` → `ContactForm.tsx`: everything that owns state or runs an
 * effect — the physics toggle, the HUD disclosure and its sampler — lives in
 * `CraftControls`, which is the only part of this section that hydrates. The
 * honesty rules for those controls are documented there.
 */

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

export function Craft({
  index = '03',
  eyebrow = 'Craft: 3D & AR',
  statement = DEFAULT_STATEMENT,
  body = DEFAULT_BODY,
  labHref,
}: CraftProps) {
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

          <CraftControls labLink={<LabLink href={labHref} />} />
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
 *
 * Static markup, so it stays in the server shell and crosses into
 * `CraftControls` as a rendered slot — the client child never re-renders it.
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
