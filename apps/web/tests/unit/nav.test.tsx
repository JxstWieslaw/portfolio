import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Nav } from '@/components/layout/Nav'
import { NAV_CTA, NAV_ITEMS } from '@/lib/nav-items'

/**
 * What is worth testing here is the behaviour the export did not ship and the
 * copy the export got wrong:
 *
 *  - the condense threshold is 24, not the M0 plan's 80;
 *  - the labels are the reconciled set (`How I lead`, `#timeline`);
 *  - the scroll-spy marks one section and never flickers to none;
 *  - the sheet opens, traps, closes on Escape and hands focus back.
 *
 * jsdom 30 ships `HTMLDialogElement` and the `dialog:not([open])` UA rule but
 * NOT `showModal`/`close`, which is precisely the environment `BottomSheet`
 * degrades for — so these tests exercise the fallback path rather than a
 * polyfill of it, and the modal path is the one that is never reached here.
 */

const SOCIAL = [
  { label: 'LinkedIn', url: 'https://linkedin.com/in/wieslaw-samushonga-3b3913154' },
  { label: 'GitHub', url: 'https://github.com/JxstWieslaw' },
] as const

function setScrollY(value: number): void {
  Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true })
}

type FakeEntry = {
  target: Element
  isIntersecting: boolean
  intersectionRect: { height: number }
}

type ObserverHandle = {
  fire: (entries: readonly FakeEntry[]) => void
  options: () => IntersectionObserverInit | undefined
  observed: () => Element[]
}

/** Installs a controllable IntersectionObserver and returns the handle. */
function stubIntersectionObserver(): ObserverHandle {
  let callback: ((entries: readonly FakeEntry[]) => void) | null = null
  let options: IntersectionObserverInit | undefined
  const observed: Element[] = []

  class FakeIntersectionObserver {
    constructor(cb: (entries: readonly FakeEntry[]) => void, init?: IntersectionObserverInit) {
      callback = cb
      options = init
    }
    observe(target: Element): void {
      observed.push(target)
    }
    unobserve(): void {}
    disconnect(): void {
      observed.length = 0
    }
    takeRecords(): FakeEntry[] {
      return []
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

  return {
    fire(entries) {
      if (callback === null) throw new Error('IntersectionObserver was never constructed')
      callback(entries)
    },
    options: () => options,
    observed: () => [...observed],
  }
}

/** The sections the spy observes. Rendered outside the Nav, as on the page. */
function mountSections(ids: readonly string[]): HTMLElement {
  const host = document.createElement('div')
  for (const id of ids) {
    const section = document.createElement('section')
    section.id = id
    host.append(section)
  }
  document.body.append(host)
  return host
}

function entry(id: string, height: number, isIntersecting = true): FakeEntry {
  const target = document.getElementById(id)
  if (target === null) throw new Error(`no section #${id}`)
  return { target, isIntersecting, intersectionRect: { height } }
}

function sheet(): HTMLDialogElement {
  const dialog = document.querySelector('dialog')
  if (dialog === null) throw new Error('the sheet is not in the document')
  return dialog as HTMLDialogElement
}

beforeEach(() => {
  setScrollY(0)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.body.style.overflow = ''
})

describe('Nav — structure and copy', () => {
  it('is a banner whose monogram points at the main landmark', () => {
    render(<Nav />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wieslaw samushonga — home/i })).toHaveAttribute(
      'href',
      '#main'
    )
  })

  // Reconciliation § 1: the export says "How I work" and `#experience`. Both
  // were rejected. This is the test that catches a copy-paste from the export.
  it('carries the reconciled labels and ids, in order', () => {
    render(<Nav />)
    const primary = screen.getByRole('navigation', { name: 'Primary' })
    const links = Array.from(primary.querySelectorAll('a'))

    expect(links.map((link) => link.textContent)).toEqual([
      'Work',
      'How I lead',
      'Craft',
      'Stack',
      'Experience',
      'Writing',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#work',
      '#lead',
      '#craft',
      '#stack',
      '#timeline',
      '#writing',
    ])
  })

  it('rejects the two values the export shipped', () => {
    const labels = NAV_ITEMS.map((item) => item.label)
    const hrefs = NAV_ITEMS.map((item) => item.href)
    expect(labels).not.toContain('How I work')
    expect(hrefs).not.toContain('#experience')
  })

  it('renders the CTA outside the nav landmark, pointing at contact', () => {
    render(<Nav />)
    const cta = screen.getByRole('link', { name: NAV_CTA.label })
    expect(cta).toHaveAttribute('href', '#contact')
    expect(screen.getByRole('navigation', { name: 'Primary' }).contains(cta)).toBe(false)
  })

  it('shows the pill row only from 1024 and the menu button only below it', () => {
    render(<Nav />)
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).toContain('hidden')
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).toContain('lg:flex')

    const trigger = screen.getByRole('button', { name: /open menu/i })
    expect(trigger.parentElement?.className).toContain('lg:hidden')
  })
})

