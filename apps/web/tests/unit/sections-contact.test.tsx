import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Contact, type ContactChannel } from '@/components/sections/Contact'
import {
  buildMailto,
  HANDOFF_MESSAGE,
  STATUS_CHROME,
  STATUS_MESSAGES,
  SUBMIT_LABELS,
} from '@/components/sections/ContactForm'

const EMAIL = 'wieslaw@rapidevlabs.com'

const CHANNELS: readonly ContactChannel[] = [
  {
    label: 'LinkedIn',
    value: 'Wieslaw Samushonga',
    url: 'https://linkedin.com/in/wieslaw-samushonga-3b3913154',
  },
  { label: 'GitHub', value: 'github.com/JxstWieslaw', url: 'https://github.com/JxstWieslaw' },
]

function mockClipboard(writeText: (value: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'clipboard')
})

/* --- Shell ---------------------------------------------------------------- */

describe('Contact', () => {
  it('declares the ring formation and paints its backdrop', () => {
    const { container } = render(<Contact email={EMAIL} channels={CHANNELS} />)
    const section = container.querySelector('[data-section="contact"]')

    expect(section).toHaveAttribute('data-formation', 'ring')
    expect(container.querySelector('canvas')).toHaveAttribute('data-f', 'ring')
  })

  it('states availability as consulting, not job-hunting', () => {
    render(<Contact email={EMAIL} />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Open to consulting & collaboration.' })
    ).toHaveAttribute('id', 'contact-h')
    expect(screen.getByText(/if it's an interesting problem, I'd like to hear about it/)).toBeInTheDocument()
  })

  it('renders the channel rows and drops any without a real URL', () => {
    render(<Contact email={EMAIL} channels={[...CHANNELS, { label: 'X', value: '@x', url: '#' }]} />)

    expect(screen.getByRole('link', { name: /wieslaw samushonga/i })).toHaveAttribute(
      'href',
      CHANNELS[0]?.url ?? ''
    )
    expect(screen.getByRole('link', { name: /github\.com\/jxstwieslaw/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@x/ })).toBeNull()
  })

  it('marks the provisional address with the dotted convention (OD-5)', () => {
    const { container } = render(<Contact email={EMAIL} emailPlaceholder />)
    expect(screen.getByText(EMAIL)).toHaveClass('placeholder-text')
    expect(container.querySelectorAll('.placeholder-text')).toHaveLength(1)
  })
})

/* --- Copy email ----------------------------------------------------------- */

describe('Contact — copy email', () => {
  it('copies the address and reverts the label after 2000ms', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined)
    mockClipboard(writeText)

    render(<Contact email={EMAIL} />)
    const button = screen.getByRole('button', { name: /copy/i })

    await act(async () => {
      fireEvent.click(button)
    })

    expect(writeText).toHaveBeenCalledWith(EMAIL)
    expect(screen.getByText('Copied')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.queryByText('Copied')).toBeNull()
  })

  // The export set `copied: true` unconditionally with a silent catch. Saying
  // an address is on the clipboard when the write was rejected costs the
  // visitor a paste that yields nothing and no way to find out why.
  it('never claims a copy that did not happen', async () => {
    mockClipboard(vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error('denied')))

    render(<Contact email={EMAIL} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    })

    expect(screen.queryByText('Copied')).toBeNull()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})

/* --- The form ------------------------------------------------------------- */

