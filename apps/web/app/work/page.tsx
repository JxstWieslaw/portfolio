import type { Metadata } from 'next'

import { ProjectCard } from '@/components/cards/ProjectCard'
import { Container } from '@/components/layout/Container'
import { JsonLd } from '@/components/routes/JsonLd'
import { PageHeader } from '@/components/routes/PageHeader'
import styles from '@/components/routes/route.module.css'
import { getDomain } from '@/lib/content'
import { breadcrumbJsonLd, pageMetadata } from '@/lib/route-seo'
import { getCaseStudies } from '@/lib/routes'

/**
 * The work index: every project that has a case-study page, in authored order.
 *
 * The list is `getCaseStudies()`, so a project flagged `placeholder` is absent here exactly as it
 * is absent from `/work/[slug]` and the sitemap. Static and server-rendered.
 */

const DESCRIPTION =
  'Case studies across healthcare, education, creator tooling, procurement, social services, ' +
  'developer tooling and real-time 3D. Most are client codebases; each page says what can be shared.'

export const metadata: Metadata = pageMetadata({
  title: 'Work',
  description: DESCRIPTION,
  path: '/work',
})

export default function WorkIndexPage() {
  const projects = getCaseStudies()

  return (
    <div className={styles.page}>
      <Container>
        <PageHeader
          crumbs={[{ label: 'Home', href: '/' }, { label: 'Work' }]}
          eyebrow="Work"
          title="Selected work"
          lede="One habit across every domain: decide the architecture early, make every migration reversible, and leave the next engineer a system they can read."
        />

        <section className={styles.block} aria-labelledby="projects-h">
          <h2 id="projects-h" className="type-h3 mb-6">
            {projects.length === 1 ? '1 case study' : `${projects.length} case studies`}
          </h2>

          {projects.length === 0 ? (
            <p className={styles.prose}>
              The case studies are being written. In the meantime, I am happy to walk through any of
              this work on a call.
            </p>
          ) : (
            <ul className={styles.cardGrid} data-cols="3">
              {projects.map((project) => {
                const domain = getDomain(project.domain)
                return (
                  <li key={project.slug}>
                    <ProjectCard
                      slug={project.slug}
                      name={project.name}
                      summary={project.summary}
                      stack={project.stack}
                      visibility={project.visibility}
                      domain={{
                        id: project.domain,
                        label: domain?.label ?? project.domain,
                        accent: domain?.accent ?? 'violet',
                      }}
                      href={`/work/${project.slug}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </Container>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
        ])}
      />
    </div>
  )
}
