import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('project cursor', () => {
  it('round-trips and is URL-safe', () => {
    const encoded = encodeCursor({ order: 7 })
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(encoded)).toEqual({ order: 7 })
  })

  it.each([
    ['garbage', 'not-a-cursor!'],
    ['valid base64 of the wrong shape', Buffer.from('{"order":1}').toString('base64url')],
    ['a negative order', Buffer.from('[-1]').toString('base64url')],
    ['a fractional order', Buffer.from('[1.5]').toString('base64url')],
  ])('rejects %s', (_label, value) => {
    expect(decodeCursor(value)).toBeNull()
  })
})
