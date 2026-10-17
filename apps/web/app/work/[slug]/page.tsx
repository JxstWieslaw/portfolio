import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ProjectCard } from '@/components/cards/ProjectCard'
import { Container } from '@/components/layout/Container'
import { JsonLd } from '@/components/routes/JsonLd'
import { PageHeader } from '@/components/routes/PageHeader'
import styles from '@/components/routes/route.module.css'
import { WalkthroughCta } from '@/components/routes/WalkthroughCta'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { TechTag, TechTagList } from '@/components/ui/TechTag'
import { accentForDomain } from '@/lib/accent'
import { getDomain } from '@/lib/content'
import { formatPeriod } from '@/lib/format-period'
import { breadcrumbJsonLd, caseStudyJsonLd, pageMetadata } from '@/lib/route-seo'
import { caseStudyParams, getCaseStudies, getCaseStudy, isConfidential } from '@/lib/routes'

/**
 * A case study.
 *
 * Statically generated for every non-placeholder project and nothing else: `dynamicParams = false`
 * turns any other slug into a 404, and the `notFound()` below is the second guard if the page is
 * ever rendered another way.
 *
 * The page shows only what the project record holds: role, period, domain, stack, summary, links
 * and outcome metrics. A section whose content is absent is omitted; none is ever filled in.
 * Server-rendered end to end: no client component, so it reads with JavaScript off.
 */

export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return caseStudyParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const project = getCaseStudy(slug)
  if (project === undefined) return {}

  return pageMetadata({
    title: `${project.name}: case study`,
    description: project.summary,
    path: `/work/${project.slug}`,
    ogType: 'article',
  })
}

/** The case studies that follow this one in authored order, wrapping round. At most two. */
function moreWork(slug: string) {
  const all = getCaseStudies()
  const at = all.findIndex((project) => project.slug === slug)
  const picked = [1, 2]
    .map((offset) => all[(at + offset) % all.length])
    .filter((project): project is NonNullable<typeof project> => project !== undefined && project.slug !== slug)
  return picked.filter((project, index) => picked.findIndex((p) => p.slug === project.slug) === index)
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params
  const project = getCaseStudy(slug)
  if (project === undefined) notFound()

  const domain = getDomain(project.domain)
  const confidential = isConfidential(project)
  const outcomes = project.outcome.filter((metric) => !metric.placeholder)
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Work', href: '/work' }, { label: project.name }]

  return (
    <article className={styles.page} aria-labelledby="page-h">
      <Container>
        <PageHeader
          crumbs={crumbs}
          eyebrow={domain?.label ?? 'Case study'}
          title={project.name}
          lede={project.summary}
          tone={domain?.accent ?? 'violet'}
        >
          <Badge status={confidential ? 'client' : 'public'} />
          {domain === undefined ? null : (
            <Chip variant="domain" size="sm" tone={accentForDomain(domain.id)}>
              {domain.label}
            </Chip>
          )}
        </PageHeader>

        <section className={styles.block} aria-labelledby="facts-h">
          <h2 id="facts-h" className="type-h3 mb-6">
            At a glance
          </h2>
          <dl className={styles.facts}>
            <div>
              <dt>Role</dt>
              <dd>{project.role}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{formatPeriod(project.period)}</dd>
            </div>
            {domain === undefined ? null : (
              <div>
                <dt>Domain</dt>
                <dd>{domain.label}</dd>
              </div>
            )}
            <div>
              <dt>Access</dt>
              <dd>{confidential ? 'Client codebase, not public' : 'Public'}</dd>
            </div>
          </dl>
          {domain === undefined ? null : <p className={`${styles.prose} mt-6`}>{domain.blurb}</p>}
        </section>

        <section className={styles.block} aria-labelledby="stack-h">
          <h2 id="stack-h" className="type-h3 mb-6">
            Stack
          </h2>
          <TechTagList className="!mb-0">
            {project.stack.map((item) => (
              <TechTag key={item}>{item}</TechTag>
            ))}
          </TechTagList>
        </section>

        {outcomes.length === 0 ? null : (
          <section className={styles.block} aria-labelledby="outcomes-h">
            <h2 id="outcomes-h" className="type-h3 mb-6">
              Outcomes
            </h2>
            <dl className={styles.facts}>
              {outcomes.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd className="type-h3">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {project.links.length === 0 ? null : (
          <section className={styles.block} aria-labelledby="links-h">
            <h2 id="links-h" className="type-h3 mb-2">
              Links
            </h2>
            <div className={styles.actions}>
              {project.links.map((link) => (
                <Button
                  key={link.url}
                  href={link.url}
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  trailing="↗"
                >
                  {link.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        {confidential ? (
          <div className={styles.block}>
            <WalkthroughCta projectName={project.name} />
          </div>
        ) : null}

        <section className={styles.block} aria-labelledby="more-h">
          <h2 id="more-h" className="type-h3 mb-6">
            More work
          </h2>
          <ul className={styles.cardGrid}>
            {moreWork(project.slug).map((other) => (
              <li key={other.slug}>
                <ProjectCard
                  slug={other.slug}
                  name={other.name}
                  summary={other.summary}
                  stack={other.stack}
                  visibility={other.visibility}
                  domain={{
                    id: other.domain,
                    label: getDomain(other.domain)?.label ?? other.domain,
                    accent: getDomain(other.domain)?.accent ?? 'violet',
                  }}
                  href={`/work/${other.slug}`}
                />
              </li>
            ))}
          </ul>
          <div className={`${styles.actions} mt-6`}>
            <Button href="/work" variant="secondary">
              All work
            </Button>
          </div>
        </section>
      </Container>

      <JsonLd data={caseStudyJsonLd(project)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
          { name: project.name, path: `/work/${project.slug}` },
        ])}
      />
    </article>
  )
}
