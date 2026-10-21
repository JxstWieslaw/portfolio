'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PlaceholderText } from '@/components/ui/PlaceholderCard'

/**
 * The copy-email row. Split out of `ContactForm.tsx` so the form can load late (`ContactFormLazy`) while this
 * small, immediately useful control stays in the initial bundle.
 */

const COPY_REVERT_MS = 2000

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

