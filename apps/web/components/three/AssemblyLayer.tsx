'use client'

import dynamic from 'next/dynamic'
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { hasNoGlFlag, probeWebGL2, readSaveData, shouldMountWebGL } from '@/lib/assembly/capabilities'
import { afterLcp } from '@/lib/assembly/lcp'
import { instanceKeep, readCapabilities, resolveRung } from '@/lib/formations/fallback'
import { heroFlagOn, shouldMountHero } from '@/lib/hero/gate'

const LIVE_ATTRIBUTE = 'data-gl'

function setLive(live: boolean): void {
  if (live) document.documentElement.setAttribute(LIVE_ATTRIBUTE, 'live')
  else document.documentElement.removeAttribute(LIVE_ATTRIBUTE)
}

/**
 * Once the layer has given up — a second context loss, a chunk that failed to
 * load, a render error — it stays off for the rest of the session, across
 * remounts. The 2D canvases are the design on that path, not a degraded one.
 */
let gaveUp = false

type GiveUpHandler = () => void
let giveUpHandler: GiveUpHandler = () => {}

/** Stands in for the canvas when its chunk fails to load (deploy skew, flaky network). */
function GiveUp() {
  useEffect(() => {
    giveUpHandler()
  }, [])
  return null
}

/**
 * Everything that imports three lives behind this one dynamic import, so the
 * initial bundle carries none of it and jsdom never has to load it. A rejected
 * import resolves to `GiveUp` instead of throwing out of React.lazy.
 */
const AssemblyCanvas = dynamic(
  () => import(/* webpackChunkName: "three" */ './AssemblyCanvas').catch(() => ({ default: GiveUp })),
  { ssr: false },
)

/**
 * The hero monolith (flagged, spec S1): its own lazy chunk, `hero`, raw WebGL2
 * with no three, so it never waits for the 267 kB core and fails on its own.
 * A rejected import hands control back instead of leaving the cubes hidden.
 */
const HeroLayer = dynamic(
  () =>
    import(/* webpackChunkName: "hero" */ './hero/HeroLayer').catch(() => ({
      default: ({ onGiveUp }: { onGiveUp: () => void }) => {
        useEffect(onGiveUp, [onGiveUp])
        return null
      },
    })),
  { ssr: false },
)

interface BoundaryProps {
  readonly onError: GiveUpHandler
  readonly children: ReactNode
}

/**
 * R3F's Canvas rethrows anything its tree throws; without this the whole home
 * page would become Next's error screen over a decorative layer.
 */
class AssemblyBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(): void {
    this.props.onError()
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The Assembly — spec § 4.4. One fixed, full-viewport, decorative WebGL layer
 * behind the whole home page.
 *
 * Mounts nothing until the largest contentful paint has happened and the
 * thread is idle (`afterLcp`, journey spec § 5.7), and then only if the 2D
 * ladder says the device may animate, WebGL2 is available and `?nogl=1` is
 * absent. The probes run inside that callback, so nothing here touches a
 * canvas before the LCP. Every "no" leaves the per-section 2D canvases
 * exactly as they were: they are the fallback on every path.
 *
 * Once the first WebGL frame has drawn, `html[data-gl="live"]` cross-fades the
 * 2D washes and canvases out (see `globals.css`); a lost context removes the
 * attribute so they fade straight back. A second loss gives up for the session.
 *
 * `aria-hidden`, `pointer-events: none`, out of flow: it cannot shift layout,
 * eat a click or reach assistive technology. `DecorativeLayerNote` already
 * covers it for screen readers.
 */
export function AssemblyLayer() {
  const [keep, setKeep] = useState<number | null>(null)
  const [hero, setHero] = useState(false)
  const heroOff = useCallback(() => setHero(false), [])

  useEffect(() => {
    if (gaveUp) return undefined

    const cancel = afterLcp(() => {
      // Two probes: a canvas can hold one context kind only, so the 2D probe
      // inside readCapabilities would make a WebGL2 probe on the same element
      // return null by spec.
      const caps = readCapabilities(document.createElement('canvas'))
      const inputs = {
        rung: resolveRung(caps),
        webgl2: probeWebGL2(document.createElement('canvas')),
        noGl: hasNoGlFlag(window.location.search),
        saveData: readSaveData(),
      }
      if (shouldMountWebGL(inputs)) setKeep(instanceKeep(caps))
      if (shouldMountHero({ ...inputs, flag: heroFlagOn(window.location.search) })) setHero(true)
    })
    return () => {
      cancel()
      setLive(false)
    }
  }, [])

  const giveUp = useCallback(() => {
    gaveUp = true
    setLive(false)
    setKeep(null)
  }, [])

  useEffect(() => {
    giveUpHandler = giveUp
    return () => {
      giveUpHandler = () => {}
    }
  }, [giveUp])

  return (
    <div
      aria-hidden="true"
      data-assembly={keep === null ? 'idle' : 'live'}
      className="pointer-events-none fixed inset-0 z-0"
    >
      {hero ? <HeroLayer onGiveUp={heroOff} /> : null}
      {keep === null ? null : (
        <AssemblyBoundary onError={giveUp}>
          <AssemblyCanvas keep={keep} hero={hero} onLive={setLive} onGiveUp={giveUp} />
        </AssemblyBoundary>
      )}
    </div>
  )
}

/** Test seam: forgets a previous give-up so each test starts fresh. */
export function resetAssemblyForTests(): void {
  gaveUp = false
}
