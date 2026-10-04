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

export function restoreAuditFieldsFromRevert(
  current: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedFields: readonly string[],
  allowedFields: ReadonlySet<string> | readonly string[],
  conflictMessage: string,
  fieldsMatch: (field: string, currentValue: unknown, afterValue: unknown) => boolean = (
    _field,
    currentValue,
    afterValue,
  ) => stableAuditJson(currentValue) === stableAuditJson(afterValue),
): Record<string, unknown> {
  const isAllowed =
    allowedFields instanceof Set
      ? (field: string) => allowedFields.has(field)
      : (field: string) => (allowedFields as readonly string[]).includes(field);

  const restored: Record<string, unknown> = { ...current };
  for (const field of changedFields) {
    if (
      !isAllowed(field) ||
      !Object.prototype.hasOwnProperty.call(before, field) ||
      !Object.prototype.hasOwnProperty.call(after, field) ||
      !fieldsMatch(field, current[field], after[field])
    ) {
      throw new Error(conflictMessage);
    }
    restored[field] = before[field];
  }
  return restored;
}
