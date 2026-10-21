'use client'

import { LateIsland } from '@/components/sections/LateIsland'
import type { ContactForm, ContactFormProps } from '@/components/sections/ContactForm'

/**
 * The contact form, out of the initial bundle (chunk `late-ui`). See `LateIsland` for how the server HTML is kept
 * and the form hydrated later. This has to be a client module: `dynamic()` or `lazy()` in the `Contact` server
 * component emits no chunk.
 *
 * On the server `typeof window` is `undefined`, so the real component is required synchronously and rendered inline;
 * on the client that branch is dead code, so the form is reachable only through the dynamic import below.
 */
const ServerForm =
  typeof window === 'undefined'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@/components/sections/ContactForm') as { ContactForm: typeof ContactForm }).ContactForm
    : null

const load = () =>
  import(/* webpackChunkName: "late-ui" */ '@/components/sections/ContactForm').then((m) => m.ContactForm)

export function ContactFormLazy(props: ContactFormProps) {
  return (
    <LateIsland
      name="contact-form"
      load={load}
      props={props}
      server={ServerForm === null ? null : <ServerForm {...props} />}
    />
  )
}
