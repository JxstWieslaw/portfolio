'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { hasNoGlFlag, probeWebGL2, shouldMountWebGL } from '@/lib/assembly/capabilities'
import { instanceKeep, readCapabilities, resolveRung } from '@/lib/formations/fallback'
import { scheduleIdle } from '@/lib/schedule-idle'

/**
 * Everything that imports three lives behind this one dynamic import, so the
 * initial bundle carries none of it and jsdom never has to load it.
 */
const AssemblyCanvas = dynamic(() => import(/* webpackChunkName: "three" */ './AssemblyCanvas'), { ssr: false })

const LIVE_ATTRIBUTE = 'data-gl'

function setLive(live: boolean): void {
  if (live) document.documentElement.setAttribute(LIVE_ATTRIBUTE, 'live')
  else document.documentElement.removeAttribute(LIVE_ATTRIBUTE)
}

/**
 * The Assembly — spec § 4.4. One fixed, full-viewport, decorative WebGL layer
 * behind the whole home page.
 *
 * Mounts nothing until the 2D ladder says the device may animate, WebGL2 is
 * available and `?nogl=1` is absent — and even then only after an idle
 * callback, so hydration finishes first. Every "no" leaves the per-section 2D
 * canvases exactly as they were: they are the fallback on every path.
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

  useEffect(() => {
    const probe = document.createElement('canvas')
    const caps = readCapabilities(probe)
    const mount = shouldMountWebGL({
      rung: resolveRung(caps),
      webgl2: probeWebGL2(probe),
      noGl: hasNoGlFlag(window.location.search),
    })
    if (!mount) return undefined

    const fraction = instanceKeep(caps)
    const cancel = scheduleIdle(() => setKeep(fraction))
    return () => {
      cancel()
      setLive(false)
    }
  }, [])

  const giveUp = useCallback(() => {
    setLive(false)
    setKeep(null)
  }, [])

  return (
    <div
      aria-hidden="true"
      data-assembly={keep === null ? 'idle' : 'live'}
      className="pointer-events-none fixed inset-0 z-0"
    >
      {keep === null ? null : <AssemblyCanvas keep={keep} onLive={setLive} onGiveUp={giveUp} />}
    </div>
  )
}
