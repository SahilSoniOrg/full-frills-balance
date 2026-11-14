export function stableAuditJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAuditJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableAuditJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
