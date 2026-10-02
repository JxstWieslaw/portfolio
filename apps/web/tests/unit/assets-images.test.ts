// @vitest-environment node
/** A5: the committed images are decoded, not only read from their headers. */
import { beforeAll, describe, expect, it } from 'vitest'

import { verifyImages } from '../../scripts/assets/images'
import { buildVariant, loadToolchain } from '../../scripts/assets/pipeline'
import { listImages } from '../../scripts/assets/validators'
import { committedGlb, glbAroundImage, richDoc } from './assets-fixtures'

describe('verifyImages', () => {
  let rich: Uint8Array = new Uint8Array()
  beforeAll(async () => {
    const tc = await loadToolchain()
    rich = (await buildVariant(tc, await richDoc(2), { subject: 'rich', tier: 2, clips: [{ from: 'idle', as: 'idle' }] })).bytes
  }, 120_000)

  it('accepts what the pipeline writes: every image decodes to the size its header gives', async () => {
    expect(listImages(rich).length).toBe(2)
    expect(await verifyImages(rich, 'rich')).toEqual([])
  })

  it('TEXTURE: a WebP whose bitstream is cut short does not decode, though its container and header read fine', async () => {
    const real = listImages(rich)[0]?.data ?? new Uint8Array()
    const cut = real.slice(0, 40)
    // Keep the container self-consistent: RIFF size (bytes 4-7) and the VP8 chunk size (bytes 16-19).
    const view = new DataView(cut.buffer)
    view.setUint32(4, cut.length - 8, true)
    view.setUint32(16, cut.length - 20, true)
    const found = await verifyImages(glbAroundImage(cut), 'g')
    expect(found).toHaveLength(1)
    expect(found[0]?.code).toBe('TEXTURE')
    expect(found[0]?.subject).toBe('g $.images[0]')
    expect(found[0]?.message).toMatch(/^does not decode: "/)
  })

  it('TEXTURE: bytes that are not an image at all do not decode', async () => {
    const found = await verifyImages(glbAroundImage(new Uint8Array(64).fill(7)), 'g')
    expect(found.map((x) => x.message.split('"')[0])).toEqual(['does not decode: '])
  })

  it('TEXTURE: an image whose decoded size differs from the size its header gave', async () => {
    const real = listImages(rich)[0]
    const found = await verifyImages(glbAroundImage(real?.data ?? new Uint8Array()), 'g', () => Promise.resolve({ width: 7, height: 3 }))
    expect(found.map((x) => x.message)).toEqual([`decodes to 7x3 but its header says a long edge of ${real?.longEdge} px`])
    expect(await verifyImages(glbAroundImage(real?.data ?? new Uint8Array()), 'g', () => Promise.resolve({ width: 1, height: real?.longEdge ?? 0 }))).toEqual([])
  })

  it('does nothing for a file without images', async () => {
    expect(await verifyImages(committedGlb(1), 'g')).toEqual([])
  })
})
