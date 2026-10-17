import type { Metadata } from 'next'

import { AssemblyLayer } from '@/components/three/AssemblyLayer'
import { DecorativeLayerNote } from '@/components/three/SectionBackdrop'
import { Contact } from '@/components/sections/Contact'
import { Craft } from '@/components/sections/Craft'
import { Hero } from '@/components/sections/Hero'
import { HowILead } from '@/components/sections/HowILead'
import { ProofStrip } from '@/components/sections/ProofStrip'
import { SelectedWork, type SelectedWorkProject } from '@/components/sections/SelectedWork'
import { Stack } from '@/components/sections/Stack'
import { Timeline } from '@/components/sections/Timeline'
import { Writing } from '@/components/sections/Writing'
import {
  getBentoProjects,
  getDomain,
  getDomains,
  getExperience,
  getKpis,
  getProfile,
  getSkills,
  getWriting,
} from '@/lib/content'
import { getCaseStudy } from '@/lib/routes'
import { jsonLdScript } from '@/lib/route-seo'
import { homeJsonLd } from '@/lib/seo'

/**
 * The flagship scroll.
 *
 * The only module that reads `lib/content.ts` for the page's own sections — `app/layout.tsx`
 * separately calls `getProfile()` for the nav and footer, since both wrap every route, not just
 * this one. Every section below takes its data as props, which keeps them pure, testable in
 * isolation, and unaffected when the shared contracts package replaces the loader's
 * locally-mirrored types.
 *
 * Section order is the narrative arc from spec section 2: who → breadth → delivery →
 * leadership → craft → tools → history → voice → action.
 */

/**
 * Only a project with a genuine destination becomes a link.
 *
 * Every non-placeholder project has a case-study page at `/work/<slug>` (`lib/routes.ts` is the
 * single rule for which), so its card links there, including the private client work, where the
 * page offers a private walkthrough instead of the code. A placeholder card renders as the
 * non-interactive "in preparation" card and has no destination. PR-Pulse's own public home is a
 * link on its case-study page.
 */
function toBentoProject(project: ReturnType<typeof getBentoProjects>[number]): SelectedWorkProject {
  const domain = getDomain(project.domain)
  const caseStudy = getCaseStudy(project.slug)

  return {
    slug: project.slug,
    name: project.name,
    summary: project.summary,
    stack: project.stack,
    visibility: project.visibility,
    domain: {
      id: project.domain,
      // A project can only reference a domain that exists — `content-loader.test.ts` asserts
      // referential integrity — so this fallback is unreachable, not a silent default.
      label: domain?.label ?? project.domain,
      accent: domain?.accent ?? 'violet',
    },
    ...(caseStudy === undefined ? {} : { href: `/work/${caseStudy.slug}` }),
    ...(project.placeholder === true
      ? {
          placeholder: true,
          placeholderName: '[AR project name]',
          ariaLabel: 'AR case study, in preparation',
        }
      : {}),
  }
}

/** The home page owns its canonical; deep routes set their own (see app/layout.tsx). */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default function HomePage() {
  const profile = getProfile()

  // The rail's four pills. `Email` is a mailto:, not a profile, so it belongs in Contact.
  const socialPills = profile.links.filter(
    (link) => link.kind === 'primary' && !link.url.startsWith('mailto:'),
  )
  const elsewhereLinks = profile.links.filter((link) => link.kind === 'elsewhere')

  const contactChannels = profile.links
    .filter((link) => link.label === 'LinkedIn' || link.label === 'GitHub')
    .map((link) => ({ label: link.label, value: link.url.replace(/^https?:\/\//, ''), url: link.url }))

  return (
    <>
      {/* The persistent WebGL layer (spec section 4.4). Fixed, aria-hidden, behind every section;
          mounts nothing until the device qualifies, so the 2D canvases remain the fallback. */}
      <AssemblyLayer />

      {/*
        Mounted exactly once for the page. Seven copies — one per SectionBackdrop — would be
        worse than none: a screen reader would announce the same disclaimer at every section.
      */}
      <DecorativeLayerNote />

      <Hero kpis={getKpis('hero')} />

      <ProofStrip domains={getDomains()} kpis={getKpis('proof')} />

      <SelectedWork projects={getBentoProjects().map(toBentoProject)} />

      {/* No `testimonial` prop: the block renders nothing until a real quote exists. Spec
          section 5.7 — fabricated praise is not acceptable on a resume site. */}
      <HowILead />

      {/* `labHref` omitted: /lab is not built, so the link degrades to an announced
          "Coming soon" rather than a 404. */}
      <Craft />

      <Stack groups={getSkills()} />

      <Timeline entries={getExperience()} />

      {/* `feedAttempted` omitted (false): no RSS fetch happens in this milestone, so the third
          card must not claim the feed failed to respond. */}
      <Writing
        articles={getWriting()}
        primaryLinks={socialPills}
        elsewhereLinks={elsewhereLinks}
        feedUrl={profile.links.find((link) => link.label === 'Medium')?.url}
      />

      <Contact
        email={profile.email}
        emailPlaceholder={profile.emailPlaceholder ?? false}
        channels={contactChannels}
      />

      {/*
        JSON-LD last: it is metadata, not content, and keeping it out of the reading order
        means no assistive technology walks it. The graph is a `Person` and its `WebSite`; the `Person` asserts BOTH job titles — collapsing
        them to one would misrepresent the positioning the whole page rests on.
      */}
      {/* jsonLdScript() escapes `<`, so the payload cannot close this tag early even if
          the content later comes from an external feed. See lib/seo.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd()) }}
      />
    </>
  )
}
