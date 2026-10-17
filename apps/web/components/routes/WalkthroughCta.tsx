import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'

export type WalkthroughCtaProps = {
  readonly projectName: string
  /** Where the request goes. The home page's contact section by default. */
  readonly href?: string
}

/**
 * Shown on private and client work instead of a 404 or an empty body.
 *
 * The code and the client's detail are not public, so the page says so plainly and offers what
 * can be shared: a conversation. Copy follows spec section 3.2 ("the code isn't public; I'm
 * happy to walk through the architecture on a call").
 */
export function WalkthroughCta({ projectName, href = '/#contact' }: WalkthroughCtaProps) {
  return (
    <GlassCard as="section" variant="panel" tone="violet" aria-labelledby="walkthrough-h">
      <h2 id="walkthrough-h" className="type-h2 mb-4 max-w-[22ch]">
        The code is private. The thinking is not.
      </h2>
      <p className="m-0 max-w-[60ch] text-[color:var(--fg-1)]">
        {projectName} is a client codebase, so I do not publish its source or its details. I am
        glad to walk you through the architecture and the decisions behind it on a call.
      </p>
      <div className="mt-6">
        <Button href={href} variant="primary" size="lg" trailing="→">
          Ask for a private walkthrough
        </Button>
      </div>
    </GlassCard>
  )
}
