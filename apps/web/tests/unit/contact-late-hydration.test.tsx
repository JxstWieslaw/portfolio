import { act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from '@/components/sections/ContactForm'
import { ContactFormLazy } from '@/components/sections/ContactFormLazy'

/**
 * The contact form hydrates late (`LateIsland`): its server markup is in the page, usable as plain fields, and React
 * attaches to those same nodes when the chunk lands. jsdom cannot run the Next SSR path, so the server HTML is
 * rendered here the way the server does it: the real form inside the island's `display: contents` wrapper. (The built
 * page was compared against the eager one: the only difference is that wrapper.)
 */

const EMAIL = 'hello@example.com'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing element')
  return value
}

function serverHost(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<div data-late-island="contact-form" style="display:contents">${renderToString(
    <ContactForm email={EMAIL} />,
  )}</div>`
  document.body.appendChild(host)
  return host
}

async function hydrate(host: HTMLElement, onHandOff: (href: string) => void) {
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(host, <ContactFormLazy email={EMAIL} onHandOff={onHandOff} />)
  })
  return root
}

async function flush(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

describe('Contact form, late hydration', () => {
  it('hydrates the page without the form, keeps the server nodes, and hydrates the form on first interaction', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onHandOff = vi.fn()
    const host = serverHost()
    const email = must(host.querySelector<HTMLInputElement>('#c-email'))
    const message = must(host.querySelector<HTMLTextAreaElement>('#c-msg'))

    const root = await hydrate(host, onHandOff)
    await flush()

    // Before any interaction: no form code has run (no React props on the fields), the server DOM is untouched.
    expect(Object.keys(email).some((key) => key.startsWith('__reactProps'))).toBe(false)
    expect(host.querySelector('#c-email')).toBe(email)

    // The visitor types straight into the server-rendered field, then focuses it: that starts the load.
    email.value = 'ada@example.com'
    message.value = 'Hello there'
    await act(async () => {
      email.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    await flush()

    expect(Object.keys(email).some((key) => key.startsWith('__reactProps'))).toBe(true)
    expect(host.querySelector('#c-email')).toBe(email)
    expect(email.value).toBe('ada@example.com')
    expect(message.value).toBe('Hello there')

    await act(async () => {
      must(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onHandOff).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String(onHandOff.mock.calls[0]?.[0]))).toContain('Hello there')

    act(() => root.unmount())
    errors.mockRestore()
  })

  it('holds back a submit that arrives before hydration and replays it once the form is live', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onHandOff = vi.fn()
    const host = serverHost()
    const form = must(host.querySelector('form'))
    const email = must(host.querySelector<HTMLInputElement>('#c-email'))
    email.value = 'ada@example.com'
    // jsdom has no requestSubmit-to-event wiring we can rely on across versions: make it raise a cancelable submit.
    form.requestSubmit = () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    }

    const root = await hydrate(host, onHandOff)

    // Submitting before the form code exists: the browser's own navigation is cancelled, nothing is sent yet.
    const early = new Event('submit', { bubbles: true, cancelable: true })
    await act(async () => {
      form.dispatchEvent(early)
    })
    expect(early.defaultPrevented).toBe(true)

    await flush(100)

    // Once the form is live the held submit goes through the real handler.
    expect(onHandOff).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String(onHandOff.mock.calls[0]?.[0]))).toContain('ada@example.com')

    act(() => root.unmount())
    errors.mockRestore()
  })

  it('hydrates when the island nears the viewport', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let notify: (entries: Array<{ isIntersecting: boolean }>) => void = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          notify = callback
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const host = serverHost()
    const email = must(host.querySelector<HTMLInputElement>('#c-email'))
    const root = await hydrate(host, vi.fn())

    expect(Object.keys(email).some((key) => key.startsWith('__reactProps'))).toBe(false)
    await act(async () => notify([{ isIntersecting: true }]))
    await flush()
    expect(Object.keys(email).some((key) => key.startsWith('__reactProps'))).toBe(true)

    act(() => root.unmount())
    errors.mockRestore()
  })
})
