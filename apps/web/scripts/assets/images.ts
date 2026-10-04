/**
 * Decodes every image of a committed GLB with sharp (libwebp) and holds it to what the header said.
 *
 * `validators.ts` reads a WebP's size from its header bytes and walks its RIFF chunks, and that is all
 * it can do without a decoder. A file whose header says 512 px but whose bitstream is something else,
 * or that does not decode at all, passes those checks. `assets:check` has sharp, so it decodes.
 * Kept out of `validators.ts`, which must stay free of sharp (and of the WASM toolchain).
 *
 * Only ever called for a file the scanner has already passed, with limits taken from the tier budget:
 * a hostile file must not choose how much memory or time the decoder spends on it.
 */
import { MODEL_BUDGETS, type ModelTier } from '@repo/contracts'

import { listImages, quote, type Violation } from './validators'

/** Marker for `npm run check:bundle`: a minifier keeps string values, so this proves the tooling is absent by content. */
export const ASSET_TOOLCHAIN_CANARY = '__asset-toolchain-7f3a__'

export interface DecodedSize {
  readonly width: number
  readonly height: number
}
/** `maxPixels` is the budget's texture edge squared: sharp refuses anything larger before it decodes. */
export type Decode = (data: Uint8Array, maxPixels: number) => Promise<DecodedSize>

/** Full decode, not a header read: a truncated or corrupt bitstream throws. */
const decodeWithSharp: Decode = async (data, maxPixels) => {
  const sharp = (await import('sharp')).default
  // One image at a time and nothing kept between them: memory stays flat whatever the file holds.
  sharp.cache(false)
  sharp.concurrency(1)
  const { info } = await sharp(Buffer.from(data), { limitInputPixels: maxPixels }).raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height }
}

/** One violation per image that does not decode, or decodes to a different size than its header claims. */
export async function verifyImages(bytes: Uint8Array, subject: string, tier: ModelTier, decode: Decode = decodeWithSharp): Promise<Violation[]> {
  const budget = MODEL_BUDGETS[tier]
  const images = listImages(bytes)
  // Refused before a single byte is decoded: the count alone is the finding.
  if (images.length > budget.textures)
    return [{ code: 'TEXTURE', subject: `${subject} $.images`, message: `${images.length} images exceed the tier ${tier} cap of ${budget.textures}; none were decoded` }]
  const out: Violation[] = []
  for (const [i, image] of images.entries()) {
    const where = `${subject} $.images[${i}]`
    try {
      const { width, height } = await decode(image.data, budget.texturePx ** 2)
      const [headerWidth, headerHeight] = headerSize(image.mimeType, image.data)
      if (width !== headerWidth || height !== headerHeight)
        out.push({ code: 'TEXTURE', subject: where, message: `decodes to ${width}x${height} but its header says ${headerWidth}x${headerHeight}` })
    } catch (error) {
      out.push({ code: 'TEXTURE', subject: where, message: `does not decode: ${quote(error instanceof Error ? error.message : String(error))}` })
    }
  }
  return out
}

/** Width and height from the header, so each is compared on its own and not only the long edge. */
function headerSize(mimeType: string | null, data: Uint8Array): [number, number] {
  if (mimeType !== 'image/webp' || data.byteLength < 30) return [0, 0]
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const kind = String.fromCharCode(data[12] ?? 0, data[13] ?? 0, data[14] ?? 0, data[15] ?? 0)
  if (kind === 'VP8 ') return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff]
  if (kind === 'VP8L') {
    const b = (i: number) => data[21 + i] ?? 0
    return [1 + (((b(1) & 0x3f) << 8) | b(0)), 1 + (((b(3) & 0xf) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6))]
  }
  if (kind === 'VP8X') {
    const at = (i: number) => data[i] ?? 0
    return [1 + at(24) + (at(25) << 8) + (at(26) << 16), 1 + at(27) + (at(28) << 8) + (at(29) << 16)]
  }
  return [0, 0]
}
