import type { Metadata } from 'next'

import { Container } from '@/components/layout/Container'
import { JsonLd } from '@/components/routes/JsonLd'
import { PageHeader } from '@/components/routes/PageHeader'
import styles from '@/components/routes/route.module.css'
import { BulletList } from '@/components/ui/BulletList'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { countDomainsShipped, getProfile, getSkills } from '@/lib/content'
import { formatPeriod } from '@/lib/format-period'
import { breadcrumbJsonLd, pageMetadata, profilePageJsonLd } from '@/lib/route-seo'
import { getPublishedExperience, resumePdfHref } from '@/lib/routes'

/**
 * About: composed entirely from the profile, experience and skills content. There is no separate
 * narrative file yet (an owner input), so the page says what the content says and no more.
 * The "Earlier engineering roles" aggregate is a placeholder in the content and is left out.
 */

function aboutDescription(): string {
  const profile = getProfile()
  const roles = profile.roles.map((role) => `${role.title} at ${role.org}`).join(' and ')
  return `${roles}, based in ${profile.location}. Technical direction, code review and mentorship, and real-time 3D on the web.`
}

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'About',
    description: aboutDescription(),
    path: '/about',
    ogType: 'profile',
  })
}

export default function AboutPage() {
  const profile = getProfile()
  const skills = getSkills()
  const experience = getPublishedExperience()
  const identities = profile.links.filter(
    (link) => link.kind === 'primary' && !link.url.startsWith('mailto:'),
  )
  const pdf = resumePdfHref()

  return (
    <article className={styles.page} aria-labelledby="page-h">
      <Container>
        <PageHeader
          crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
          eyebrow="About"
          title={profile.name}
          lede={profile.headline}
        >
          <Button href="/#contact" variant="primary" size="lg" trailing="→">
            Get in touch
          </Button>
          <Button href="/resume" variant="secondary" size="lg">
            Resume
          </Button>
        </PageHeader>

        <section className={styles.block} aria-labelledby="now-h">
          <h2 id="now-h" className="type-h3 mb-6">
            What I do
          </h2>
          <p className={styles.prose}>{profile.sub}</p>
          <dl className={`${styles.facts} mt-8`}>
            {profile.roles.map((role) => (
              <div key={`${role.org}-${role.title}`}>
                <dt>{role.org}</dt>
                <dd>{role.title}</dd>
              </div>
            ))}
            <div>
              <dt>Based in</dt>
              <dd>{profile.location}</dd>
            </div>
            <div>
              <dt>Domains shipped</dt>
              <dd>{countDomainsShipped()}</dd>
            </div>
            {profile.availability === undefined ? null : (
              <div>
                <dt>Availability</dt>
                <dd>{profile.availability}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className={styles.block} aria-labelledby="path-h">
          <h2 id="path-h" className="type-h3 mb-6">
            Where I have worked
          </h2>
          <ol className="m-0 grid list-none gap-6 p-0">
            {experience.map((entry) => (
              <li key={`${entry.org}-${entry.title}-${entry.period.from}`}>
                <GlassCard as="div" variant="pillar">
                  <div className={styles.roleHead}>
                    <h3 className="type-bento-standard m-0">
                      {entry.title}, {entry.org}
                    </h3>
                    <span className={styles.period}>{formatPeriod(entry.period)}</span>
                  </div>
                  <BulletList variant="timeline" className="mt-4" items={entry.highlights} />
                </GlassCard>
              </li>
            ))}
          </ol>
          <p className="mt-6">
            <a href="/resume" className="underline underline-offset-4">
              The full career timeline is on the resume page
            </a>
            {pdf === undefined ? null : (
              <>
                {' '}
                <a href={pdf} className="underline underline-offset-4">
                  (PDF)
                </a>
              </>
            )}
            .
          </p>
        </section>

        <section className={styles.block} aria-labelledby="skills-h">
          <h2 id="skills-h" className="type-h3 mb-6">
            What I work with
          </h2>
          <dl className={styles.skills}>
            {skills.map((group) => (
              <div key={group.id}>
                <Eyebrow as="dt" tone="violet">
                  {group.label}
                </Eyebrow>
                <dd className="m-0">
                  <ul className={styles.chips}>
                    {group.items.map((item) => (
                      <li key={item.name}>
                        <Chip variant="tier" tier={item.level}>
                          {item.name}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.block} aria-labelledby="elsewhere-h">
          <h2 id="elsewhere-h" className="type-h3 mb-2">
            Elsewhere
          </h2>
          <div className={styles.actions}>
            {identities.map((link) => (
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
      </Container>

      <JsonLd data={profilePageJsonLd()} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ])}
      />
    </article>
  )
}
