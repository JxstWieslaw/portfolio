// @vitest-environment node
/** A5: the committed images are decoded, not only read from their headers. */
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { verifyImages } from '../../scripts/assets/images'
import { buildVariant, loadToolchain } from '../../scripts/assets/pipeline'
import { listImages, packGlb, parseGlb } from '../../scripts/assets/validators'
import { committedGlb, glbAroundImage, richDoc } from './assets-fixtures'

describe('verifyImages', () => {
  let rich: Uint8Array = new Uint8Array()
  beforeAll(async () => {
    const tc = await loadToolchain()
    rich = (await buildVariant(tc, await richDoc(2), { subject: 'rich', tier: 2, clips: [{ from: 'idle', as: 'idle' }] })).bytes
  }, 120_000)

  it('accepts what the pipeline writes: every image decodes to the size its header gives', async () => {
    expect(listImages(rich).length).toBe(2)
    expect(await verifyImages(rich, 'rich', 2)).toEqual([])
  })

  it('TEXTURE: a WebP whose bitstream is cut short does not decode, though its container and header read fine', async () => {
    const real = listImages(rich)[0]?.data ?? new Uint8Array()
    const cut = real.slice(0, 40)
    // Keep the container self-consistent: RIFF size (bytes 4-7) and the VP8 chunk size (bytes 16-19).
    const view = new DataView(cut.buffer)
    view.setUint32(4, cut.length - 8, true)
    view.setUint32(16, cut.length - 20, true)
    const found = await verifyImages(glbAroundImage(cut), 'g', 2)
    expect(found).toHaveLength(1)
    expect(found[0]?.code).toBe('TEXTURE')
    expect(found[0]?.subject).toBe('g $.images[0]')
    expect(found[0]?.message).toMatch(/^does not decode: "/)
  })

  it('TEXTURE: bytes that are not an image at all do not decode', async () => {
    const found = await verifyImages(glbAroundImage(new Uint8Array(64).fill(7)), 'g', 2)
    expect(found.map((x) => x.message.split('"')[0])).toEqual(['does not decode: '])
  })

  it('TEXTURE: width and height are each compared, not only the long edge (a 64x64 header against a 64x1 decode)', async () => {
    const real = listImages(rich)[0]
    const data = glbAroundImage(real?.data ?? new Uint8Array())
    expect((await verifyImages(data, 'g', 2, () => Promise.resolve({ width: 7, height: 3 }))).map((x) => x.message)).toEqual(['decodes to 7x3 but its header says 64x64'])
    expect((await verifyImages(data, 'g', 2, () => Promise.resolve({ width: 64, height: 1 }))).map((x) => x.message)).toEqual(['decodes to 64x1 but its header says 64x64'])
    expect(await verifyImages(data, 'g', 2, () => Promise.resolve({ width: 64, height: 64 }))).toEqual([])
  })

  it('hands the decoder the tier budget as its pixel limit, not a fixed 4096 squared', async () => {
    const data = glbAroundImage(listImages(rich)[0]?.data ?? new Uint8Array())
    const seen: number[] = []
    const spy = (_d: Uint8Array, maxPixels: number) => {
      seen.push(maxPixels)
      return Promise.resolve({ width: 64, height: 64 })
    }
    await verifyImages(data, 'g', 1, spy)
    await verifyImages(data, 'g', 2, spy)
    await verifyImages(data, 'g', 3, spy)
    expect(seen).toEqual([512 ** 2, 1024 ** 2, 2048 ** 2])
  })

  it('refuses more images than the tier allows BEFORE decoding any, and still reports a violation', async () => {
    const png = listImages(rich)[0]?.data ?? new Uint8Array()
    const { json, bin } = parseGlb(glbAroundImage(png))
    const imageViews = (json['images'] as Record<string, unknown>[]).slice(0, 1)
    json['images'] = Array.from({ length: 1000 }, () => ({ ...imageViews[0] }))
    const decode = vi.fn(() => Promise.resolve({ width: 64, height: 64 }))
    const found = await verifyImages(packGlb(json, bin), 'g', 3, decode)
    expect(decode).not.toHaveBeenCalled()
    expect(found.map((x) => x.message)).toEqual(['1000 images exceed the tier 3 cap of 2; none were decoded'])
    expect(found[0]?.code).toBe('TEXTURE')
  })

  it('does nothing for a file without images', async () => {
    expect(await verifyImages(committedGlb(1), 'g', 1)).toEqual([])
  })
})
