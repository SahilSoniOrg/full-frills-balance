import { ACCOUNT_COLOR_PALETTE } from '@/src/constants/account-constants';

/** Accept source colors only when they can be represented as opaque 6-digit hex. */
export function normalizeHexColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const hex = normalized.slice(1).toUpperCase();
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return undefined;
}

/** Ivy stores Android color-int values. Zero is Ivy's unset/default value. */
export function normalizeIvyColor(value: number | null | undefined): string | undefined {
  if (value === undefined || value === null || !Number.isInteger(value) || value === 0) {
    return undefined;
  }
  const unsigned = value >>> 0;
  const rgb = unsigned > 0xffffff ? unsigned & 0xffffff : unsigned;
  if (rgb < 0x100000) return undefined;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Maps an external color to the nearest supported account swatch. */
export function mapToNearestAccountColor(value: string | undefined): string | undefined {
  const normalized = normalizeHexColor(value);
  if (!normalized) return undefined;

  const source = normalized
    .slice(1)
    .match(/../g)!
    .map(component => parseInt(component, 16));

  return ACCOUNT_COLOR_PALETTE.reduce(
    (nearest, candidate) => {
      const target = candidate
        .slice(1)
        .match(/../g)!
        .map(component => parseInt(component, 16));
      const distance = source.reduce((total, component, index) => {
        return total + (component - target[index]!) ** 2;
      }, 0);
      return distance < nearest.distance ? { color: candidate, distance } : nearest;
    },
    { color: ACCOUNT_COLOR_PALETTE[0]!, distance: Number.POSITIVE_INFINITY },
  ).color;
}

/**
 * Safely parse a date/time representation into millisecond timestamp.
 */
export function parseTimestampMs(
  value: string | number | null | undefined,
  fallbackMs = Date.now(),
): number {
  if (value === null || value === undefined || value === '') return fallbackMs;
  if (typeof value === 'number') {
    // If seconds (< 1e11), convert to milliseconds
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? fallbackMs : parsed;
}

/**
 * Robustly parse serialized JSON string IDs or single ID string into string array.
 */
export function parseSerializedIds(serialized?: string): string[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    return [serialized];
  }
}