describe('Nav — scroll condense', () => {
  it('condenses past 24px of scroll and not at 24 exactly', async () => {
    render(<Nav />)
    const header = screen.getByRole('banner')
    expect(header).toHaveAttribute('data-condensed', 'false')

    setScrollY(24)
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => {
      expect(header).toHaveAttribute('data-condensed', 'false')
    })

    setScrollY(25)
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => {
      expect(header).toHaveAttribute('data-condensed', 'true')
    })

    setScrollY(0)
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => {
      expect(header).toHaveAttribute('data-condensed', 'false')
    })
  })

  it('reads the condensed state from the DOM on mount rather than waiting for a scroll', async () => {
    setScrollY(400)
    render(<Nav />)
    await waitFor(() => {
      expect(screen.getByRole('banner')).toHaveAttribute('data-condensed', 'true')
    })
  })

  // The measurements from design-home.md § 2. Class assertions are the only way
  // to pin them without a layout engine, and a silent drift here is a
  // visual regression nobody would notice.
  it('pins the two heights, the two backgrounds and the appearing hairline', () => {
    render(<Nav />)
    const header = screen.getByRole('banner').className

    expect(header).toContain('h-[72px]')
    expect(header).toContain('data-[condensed=true]:h-[56px]')
    expect(header).toContain('bg-[rgba(13,17,23,0.35)]')
    expect(header).toContain('data-[condensed=true]:bg-[rgba(13,17,23,0.88)]')
    expect(header).toContain('border-transparent')
    expect(header).toContain('data-[condensed=true]:border-[var(--line-1)]')
    // blur(12px) in BOTH states, so it is unconditional.
    expect(header).toContain('backdrop-blur-[12px]')
    expect(header).toContain('sticky')
    expect(header).toContain('top-0')
    expect(header).toContain('z-50')
  })
})

describe('Nav — active section', () => {
  it('observes every section id with a band that clears the header', () => {
    const observer = stubIntersectionObserver()
    mountSections(NAV_ITEMS.map((item) => item.id))
    render(<Nav />)

    expect(observer.observed().map((element) => element.id)).toEqual([
      'work',
      'lead',
      'craft',
      'stack',
      'timeline',
      'writing',
    ])
    expect(observer.options()?.rootMargin).toBe('-72px 0px -55% 0px')
  })

  it('marks the section covering the most of the band with aria-current', async () => {
    const observer = stubIntersectionObserver()
    mountSections(NAV_ITEMS.map((item) => item.id))
    render(<Nav />)

    observer.fire([entry('work', 240), entry('lead', 40)])
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Work' })[0]).toHaveAttribute(
        'aria-current',
        'true'
      )
    })
    expect(screen.getAllByRole('link', { name: 'Craft' })[0]).not.toHaveAttribute('aria-current')

    observer.fire([entry('work', 0, false), entry('lead', 280)])
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'How I lead' })[0]).toHaveAttribute(
        'aria-current',
        'true'
      )
    })
    expect(screen.getAllByRole('link', { name: 'Work' })[0]).not.toHaveAttribute('aria-current')
  })

  // Coverage, not ratio. A short section clipping the band reports a far higher
  // intersectionRatio than a tall one filling it, which would drag the mark
  // backwards on every scroll down.
  it('prefers the section covering more pixels, not the smaller one', async () => {
    const observer = stubIntersectionObserver()
    mountSections(NAV_ITEMS.map((item) => item.id))
    render(<Nav />)

    observer.fire([entry('craft', 288), entry('stack', 100)])
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Craft' })[0]).toHaveAttribute(
        'aria-current',
        'true'
      )
    })
  })

  it('never clears the mark when nothing covers the band', async () => {
    const observer = stubIntersectionObserver()
    mountSections(NAV_ITEMS.map((item) => item.id))
    render(<Nav />)

    observer.fire([entry('stack', 200)])
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Stack' })[0]).toHaveAttribute(
        'aria-current',
        'true'
      )
    })

    // The gap between two sections during a fast scroll.
    observer.fire([entry('stack', 0, false)])
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Stack' })[0]).toHaveAttribute(
        'aria-current',
        'true'
      )
    })
  })

  it('marks exactly one section at a time, in both the row and the sheet', async () => {
    const observer = stubIntersectionObserver()
    mountSections(NAV_ITEMS.map((item) => item.id))
    render(<Nav />)

    observer.fire([entry('writing', 300), entry('timeline', 120)])
    await waitFor(() => {
      expect(document.querySelectorAll('a[aria-current="true"]')).toHaveLength(2)
    })
    for (const marked of Array.from(document.querySelectorAll('a[aria-current="true"]'))) {
      expect(marked.textContent).toBe('Writing')
    }
  })
})

