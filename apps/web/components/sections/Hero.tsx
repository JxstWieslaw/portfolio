import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { KpiGroup, KpiTile } from '@/components/ui/KpiTile'
import { Reveal } from '@/components/ui/Reveal'

/**
 * The hero.
 *
 * Governed by reconciliation § 0: **the export owns the pixels, the spec owns
 * the words.** Every measurement below is transcribed from
 * `design-extraction/design-home.md § 3`; every string is the spec's copy deck
 * via reconciliation § 1, which is a deliberate reversal of the export's late
 * editorial pivot.
 *
 * Rejected and never to be reintroduced from `Home.dc.html`:
 * "Software Engineer @ Data Age", "Full Stack Engineer", "I build production
 * software, end to end", and `6+ years`.
 *
 * Server component. The only client code it mounts is `Reveal`, and the scroll
 * cue's reduced-motion behaviour is pure CSS — see `HERO_CSS`.
 */

export interface HeroKpi {
  readonly label: string
  readonly value: string
  /**
   * Reconciliation § 1.1 — an unverified figure keeps the placeholder
   * treatment. `KpiTile` renders the dotted underline outside production and
   * always stamps `data-placeholder` in the DOM.
   */
  readonly placeholder?: boolean
}

export interface HeroCta {
  readonly label: string
  readonly href: string
}

export interface HeroScrollCue {
  readonly href: string
  readonly label: string
  /** The accessible name. Must contain `label` (WCAG 2.5.3, label in name). */
  readonly ariaLabel: string
}

export interface HeroProps {
  /** Role line. Defaults to the reconciliation § 1 canonical eyebrow. */
  readonly eyebrow?: string
  /** H1. Defaults to the reconciliation § 1 canonical headline. */
  readonly headline?: string
  /** Standfirst. Defaults to the spec § 5.5 sub. */
  readonly sub?: string
  /**
   * The hero KPI trio — `getKpis('hero')`. The middle figure is derived
   * (`domainsShipped`) and arrives already resolved; this component renders
   * whatever value it is handed and never recomputes it.
   */
  readonly kpis?: readonly HeroKpi[]
  /** Pass `null` to drop the button entirely rather than render an empty row. */
  readonly primaryCta?: HeroCta | null
  readonly secondaryCta?: HeroCta | null
  /** Pass `null` to omit the cue. It is a real link, never a scroll handler. */
  readonly scrollCue?: HeroScrollCue | null
}

/**
 * The canonical hero copy — reconciliation § 1 and OD-1.
 *
 * Exported so `app/page.tsx` may pass `content/profile.json` through instead
 * and a test can assert the two agree. The defaults exist so the hero can
 * never silently render the export's rejected copy.
 */
export const HERO_COPY = {
  eyebrow: 'Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe',
  headline: 'I lead teams that ship production software — and I make the web move.',
  sub:
    'Hospital operations, learning platforms, creator-discovery tooling, procurement systems. ' +
    'Technical direction, code review and mentorship by day; real-time 3D on the web that holds ' +
    'frame rate on a mid-range phone.',
  primaryCta: { label: 'See the work', href: '#work' },
  secondaryCta: { label: "Let's talk", href: '#contact' },
  scrollCue: { href: '#proof', label: 'Scroll', ariaLabel: 'Scroll to content' },
} as const satisfies {
  eyebrow: string
  headline: string
  sub: string
  primaryCta: HeroCta
  secondaryCta: HeroCta
  scrollCue: HeroScrollCue
}

const NO_KPIS: readonly HeroKpi[] = []

/**
 * Hero-scoped CSS.
 *
 * It lives here rather than in `app/globals.css` because this section owns
 * measurements no other section reuses, and because the keyframe the scroll cue
 * needs cannot be expressed as a utility class. React hoists it into `<head>`
 * and dedupes it on `href`, so it is emitted exactly once however many times
 * this module renders.
 *
 * Unlayered on purpose: `@import "tailwindcss"` puts every `@utility` in the
 * `utilities` cascade layer, and unlayered rules beat layered ones regardless
 * of specificity. That is the same mechanism `app/fonts.ts` relies on, and it
 * is what lets `.hero-inner` re-declare padding that `.section-inner` sets
 * through a higher-specificity attribute selector.
 *
 * RESPONSIVE (reconciliation § 3.3, authored — the export has no media query
 * at any width):
 *   ≤767   panel full-width, bottom-anchored, 24px padding, vertical scrim
 *   768+   panel min(72%,560px), 40px padding, centred
 *   1024+  panel min(56%,700px), 48px padding, left-anchored
 *   2560+  panel min(40%,640px)
 * Only anchoring and track width move; nothing re-declares a clamp (§ 3.2).
 */
