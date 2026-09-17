export interface ProjectCursor {
  order: number
}

/**
 * Keyset cursor over `sort_order`, which is unique (content integrity check + unique index).
 * Opaque to callers — base64url JSON — so the key can change without breaking the contract.
 */
export function encodeCursor(cursor: ProjectCursor): string {
  return Buffer.from(JSON.stringify([cursor.order])).toString('base64url')
}

export function decodeCursor(value: string): ProjectCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (Array.isArray(parsed) && parsed.length === 1 && Number.isInteger(parsed[0]) && (parsed[0] as number) >= 0) {
      return { order: parsed[0] as number }
    }
  } catch {
    // Not base64url JSON: fall through to null.
  }
  return null
}
