const SAFE_DIAGNOSTIC_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'AggregateError',
  'AbortError',
  'Invariant Violation',
]);

export function safeErrorName(value: unknown): string {
  if (typeof value !== 'string') return 'Error';
  if (SAFE_DIAGNOSTIC_NAMES.has(value)) return value;
  return /^[A-Z][A-Za-z0-9]{0,60}(?:Error|Exception)$/.test(value) ? value : 'ApplicationError';
}

export function safeAnalyticsIdentity(value: unknown): string {
  if (typeof value !== 'string') return 'anonymous';
  const uuid = '[a-f\\d]{8}-[a-f\\d]{4}-[1-8][a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}';
  if (new RegExp(`^${uuid}$`, 'i').test(value)) return value;
  return new RegExp(`^(?:anon|dev|preview|sim|e2e)_${uuid}$`, 'i').test(value)
    ? value
    : 'anonymous';
}

export function safeVersion(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d{1,4}(?:\.\d{1,4}){0,3}(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(value)
    ? value
    : undefined;
}