const HERO_CSS = `
.hero-shell {
  min-height: 100dvh;
  display: flex;
  align-items: center;
}

.hero-inner {
  display: flex;
  align-items: flex-end;
  min-height: 100dvh;
  padding-block: clamp(112px, 16vh, 160px) calc(96px + env(safe-area-inset-bottom, 0px));
  padding-inline-start: max(var(--page-x), env(safe-area-inset-left, 0px));
  padding-inline-end: max(var(--page-x), env(safe-area-inset-right, 0px));
}

@media (width >= 768px) {
  .hero-inner { align-items: center; }
}

/* § 3.3 "scrim flips to vertical" below 768. The backdrop's own scrim is the
   radial anchored at 2% 50%, which is authored for a left-anchored panel; this
   layer supplies the vertical wash the bottom-anchored mobile panel needs and
   is switched off the moment the panel moves back to the left. It is additive
   because components/three is owned elsewhere. */
.hero-mobile-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
    180deg,
    rgba(13, 17, 23, 0) 0%,
    rgba(13, 17, 23, 0.55) 46%,
    rgba(13, 17, 23, 0.92) 100%
  );
}

@media (width >= 768px) {
  .hero-mobile-scrim { display: none; }
}

.hero-panel {
  position: relative;
  z-index: 1;
  width: 100%;
}

@media (width >= 768px)  { .hero-panel { width: min(72%, 560px); } }
@media (width >= 1024px) { .hero-panel { width: min(56%, 700px); } }
@media (width >= 2560px) { .hero-panel { width: min(40%, 640px); } }

.hero-eyebrow { margin-bottom: 24px; }

.hero-h1 { margin: 0 0 24px; }

.hero-sub {
  margin: 0 0 32px;
  max-width: 60ch;
  color: var(--fg-1);
  font-size: var(--body-lg);
  line-height: 1.6;
  text-wrap: pretty;
}

.hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 48px;
}

/* A real link at bottom:40px, keyboard reachable, 44px tap target. The mobile
   panel stops 96px above the section floor precisely so this never overlaps
   it. */
.hero-cue {
  position: absolute;
  left: max(var(--page-x), env(safe-area-inset-left, 0px));
  bottom: calc(40px + env(safe-area-inset-bottom, 0px));
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 4px;
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-decoration: none;
  transition: color var(--d-2) var(--ease);
}

.hero-cue:hover,
.hero-cue:focus-visible { color: var(--fg-1); }

.hero-cue-rule {
  display: inline-block;
  flex: none;
  width: 1px;
  height: 32px;
  background: linear-gradient(180deg, var(--line-2), transparent);
  animation: hero-scroll-cue 2.4s ease-in-out infinite;
}

@keyframes hero-scroll-cue {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50%      { transform: translateY(6px); opacity: 1; }
}

/* The cue is the page's only looping animation. Killed in CSS rather than in
   JavaScript so it is static before first paint and without any script at
   all — a JS check would animate for one frame, then stop. */
@media (prefers-reduced-motion: reduce) {
  .hero-cue-rule {
    animation: none;
    transform: none;
    opacity: 1;
  }
}
`

export function Hero({
  eyebrow = HERO_COPY.eyebrow,
  headline = HERO_COPY.headline,
  sub = HERO_COPY.sub,
  kpis = NO_KPIS,
  primaryCta = HERO_COPY.primaryCta,
  secondaryCta = HERO_COPY.secondaryCta,
  scrollCue = HERO_COPY.scrollCue,
}: HeroProps = {}) {
  const hasCtas = primaryCta !== null || secondaryCta !== null

  return (
    <Section
      id="hero"
      formation="monolith"
      labelledBy="hero-h"
      backdrop={<SectionBackdrop formation="monolith" />}
      padding="none"
      divider={false}
      className="hero-shell"
      innerClassName="hero-inner"
    >
      <style href="ws-hero" precedence="medium" data-hero-css="">
        {HERO_CSS}
      </style>

      <div aria-hidden="true" className="hero-mobile-scrim" />

      <Reveal className="hero-panel">
        <GlassCard variant="panel" className="w-full">
          {eyebrow ? <Eyebrow className="hero-eyebrow">{eyebrow}</Eyebrow> : null}

          <h1 id="hero-h" className="type-display-hero hero-h1">
            {headline}
          </h1>

          {sub ? <p className="hero-sub">{sub}</p> : null}

          {hasCtas ? (
            <div className="hero-ctas">
              {primaryCta !== null ? (
                <Button variant="primary" size="lg" href={primaryCta.href}>
                  {primaryCta.label}
                </Button>
              ) : null}
              {secondaryCta !== null ? (
                <Button variant="secondary" size="lg" href={secondaryCta.href}>
                  {secondaryCta.label}
                </Button>
              ) : null}
            </div>
          ) : null}

          {kpis.length > 0 ? (
            <KpiGroup>
              {kpis.map((kpi) => (
                <KpiTile
                  key={kpi.label}
                  variant="hero"
                  label={kpi.label}
                  value={kpi.value}
                  placeholder={kpi.placeholder ?? false}
                />
              ))}
            </KpiGroup>
          ) : null}
        </GlassCard>
      </Reveal>

      {scrollCue !== null ? (
        <a href={scrollCue.href} aria-label={scrollCue.ariaLabel} className="hero-cue">
          <span aria-hidden="true" className="hero-cue-rule" />
          {scrollCue.label}
        </a>
      ) : null}
    </Section>
  )
}
