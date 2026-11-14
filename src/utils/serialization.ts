export const snakeToCamel = (str: string) => str.replace(/(_\w)/g, match => match[1].toUpperCase());

/** Parsing establishes JSON syntax only. Owners must validate the decoded shape. */
export function safeParseJSON(json: string | null | undefined, fallback: unknown = null): unknown {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return fallback;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJSONRecord(json: string | null | undefined): Record<string, unknown> {
  const value = safeParseJSON(json);
  return isRecord(value) ? value : {};
}

export function parseJSONStringArray(json: string | null | undefined): string[] {
  const value = safeParseJSON(json);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
