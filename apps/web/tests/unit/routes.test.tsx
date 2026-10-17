import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import sitemap from '@/app/sitemap'
import { WalkthroughCta } from '@/components/routes/WalkthroughCta'
import { getProjects } from '@/lib/content'
import { breadcrumbJsonLd, caseStudyJsonLd, jsonLdScript, pageMetadata } from '@/lib/route-seo'
import {
  caseStudyParams,
  getCaseStudies,
  getCaseStudy,
  getExcludedPlaceholders,
  getPublishedExperience,
  getSiteRoutes,
  isConfidential,
  resumePdfHref,
} from '@/lib/routes'

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)
vi.mock('next/navigation', () => ({ notFound }))

beforeEach(() => {
  notFound.mockClear()
})

describe('case studies derive from the content', () => {
  it('produces one param per non-placeholder project and none for placeholders', () => {
    const real = getProjects().filter((p) => !p.placeholder).map((p) => p.slug)
    const placeholders = getProjects().filter((p) => p.placeholder).map((p) => p.slug)

    expect(caseStudyParams().map((p) => p.slug)).toEqual(real)
    expect(real.length).toBeGreaterThan(0)
    for (const slug of placeholders) {
      expect(caseStudyParams().map((p) => p.slug)).not.toContain(slug)
      expect(getCaseStudy(slug)).toBeUndefined()
    }
  })

  it('keeps placeholder work and the placeholder career row out of what is published', () => {
    expect(getPublishedExperience().every((entry) => !entry.placeholder)).toBe(true)
    const excluded = getExcludedPlaceholders().map((item) => item.label)
    expect(excluded).toContain('AR Product Visualiser')
  })

  it('treats private and client work as confidential and public work as not', () => {
    for (const project of getCaseStudies()) {
      expect(isConfidential(project)).toBe(project.visibility !== 'public')
    }
  })
})

describe('/work/[slug]', () => {
  it('404s for a slug that is not a case study', async () => {
    const { default: CaseStudyPage } = await import('@/app/work/[slug]/page')

    await expect(CaseStudyPage({ params: Promise.resolve({ slug: 'no-such-project' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    // A placeholder project is not a route either.
    await expect(CaseStudyPage({ params: Promise.resolve({ slug: 'ar-product-visualiser' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(notFound).toHaveBeenCalledTimes(2)
  })

  it('does not accept slugs outside generateStaticParams', async () => {
    const page = await import('@/app/work/[slug]/page')
    expect(page.dynamicParams).toBe(false)
    expect(page.generateStaticParams()).toEqual(caseStudyParams())
  })

  it('offers a private walkthrough on confidential work and omits sections it has no content for', async () => {
    const { default: CaseStudyPage } = await import('@/app/work/[slug]/page')
    const confidential = getCaseStudies().find((p) => isConfidential(p))
    if (confidential === undefined) throw new Error('the content has no confidential case study to test')

    const tree = await CaseStudyPage({ params: Promise.resolve({ slug: confidential.slug }) })
    const { container, getByRole, queryByRole } = render(tree)

    expect(getByRole('heading', { level: 1, name: confidential.name })).toBeInTheDocument()
    expect(getByRole('link', { name: /private walkthrough/i })).toHaveAttribute('href', '/#contact')
    // The content has no outcome metrics and no links for this project, so neither section exists.
    expect(queryByRole('heading', { name: 'Outcomes' })).toBeNull()
    expect(queryByRole('heading', { name: 'Links' })).toBeNull()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })

  it('shows the public project links and no walkthrough', async () => {
    const { default: CaseStudyPage } = await import('@/app/work/[slug]/page')
    const tree = await CaseStudyPage({ params: Promise.resolve({ slug: 'pr-pulse' }) })
    const { getByRole, queryByRole } = render(tree)

    expect(getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/JxstWieslaw/PR-Pulse')
    expect(queryByRole('link', { name: /private walkthrough/i })).toBeNull()
  })

  it('walkthrough CTA points at the contact section', () => {
    const { getByRole } = render(<WalkthroughCta projectName="Example" />)
    expect(getByRole('link', { name: 'Ask for a private walkthrough' })).toHaveAttribute('href', '/#contact')
  })
})

describe('sitemap', () => {
  it('lists every route and nothing that does not exist', () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname)

    expect(urls).toEqual(expect.arrayContaining(['/', '/work', '/about', '/resume']))
    for (const { slug } of caseStudyParams()) expect(urls).toContain(`/work/${slug}`)
    expect(urls).toHaveLength(4 + caseStudyParams().length)
    expect(urls.some((url) => url.startsWith('/admin') || url.startsWith('/lab'))).toBe(false)
    expect(urls).not.toContain('/work/ar-product-visualiser')
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('does not stamp every build with the current time', () => {
    for (const entry of sitemap()) expect(entry.lastModified).toBeUndefined()
    expect(getSiteRoutes().every((route) => route.priority > 0 && route.priority <= 1)).toBe(true)
  })
})

describe('/resume', () => {
  const webRoot = process.cwd()

  it('ships a print stylesheet that hides the site chrome', () => {
    const css = readFileSync(path.join(webRoot, 'app/resume/resume-print.css'), 'utf8')
    expect(css).toContain('@media print')
    expect(css).toMatch(/body > header/)
    expect(css).toMatch(/body > footer/)

    const page = readFileSync(path.join(webRoot, 'app/resume/page.tsx'), 'utf8')
    expect(page).toContain("import './resume-print.css'")

    const moduleCss = readFileSync(path.join(webRoot, 'components/routes/route.module.css'), 'utf8')
    expect(moduleCss).toContain('@media print')
  })

  it('offers a PDF only when one exists in public', () => {
    expect(resumePdfHref(path.join(webRoot, 'public'))).toBeUndefined()
    expect(resumePdfHref(path.join(webRoot, 'tests/fixtures'))).toBeUndefined()
  })
})

describe('route SEO', () => {
  it('builds canonical, openGraph and twitter metadata without hand-setting an image', () => {
    const meta = pageMetadata({ title: 'About', description: 'd', path: '/about' })

    expect(String(meta.alternates?.canonical)).toMatch(/\/about$/)
    expect(meta.openGraph).toMatchObject({ title: 'About — Wieslaw Samushonga', siteName: 'Wieslaw Samushonga' })
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(meta.openGraph).not.toHaveProperty('images')
  })

  it('escapes script-closing sequences in JSON-LD', () => {
    const script = jsonLdScript({ name: '</script><b>x</b>' })
    expect(script).not.toContain('<')
    expect(JSON.parse(script)).toEqual({ name: '</script><b>x</b>' })
  })

  it('describes a case study with only its own facts', () => {
    const [project] = getCaseStudies()
    if (project === undefined) throw new Error('no case studies')
    const ld = caseStudyJsonLd(project)

    expect(ld['@type']).toBe('CreativeWork')
    expect(ld['name']).toBe(project.name)
    expect(ld['description']).toBe(project.summary)
    expect(ld).not.toHaveProperty('datePublished')
  })

  it('numbers breadcrumb positions from 1', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Work', path: '/work' },
    ]) as { itemListElement: { position: number }[] }
    expect(ld.itemListElement.map((item) => item.position)).toEqual([1, 2])
  })
})
