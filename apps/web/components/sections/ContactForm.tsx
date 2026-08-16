'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PlaceholderText } from '@/components/ui/PlaceholderCard'
import { useReveal } from '@/components/ui/Reveal'

/**
 * The interactive half of the Contact section.
 *
 * Only this module is `'use client'`. `Contact.tsx` — the section shell, the
 * backdrop, the pitch and the channel list — stays a server component and ships
 * no JavaScript for its markup.
 */

/* ------------------------------------------------------------------------- *
 * The form state machine — reconciliation § 6.12
 * ------------------------------------------------------------------------- */

/**
 * All six states ship now so M3 can wire `POST /v1/contact` behind exactly this
 * markup without touching it. **In M0 only `idle` and `offline` are reachable**
 * — see `handleSubmit`.
 */
export type ContactFormState = 'idle' | 'sending' | 'success' | 'error' | 'limited' | 'offline'

export const SUBMIT_LABELS: Record<ContactFormState, string> = {
  idle: 'Send message',
  sending: 'Sending…',
  success: 'Sent',
  error: 'Try again',
  limited: 'Send message',
  offline: 'Send message',
}

/** The four chromes. `idle` and `sending` show no banner at all. */
export type ContactStatusState = Exclude<ContactFormState, 'idle' | 'sending'>

/**
 * Measured from the export (design-home.md § 11) and re-expressed against the
 * status tokens: a 35% border and a 10% ground over the state's own colour.
 * `offline` is deliberately neutral — a hand-off is not a failure.
 */
export const STATUS_CHROME: Record<ContactStatusState, CSSProperties> = {
  success: {
    borderColor: 'color-mix(in srgb, var(--success) 35%, transparent)',
    background: 'color-mix(in srgb, var(--success) 10%, transparent)',
    color: 'var(--success)',
  },
  error: {
    borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)',
    background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
    color: 'var(--danger)',
  },
  limited: {
    borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)',
    background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
    color: 'var(--warning)',
  },
  offline: {
    borderColor: 'var(--line-2)',
    background: 'rgba(22, 27, 34, 0.8)',
    color: 'var(--fg-1)',
  },
}

/**
 * Verbatim from the export, except `offline`, which is split in two.
 *
 * The export's `offline` copy asserts "You appear to be offline". In M0 the
 * submit hands off to `mailto:` whether or not the visitor is offline, so that
 * sentence would be a straightforward lie to anyone with a working connection.
 * `HANDOFF_MESSAGE` is what an online visitor gets; the export's wording is
 * kept for the genuinely-offline case and is what M3 will keep using.
 */
export const STATUS_MESSAGES: Record<ContactStatusState, (email: string) => string> = {
  success: () => 'Thanks — that reached me. I usually reply within a working day.',
  error: (email) => `That didn’t send. Try again, or email ${email} directly.`,
  limited: () => 'A few messages have come from here already. Try again in a few minutes.',
  offline: () => 'You appear to be offline — this will open your mail app instead.',
}

export const HANDOFF_MESSAGE =
  'Nothing was sent from this page — direct sending is not wired up yet. Your mail app should now be open with the message ready for you to send.'

export const EMAIL_ERROR_MESSAGE = 'Enter an email address I can reply to.'

/** Deliberately permissive — an address only has to be repliable-looking. */
const EMAIL_PATTERN = /.+@.+\..+/

const COPY_REVERT_MS = 2000

/* ------------------------------------------------------------------------- *
 * mailto composition
 * ------------------------------------------------------------------------- */

export interface MailtoParts {
  readonly name: string
  readonly from: string
  readonly message: string
}

/** Builds the `mailto:` the M0 submit hands off to. */
export function buildMailto(to: string, { name, from, message }: MailtoParts): string {
  const who = name.trim()
  const reply = from.trim()
  const subject = `Enquiry from ${who === '' ? 'the portfolio site' : who}`
  const signature = who === '' ? reply : `${who}${reply === '' ? '' : ` (${reply})`}`
  const body = `${message.trim()}\n\n— ${signature}`

  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function navigateTo(href: string): void {
  if (typeof window !== 'undefined') window.location.href = href
}

/* ------------------------------------------------------------------------- *
 * Clipboard
 * ------------------------------------------------------------------------- */

/**
 * Feature-checked, with a `document.execCommand` fallback for browsers and
 * insecure origins where `navigator.clipboard` is absent, and a silent catch
 * around both.
 *
 * Returns whether the text actually reached the clipboard. The export set
 * `copied: true` unconditionally; telling someone an address is on their
 * clipboard when the write was rejected is a small lie with a real cost — they
 * paste nothing and never find out why.
 */
async function copyToClipboard(value: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard

  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(value)
      return true
    } catch {
      return legacyCopy(value)
    }
  }

  return legacyCopy(value)
}

function legacyCopy(value: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false

  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  field.remove()
  return copied
}

/* ------------------------------------------------------------------------- *
 * Copy-email row
 * ------------------------------------------------------------------------- */

export interface CopyEmailButtonProps {
  readonly email: string
  /** OD-5 is unresolved, so the address renders with the dotted convention. */
  readonly placeholder?: boolean
}

/**
 * Row 1 of the channel list: the whole row copies, with the label flipping
 * `Copy` → `Copied` and reverting after 2000ms. The timeout is cleared on every
 * click and on unmount, so rapid clicks cannot leave a stale revert behind.
 */