describe('Contact — form', () => {
  it('labels every field and ships the form unvalidated by the browser', () => {
    const { container } = render(<Contact email={EMAIL} />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
    expect(container.querySelector('form')).toHaveAttribute('noValidate')
  })

  it('announces an unusable address through role="alert" and sends nothing', async () => {
    const user = userEvent.setup()
    const handOff = vi.fn<(href: string) => void>()
    render(<Contact email={EMAIL} onHandOff={handOff} />)

    await user.type(screen.getByLabelText('Email'), 'not-an-address')
    await user.click(screen.getByRole('button', { name: SUBMIT_LABELS.idle }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Enter an email address I can reply to.')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'c-email-err')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(handOff).not.toHaveBeenCalled()
  })

  /**
   * The single most important assertion in this section. The export mocked a
   * 1200ms latency and then rendered "Sent". M0 has no API: nothing leaves the
   * browser, so nothing may claim that anything did.
   */
  it('never reports success in M0 and hands off to mailto instead', async () => {
    const user = userEvent.setup()
    const handOff = vi.fn<(href: string) => void>()
    render(<Contact email={EMAIL} onHandOff={handOff} />)

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Message'), 'Lets build something')
    await user.click(screen.getByRole('button', { name: SUBMIT_LABELS.idle }))

    expect(handOff).toHaveBeenCalledTimes(1)
    const href = handOff.mock.calls[0]?.[0] ?? ''
    expect(href.startsWith(`mailto:${EMAIL}?`)).toBe(true)
    expect(href).toContain(encodeURIComponent('Lets build something'))
    expect(href).toContain(encodeURIComponent('Ada'))
    expect(href).toContain(encodeURIComponent('ada@example.com'))

    expect(screen.queryByText(SUBMIT_LABELS.success)).toBeNull()
    expect(screen.queryByText(STATUS_MESSAGES.success(EMAIL))).toBeNull()

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(HANDOFF_MESSAGE)
    expect(status).toHaveAttribute('data-status', 'offline')
    expect(screen.getByRole('link', { name: /open your mail app/i })).toHaveAttribute(
      'href',
      href
    )
  })

  it('keeps the export wording only when the visitor really is offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const user = userEvent.setup()
    render(<Contact email={EMAIL} onHandOff={vi.fn<(href: string) => void>()} />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: SUBMIT_LABELS.idle }))

    expect(screen.getByRole('status')).toHaveTextContent(STATUS_MESSAGES.offline(EMAIL))
    onLine.mockRestore()
  })

  it('promises nothing it does not do', () => {
    render(<Contact email={EMAIL} />)
    expect(screen.getByText('No newsletter, no tracking pixel.')).toBeInTheDocument()
  })
})

/* --- The state machine M3 inherits ---------------------------------------- */

describe('Contact — the §6.12 state machine', () => {
  it('ships a label for all six states', () => {
    expect(Object.keys(SUBMIT_LABELS).sort()).toEqual(
      ['error', 'idle', 'limited', 'offline', 'sending', 'success'].sort()
    )
    expect(SUBMIT_LABELS.sending).toBe('Sending…')
    expect(SUBMIT_LABELS.success).toBe('Sent')
    expect(SUBMIT_LABELS.error).toBe('Try again')
  })

  it('ships all four status chromes against the status tokens', () => {
    expect(STATUS_CHROME.success.color).toBe('var(--success)')
    expect(STATUS_CHROME.error.color).toBe('var(--danger)')
    expect(STATUS_CHROME.limited.color).toBe('var(--warning)')
    expect(STATUS_CHROME.offline.color).toBe('var(--fg-1)')
  })

  it('offers the address directly in the error copy M3 will use', () => {
    expect(STATUS_MESSAGES.error(EMAIL)).toContain(EMAIL)
    expect(STATUS_MESSAGES.limited(EMAIL)).toMatch(/try again in a few minutes/i)
  })
})

describe('buildMailto', () => {
  it('composes subject, body and signature from what was typed', () => {
    const href = buildMailto(EMAIL, { name: 'Ada', from: 'ada@example.com', message: 'Hello' })

    expect(href).toContain(`mailto:${EMAIL}?`)
    expect(href).toContain(`subject=${encodeURIComponent('Enquiry from Ada')}`)
    expect(href).toContain(encodeURIComponent('— Ada (ada@example.com)'))
  })

  it('still composes a usable message when the name is left blank', () => {
    const href = buildMailto(EMAIL, { name: '  ', from: 'ada@example.com', message: 'Hello' })
    expect(href).toContain(encodeURIComponent('Enquiry from the portfolio site'))
  })
})
