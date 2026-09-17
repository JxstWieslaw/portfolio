import { describe, expect, it } from 'vitest'
import { canonicalJson, contentHash } from './hash'

describe('content hashing', () => {
  it('is independent of key order, at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
    expect(contentHash({ b: 1, a: 2 })).toBe(contentHash({ a: 2, b: 1 }))
  })

  it('keeps array order, because order is content', () => {
    expect(contentHash(['a', 'b'])).not.toBe(contentHash(['b', 'a']))
  })

  it('ignores undefined properties, as JSON does', () => {
    expect(contentHash({ a: 1, b: undefined })).toBe(contentHash({ a: 1 }))
  })
})
