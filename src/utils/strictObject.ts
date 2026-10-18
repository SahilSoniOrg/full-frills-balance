/** Shape checks only; each format owns its required fields, versions and scope checks. */
export function parseObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

/** Reject unknown fields while allowing format-specific optional fields to be absent. */
export function assertAllowedKeys(value: object, keys: readonly string[], message: string): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error(message);
}

/** Require precisely these own enumerable fields, independent of their order. */
export function assertExactKeys(value: object, keys: readonly string[], message: string): void {
  assertAllowedKeys(value, keys, message);
  if (Object.keys(value).length !== keys.length) throw new Error(message);
}

export function isHexId(value: unknown, length: number): value is string {
  return typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value);
}

export function isSha256Id(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('sha256:') && isHexId(value.slice(7), 64);
}
