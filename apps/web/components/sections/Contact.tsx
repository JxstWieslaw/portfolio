import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { HairlineCell, HairlineGrid } from '@/components/ui/HairlineGrid'
import { ContactForm, CopyEmailButton } from '@/components/sections/ContactForm'

export interface ContactChannel {
  readonly label: string
  /** What the row displays — `Wieslaw Samushonga`, `github.com/JxstWieslaw`. */
  readonly value: string
  readonly url: string
}

export interface ContactProps {
  readonly email: string
  /** OD-5 is open, so the address renders with the dotted convention. */
  readonly emailPlaceholder?: boolean
  /** LinkedIn and GitHub rows. Only rows with a real URL are rendered. */
  readonly channels?: readonly ContactChannel[]
  /** Injectable `mailto:` hand-off; see `ContactForm`. */
  readonly onHandOff?: (href: string) => void
}

function isLinkable(channel: ContactChannel): boolean {
  const url = channel.url.trim()
  return url !== '' && url !== '#'
}

/**
 * Contact — the `ring` formation, and the only section whose grid uses a
 * `clamp()` on a track: `1fr clamp(320px, 38vw, 520px)` with a
 * `clamp(24px, 4vw, 64px)` gap. Below 1024 it is one column with the form
 * beneath the channels (reconciliation § 3.3), which is simply the DOM order —
 * no reordering, no duplicated markup.
 *
 * The section is a server component. Only `ContactForm` and `CopyEmailButton`
 * are `'use client'`.
 */
export function Contact({ email, emailPlaceholder = false, channels = [], onHandOff }: ContactProps) {
  const rows = channels.filter(isLinkable)

  return (
    <Section
      id="contact"
      formation="ring"
      labelledBy="contact-h"
      backdrop={<SectionBackdrop formation="ring" />}
      innerClassName="grid items-start gap-[clamp(24px,4vw,64px)] lg:grid-cols-[1fr_clamp(320px,38vw,520px)]"
    >
      <div>
        {/*
          Not `SectionHeader`: that primitive is the full-width header row —
          a wrapping flex line with a trailing action slot and a fixed 48px
          bottom margin. Here the header is a column inside a two-column grid,
          with the channel list flowing directly under the lede.
        */}
        <Eyebrow tone="cyan-400" className="mb-4">
          07 — Contact
        </Eyebrow>
        <h2 id="contact-h" className="type-h2 mb-6 max-w-[16ch]">
          Open to consulting &amp; collaboration.
        </h2>
        <p className="mt-0 mb-10 max-w-[52ch] text-[length:var(--body-lg)] leading-[1.6] text-[color:var(--fg-1)]">
          Leading a build, untangling an architecture, or making something run at 60 fps — if
          it&apos;s an interesting problem, I&apos;d like to hear about it.
        </p>

        {/* Third use of the hairline grid (reconciliation § 6.5). */}
        <HairlineGrid cols={1} className="max-w-[440px]">
          <HairlineCell interactive>
            <CopyEmailButton email={email} placeholder={emailPlaceholder} />
          </HairlineCell>

          {rows.map((channel) => (
            <HairlineCell
              key={channel.url}
              interactive
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-4 no-underline"
            >
              <span>
                <Eyebrow as="span" size="sm" className="mb-1.5 block">
                  {channel.label}
                </Eyebrow>
                <span className="text-[length:0.9375rem] text-[color:var(--fg-0)]">
                  {channel.value}
                </span>
              </span>
              <span aria-hidden="true" className="text-[color:var(--fg-2)]">
                ↗
              </span>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </div>

      <ContactForm email={email} onHandOff={onHandOff} />
    </Section>
  )
}
