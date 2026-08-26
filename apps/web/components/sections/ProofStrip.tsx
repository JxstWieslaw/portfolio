import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Chip, ChipScroller } from '@/components/ui/Chip'
import { HairlineGrid } from '@/components/ui/HairlineGrid'
import { KpiTile } from '@/components/ui/KpiTile'
import { Reveal } from '@/components/ui/Reveal'
import { accentForDomain } from '@/lib/accent'

/**
 * The proof strip — eight domain chips over four figures.
 *
 * Measurements: `design-extraction/design-home.md § 4`. Content: reconciliation
 * § 1 and § 1.1, which replaces the export's two attributable metrics
 * (`Load time cut, Ikarus 3D`, `Infra cost cut, Virtualize`) because they cite
 * employers that are not on the canonical timeline. Do not reintroduce them.
 *
 * Two of the four tiles are therefore soft claims and arrive with
 * `placeholder: true`. `KpiTile` gives them the dotted underline outside
 * production and stamps `data-placeholder` in the DOM in every environment, so
 * an unverified figure can never quietly read as fact. That is content debt for
 * the owner to settle, not something this component papers over.
 *
 * This is the one section with no visible heading, so it is named by
 * `aria-label`, and the one section that does not use `--section-y`: its
 * vertical padding is a fixed 48px (`padding="compact"`).
 *
 * Server component throughout; `Reveal` is the only client code it mounts.
 */

export interface ProofDomain {
  /** Keys the brand tint through `lib/accent.ts`. Unknown ids fall back to violet. */
  readonly id: string
  readonly label: string
}

export interface ProofKpi {
  readonly label: string
  readonly value: string
  /** Reconciliation § 1.1 — marks a soft, unverified claim. */
  readonly placeholder?: boolean
}

export interface ProofStripProps {
  /** The eight domains — `getDomains()`. */
  readonly domains?: readonly ProofDomain[]
  /**
   * The four figures — `getKpis('proof')`. `Domains shipped` is derived and
   * arrives resolved; this component renders the value it is handed.
   */
  readonly kpis?: readonly ProofKpi[]
  /** The region's accessible name. */
  readonly label?: string
  /** The accessible name of the chip list itself. */
  readonly domainsLabel?: string
}

const NO_DOMAINS: readonly ProofDomain[] = []
const NO_KPIS: readonly ProofKpi[] = []

export function ProofStrip({
  domains = NO_DOMAINS,
  kpis = NO_KPIS,
  label = 'Domains and figures',
  domainsLabel = 'Domains shipped in production',
}: ProofStripProps = {}) {
  const hasDomains = domains.length > 0
  const hasKpis = kpis.length > 0

  return (
    <Section
      id="proof"
      formation="stream"
      label={label}
      backdrop={<SectionBackdrop formation="stream" />}
      padding="compact"
      /**
       * The 32px between the chip row and the tile grid is a flex `gap` rather
       * than a margin on either child, so an absent row leaves no orphan
       * space — the empty-slot rule. `section-inner` declares no `display`, so
       * nothing here fights it.
       */
      innerClassName="flex flex-col gap-8"
    >
      {hasDomains ? (
        <ChipScroller aria-label={domainsLabel}>
          {domains.map((domain) => (
            <Chip
              key={domain.id}
              as="li"
              variant="domain"
              size="lg"
              tone={accentForDomain(domain.id)}
            >
              {domain.label}
            </Chip>
          ))}
        </ChipScroller>
      ) : null}

      {hasKpis ? (
        <Reveal>
          <HairlineGrid as="dl" cols={2} colsMd={4}>
            {kpis.map((kpi, index) => (
              <KpiTile
                key={`${kpi.label}-${index}`}
                variant="proof"
                label={kpi.label}
                value={kpi.value}
                placeholder={kpi.placeholder ?? false}
              />
            ))}
          </HairlineGrid>
        </Reveal>
      ) : null}
    </Section>
  )
}