export function CopyEmailButton({ email, placeholder = false }: CopyEmailButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  const handleCopy = useCallback((): void => {
    void copyToClipboard(email).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), COPY_REVERT_MS)
    })
  }, [email])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 border-none bg-transparent p-0 text-left"
    >
      <span>
        <Eyebrow as="span" size="sm" className="mb-1.5 block">
          Email
        </Eyebrow>
        <span className="font-[family-name:var(--font-mono)] text-[length:0.875rem] text-[color:var(--fg-0)]">
          {placeholder ? <PlaceholderText>{email}</PlaceholderText> : email}
        </span>
      </span>
      <span
        aria-live="polite"
        className="font-[family-name:var(--font-mono)] text-[length:0.6875rem] tracking-[0.12em] whitespace-nowrap text-[color:var(--cyan-300)] uppercase"
      >
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------------- *
 * The form
 * ------------------------------------------------------------------------- */

const FIELD =
  'w-full rounded-[var(--r-card)] border border-[color:var(--line-2)] bg-[color:var(--bg-0)] text-[color:var(--fg-0)] transition-[border-color] duration-200 focus:border-[color:var(--cyan-400)]'

export interface ContactFormProps {
  /** Where a message would go. Also the address the error state offers. */
  readonly email: string
  /**
   * The `mailto:` hand-off. Defaults to navigating the window; injectable so a
   * test can assert the composed URL without jsdom attempting a navigation.
   */
  readonly onHandOff?: (href: string) => void
}

export function ContactForm({ email, onHandOff }: ContactFormProps) {
  const formRef = useReveal<HTMLFormElement>()
  const emailRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<ContactFormState>('idle')
  const [emailError, setEmailError] = useState(false)
  const [mailto, setMailto] = useState('')
  const [offline, setOffline] = useState(false)

  /**
   * **M0 has no API, so there is no success path.**
   *
   * Validate the address, compose a `mailto:` from what was typed, hand off to
   * the visitor's mail app and say so. The export mocked a 1200ms latency and
   * then rendered "Sent" — that tells someone their message was received when
   * nothing left the browser, and it is the one thing this section must not do.
   * `sending`, `success`, `limited` and `error` are unreachable here by
   * construction; M3 sets them from the real response.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const from = String(data.get('email') ?? '')

    if (!EMAIL_PATTERN.test(from)) {
      setEmailError(true)
      setState('idle')
      emailRef.current?.focus()
      return
    }

    setEmailError(false)

    const href = buildMailto(email, {
      name: String(data.get('name') ?? ''),
      from,
      message: String(data.get('message') ?? ''),
    })

    const handOff = onHandOff ?? navigateTo

    setMailto(href)
    setOffline(isOffline())
    setState('offline')
    handOff(href)
  }

  const status: ContactStatusState | null = state === 'idle' || state === 'sending' ? null : state
  const message =
    status === null
      ? ''
      : status === 'offline' && !offline
        ? HANDOFF_MESSAGE
        : STATUS_MESSAGES[status](email)

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      data-variant="form"
      data-state={state}
      className="glass grid gap-5 p-6 lg:p-8"
    >
      {/*
        The three labels use the `eyebrow` utility directly rather than the
        `Eyebrow` component: `htmlFor` lives on `LabelHTMLAttributes`, which the
        component's prop surface does not carry, and `components/ui` is not this
        task's to widen. Same styling, explicit association.
      */}
      <div>
        <label htmlFor="c-name" data-size="sm" className="eyebrow mb-2">
          Name
        </label>
        <input id="c-name" type="text" name="name" autoComplete="name" className={`${FIELD} h-12 px-4`} />
      </div>

      <div>
        <label htmlFor="c-email" data-size="sm" className="eyebrow mb-2">
          Email
        </label>
        <input
          id="c-email"
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="email"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'c-email-err' : undefined}
          style={emailError ? { borderColor: 'var(--danger)' } : undefined}
          className={`${FIELD} h-12 px-4`}
        />
        {emailError ? (
          <p
            id="c-email-err"
            role="alert"
            className="mt-2 mb-0 text-[length:0.8125rem] text-[color:var(--danger)]"
          >
            {EMAIL_ERROR_MESSAGE}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="c-msg" data-size="sm" className="eyebrow mb-2">
          Message
        </label>
        <textarea
          id="c-msg"
          name="message"
          rows={5}
          placeholder="What are you building?"
          className={`${FIELD} resize-y px-4 py-3.5 leading-[1.6]`}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={state === 'sending'}
        loadingLabel={SUBMIT_LABELS.sending}
      >
        {SUBMIT_LABELS[state]}
      </Button>

      {/*
        The live region is mounted for the life of the form and only *styled*
        when it has something to say — `sr-only` is absolutely positioned, so an
        empty banner costs no layout and no grid gap. Mounting it on demand
        would risk the announcement being missed entirely.
      */}
      <div
        role="status"
        data-status={status ?? undefined}
        style={status === null ? undefined : STATUS_CHROME[status]}
        className={
          status === null
            ? 'sr-only'
            : 'rounded-[var(--r-card)] border border-solid px-4 py-3.5 text-[length:0.875rem] leading-[1.5]'
        }
      >
        {message}
        {status === 'offline' && mailto !== '' ? (
          <>
            {' '}
            <a href={mailto} className="underline">
              Open your mail app
            </a>
          </>
        ) : null}
      </div>

      <p className="m-0 text-[length:0.8125rem] leading-[1.5] text-[color:var(--fg-2)]">
        No newsletter, no tracking pixel.
      </p>
    </form>
  )
}