describe('Nav — bottom sheet', () => {
  it('opens on the menu button and reports it on the trigger', async () => {
    const user = userEvent.setup()
    render(<Nav socialLinks={SOCIAL} />)
    const trigger = screen.getByRole('button', { name: /open menu/i })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(sheet()).not.toHaveAttribute('open')

    await user.click(trigger)

    expect(sheet()).toHaveAttribute('open')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger.getAttribute('aria-controls')).toBe(sheet().id)
  })

  it('holds the six section links and the social links', async () => {
    const user = userEvent.setup()
    render(<Nav socialLinks={SOCIAL} />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))

    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect(Array.from(sections.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '#work',
      '#lead',
      '#craft',
      '#stack',
      '#timeline',
      '#writing',
    ])

    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(sheet().contains(github)).toBe(true)
    expect(github).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('moves focus into the sheet on open', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(sheet().contains(document.activeElement)).toBe(true)
  })

  it('traps Tab and Shift+Tab inside the sheet', async () => {
    const user = userEvent.setup()
    render(<Nav socialLinks={SOCIAL} />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))

    const focusables = Array.from(
      sheet().querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    expect(first).toBeDefined()
    expect(last).toBeDefined()
    if (first === undefined || last === undefined) return

    last.focus()
    await user.tab()
    expect(document.activeElement).toBe(first)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    const trigger = screen.getByRole('button', { name: /open menu/i })

    await user.click(trigger)
    expect(sheet()).toHaveAttribute('open')

    await user.keyboard('{Escape}')

    expect(sheet()).not.toHaveAttribute('open')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when a section link inside it is followed', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    const trigger = screen.getByRole('button', { name: /open menu/i })
    await user.click(trigger)

    const link = screen.getByRole('navigation', { name: 'Sections' }).querySelector('a[href="#work"]')
    expect(link).not.toBeNull()
    if (link !== null) await user.click(link)

    expect(sheet()).not.toHaveAttribute('open')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on the Close button', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(sheet()).not.toHaveAttribute('open')
  })

  it('locks the page behind it and restores the previous overflow', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'scroll'
    render(<Nav />)

    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('releases the scroll lock if it unmounts while open', async () => {
    const user = userEvent.setup()
    const view = render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(document.body.style.overflow).toBe('hidden')

    view.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  // Reduced motion drops the slide and keeps the fade. The translate utilities
  // must never appear ungated; the opacity ones must never be gated.
  it('gates the slide behind motion-safe and leaves the fade unconditional', () => {
    render(<Nav />)
    const classes = sheet().className

    expect(classes).toContain('motion-safe:translate-y-full')
    expect(classes).toContain('motion-safe:data-[open=true]:translate-y-0')
    expect(classes.split(/\s+/u)).not.toContain('translate-y-full')
    expect(classes.split(/\s+/u)).not.toContain('translate-y-0')

    expect(classes).toContain('opacity-0')
    expect(classes).toContain('data-[open=true]:opacity-100')
  })

  it('keeps the sheet clear of the home indicator', async () => {
    const user = userEvent.setup()
    render(<Nav />)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    const panel = sheet().firstElementChild
    expect(panel?.className).toContain('pb-[calc(24px+env(safe-area-inset-bottom))]')
  })
})
