import { safeParseJSON } from '@/src/utils/serialization';

/**
 * Source facts retained for a review-only proposal from an older SMS journal.
 * This data is deliberately separate from transactionCapture: it does not
 * establish that the old category was explicitly confirmed by the user.
 */
export interface HistoricalSmsSourceEvidence {
  sourceId: string;
  occurredAt: number;
  merchant?: string;
  amount?: number;
  currencyCode?: string;
}

export interface HistoricalSmsEvidence {
  version: 1;
  sources: HistoricalSmsSourceEvidence[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(json: string | undefined): Record<string, unknown> {
  const parsed = json ? safeParseJSON<unknown>(json, null) : null;
  return isRecord(parsed) ? parsed : {};
}

function readSource(value: unknown): HistoricalSmsSourceEvidence | null {
  if (
    !isRecord(value) ||
    typeof value.sourceId !== 'string' ||
    !value.sourceId ||
    typeof value.occurredAt !== 'number' ||
    !Number.isFinite(value.occurredAt) ||
    (value.merchant !== undefined && typeof value.merchant !== 'string') ||
    (value.amount !== undefined &&
      (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0)) ||
    (value.currencyCode !== undefined &&
      (typeof value.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(value.currencyCode)))
  ) {
    return null;
  }
  return {
    sourceId: value.sourceId,
    occurredAt: value.occurredAt,
    ...(typeof value.merchant === 'string' && value.merchant.trim()
      ? { merchant: value.merchant.trim().slice(0, 200) }
      : {}),
    ...(typeof value.amount === 'number' ? { amount: value.amount } : {}),
    ...(typeof value.currencyCode === 'string' ? { currencyCode: value.currencyCode } : {}),
  };
}

export function mergeHistoricalSmsSources(
  existing: readonly HistoricalSmsSourceEvidence[],
  incoming: readonly HistoricalSmsSourceEvidence[],
): HistoricalSmsSourceEvidence[] {
  const merged = new Map<string, HistoricalSmsSourceEvidence>();
  for (const source of [...existing, ...incoming]) {
    const previous = merged.get(source.sourceId);
    if (!previous) {
      merged.set(source.sourceId, source);
      continue;
    }
    merged.set(source.sourceId, {
      sourceId: source.sourceId,
      occurredAt: previous.occurredAt || source.occurredAt,
      merchant: previous.merchant || source.merchant,
      amount: previous.amount ?? source.amount,
      currencyCode: previous.currencyCode || source.currencyCode,
    });
  }
  return [...merged.values()];
}

export function readHistoricalSmsEvidence(json: string | undefined): HistoricalSmsEvidence | null {
  const raw = readObject(json).historicalSmsEvidence;
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.sources)) return null;
  const sources = raw.sources.map(readSource);
  if (sources.some(source => source === null)) return null;
  const validSources = sources.filter(
    (source): source is HistoricalSmsSourceEvidence => source !== null,
  );
  return { version: 1, sources: mergeHistoricalSmsSources([], validSources) };
}

export function withHistoricalSmsEvidence(
  json: string | undefined,
  sources: readonly HistoricalSmsSourceEvidence[],
): string {
  const metadata = readObject(json);
  const existing = readHistoricalSmsEvidence(json)?.sources ?? [];
  metadata.historicalSmsEvidence = {
    version: 1,
    sources: mergeHistoricalSmsSources(existing, sources),
  } satisfies HistoricalSmsEvidence;
  return JSON.stringify(metadata);
}

export function withoutHistoricalSmsEvidence(json: string | undefined): string {
  const metadata = readObject(json);
  delete metadata.historicalSmsEvidence;
  return JSON.stringify(metadata);
}
