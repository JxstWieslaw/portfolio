/**
 * Decodes every image of a committed GLB with sharp (libwebp) and holds it to what the header said.
 *
 * `validators.ts` reads a WebP's size from its header bytes and walks its RIFF chunks, and that is all
 * it can do without a decoder. A file whose header says 512 px but whose bitstream is something else,
 * or that does not decode at all, passes those checks. `assets:check` has sharp, so it decodes.
 * Kept out of `validators.ts`, which must stay free of sharp (and of the WASM toolchain).
 */
import { listImages, quote, type Violation } from './validators'

/** Largest image sharp may be asked to decode: the tier 3 texture cap squared, with room to spare. */
const MAX_PIXELS = 4096 * 4096

export interface DecodedSize {
  readonly width: number
  readonly height: number
}
export type Decode = (data: Uint8Array) => Promise<DecodedSize>

/** Full decode, not a header read: a truncated or corrupt bitstream throws. */
const decodeWithSharp: Decode = async (data) => {
  const sharp = (await import('sharp')).default
  const { info } = await sharp(Buffer.from(data), { limitInputPixels: MAX_PIXELS }).raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height }
}

/** One violation per image that does not decode, or decodes to a different size than its header claims. */
export async function verifyImages(bytes: Uint8Array, subject: string, decode: Decode = decodeWithSharp): Promise<Violation[]> {
  const out: Violation[] = []
  for (const [i, image] of listImages(bytes).entries()) {
    const where = `${subject} $.images[${i}]`
    try {
      const { width, height } = await decode(image.data)
      if (Math.max(width, height) !== image.longEdge)
        out.push({ code: 'TEXTURE', subject: where, message: `decodes to ${width}x${height} but its header says a long edge of ${image.longEdge} px` })
    } catch (error) {
      out.push({ code: 'TEXTURE', subject: where, message: `does not decode: ${quote(error instanceof Error ? error.message : String(error))}` })
    }
  }
  return out
}
