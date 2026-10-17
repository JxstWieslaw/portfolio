import type { Metadata } from 'next'

import { Container } from '@/components/layout/Container'
import { JsonLd } from '@/components/routes/JsonLd'
import styles from '@/components/routes/route.module.css'
import { Breadcrumbs } from '@/components/routes/Breadcrumbs'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { getProfile, getSkills } from '@/lib/content'
import { formatPeriod } from '@/lib/format-period'
import { breadcrumbJsonLd, pageMetadata } from '@/lib/route-seo'
import { getCaseStudies, getPublishedExperience, resumePdfHref } from '@/lib/routes'

import './resume-print.css'

/**
 * The resume: the career timeline, skills and selected projects on one clean page that reads on
 * screen and prints as a document.
 *
 * Printing: `resume-print.css` hides the site chrome under `@media print`, and the page's own
 * module hides its buttons and strips the glass and colour. The browser's print dialog ("Save as
 * PDF") is the PDF. A downloadable file is offered only if `public/resume.pdf` exists, which it
 * deliberately does not today.
 *
 * No education section: the content has none, and nothing is invented to fill the gap.
 * The "Earlier engineering roles" aggregate is a placeholder in the content and is not printed.
 */

export function generateMetadata(): Metadata {
  const profile = getProfile()
  const roles = profile.roles.map((role) => `${role.title} at ${role.org}`).join(' and ')

  return pageMetadata({
    title: 'Resume',
    description: `Career timeline, skills and selected projects. ${roles}.`,
    path: '/resume',
  })
}

export default function ResumePage() {
  const profile = getProfile()
  const experience = getPublishedExperience()
  const skills = getSkills()
  const projects = getCaseStudies()
  const pdf = resumePdfHref()
  const contactLinks = profile.links.filter(
    (link) => link.label === 'LinkedIn' || link.label === 'GitHub',
  )

  return (
    <article className={`${styles.page} ${styles.resume}`} aria-labelledby="page-h">
      <Container>
        <div className={styles.printHide}>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Resume' }]} />
        </div>

        <header className="mt-6">
          <Eyebrow tone="violet" className="mb-3">
            Resume
          </Eyebrow>
          <h1 id="page-h" className="type-display-2 mb-3">
            {profile.name}
          </h1>
          <p className="m-0 max-w-[68ch] text-[length:var(--body-lg)] leading-[1.6]">
            {profile.roles.map((role) => `${role.title}, ${role.org}`).join(' · ')}
          </p>
          <p className="mt-3 mb-0 text-[color:var(--fg-2)]">
            {profile.location}
            {' · '}
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            {contactLinks.map((link) => (
              <span key={link.url}>
                {' · '}
                <a href={link.url}>{link.url.replace(/^https?:\/\//, '')}</a>
              </span>
            ))}
          </p>

          <div className={`${styles.actions} ${styles.printHide}`}>
            {pdf === undefined ? null : (
              <a href={pdf} download className="btn" data-variant="primary" data-size="md">
                Download PDF
              </a>
            )}
            <p className={`${styles.printNote} m-0 self-center`}>
              To save a copy, use your browser&apos;s Print command and choose Save as PDF.
            </p>
          </div>
        </header>

        <section className={styles.block} aria-labelledby="experience-h">
          <h2 id="experience-h" className="type-h3">
            Experience
          </h2>
          <ol className="m-0 grid list-none gap-8 p-0">
            {experience.map((entry) => (
              <li key={`${entry.org}-${entry.title}-${entry.period.from}`} className={styles.role}>
                <div className={styles.roleHead}>
                  <h3 className="m-0 text-[length:1.0625rem] font-medium">
                    {entry.title}, {entry.org}
                  </h3>
                  <span className={styles.period}>{formatPeriod(entry.period)}</span>
                </div>
                {entry.location === undefined ? null : (
                  <p className="mt-1 mb-0 text-[color:var(--fg-2)]">{entry.location}</p>
                )}
                <ul className="mt-3 mb-0 grid gap-2 pl-5">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.block} aria-labelledby="skills-h">
          <h2 id="skills-h" className="type-h3">
            Skills
          </h2>
          <dl className="m-0 grid gap-3">
            {skills.map((group) => (
              <div key={group.id} className="grid gap-1 md:grid-cols-[12rem_1fr] md:gap-6">
                <dt className="text-[color:var(--fg-2)]">{group.label}</dt>
                <dd className="m-0">{group.items.map((item) => item.name).join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>

        {projects.length === 0 ? null : (
          <section className={styles.block} aria-labelledby="projects-h">
            <h2 id="projects-h" className="type-h3">
              Selected projects
            </h2>
            <ul className="m-0 grid list-none gap-4 p-0">
              {projects.map((project) => (
                <li key={project.slug} className={styles.role}>
                  <div className={styles.roleHead}>
                    <h3 className="m-0 text-[length:1rem] font-medium">
                      {project.name}, {project.role}
                    </h3>
                    <span className={styles.period}>{formatPeriod(project.period)}</span>
                  </div>
                  <p className="mt-1 mb-0">{project.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Resume', path: '/resume' },
        ])}
      />
    </article>
  )
}
