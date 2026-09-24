import {
  formatManualBaseRate,
  hasManualBaseRateDraft,
  resolveManualWorkplaceRates,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/features/journal/entry/manualBaseRate';
import { parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';

export const RATE_UNAVAILABLE = 'Rate unavailable';

/** Rates that convert one unit of each leg's currency into the base (workplace) currency. */
export interface FxBaseRates {
  sourceBaseRate: number;
  destBaseRate: number;
}

/**
 * User input that replaces market rates for one pair. Callers scope an override to a
 * (pair, date) key so choosing other accounts or another date falls back to `none`.
 * `lastResolved` keeps the previous rates while a manual draft is mid-keystroke.
 */
export type FxOverride =
  | { kind: 'none' }
  | { kind: 'manualBase'; source: string; dest: string; lastResolved: FxBaseRates | null }
  | { kind: 'converted'; rates: FxBaseRates };

export const NO_FX_OVERRIDE: FxOverride = { kind: 'none' };

export interface FxFetchedRates {
  sourceBaseRate: number | null;
  destBaseRate: number | null;
  isLoading: boolean;
  error: string | null;
}

/** Base rates already stored on the journal lines (saved journal or earlier write). */
export interface FxSavedRates {
  sourceRate?: string | number | null;
  destRate?: string | number | null;
}

export interface FxPairInput {
  sourceCurrency?: string;
  destCurrency?: string;
  baseCurrency: string;
  fetched?: FxFetchedRates | null;
  saved?: FxSavedRates | null;
  override?: FxOverride;
  sourceAmount?: number;
}

export type FxPairStatus = 'idle' | 'loading' | 'resolved' | 'unavailable';

export interface FxPair {
  sourceCurrency?: string;
  destCurrency?: string;
  baseCurrency: string;
  isCrossCurrency: boolean;
  needsBaseRate: boolean;
  sourceBaseRate: number | null;
  destBaseRate: number | null;
  /** Source-to-destination rate: one source unit equals `pairRate` destination units. */
  pairRate: number | null;
  sourceAmount: number;
  convertedAmount: number | null;
  status: FxPairStatus;
  isLoading: boolean;
  rateError: string | null;
  needsManualRates: boolean;
  manualSourceBaseRate: string;
  manualDestBaseRate: string;
  override: FxOverride;
}

type FxCurrencies = Pick<FxPairInput, 'sourceCurrency' | 'destCurrency' | 'baseCurrency'>;

export function fxOverrideKey(...parts: (string | number | undefined)[]): string {
  return parts.map(part => part ?? '').join('|');
}

function normalizeBaseRates(
  { sourceCurrency, destCurrency, baseCurrency }: FxCurrencies,
  source: number | null,
  dest: number | null,
): { sourceBaseRate: number | null; destBaseRate: number | null } {
  const sourceBaseRate = sourceCurrency === baseCurrency ? 1 : source;
  const destBaseRate =
    destCurrency === baseCurrency ? 1 : destCurrency === sourceCurrency ? sourceBaseRate : dest;
  return { sourceBaseRate, destBaseRate };
}

function resolveOverrideRates(currencies: FxCurrencies, override: FxOverride): FxBaseRates | null {
  const { sourceCurrency, destCurrency, baseCurrency } = currencies;
  if (!sourceCurrency || !destCurrency) return null;
  if (override.kind === 'converted') return override.rates;
  if (override.kind !== 'manualBase') return null;
  if (
    !hasManualBaseRateDraft(
      sourceCurrency,
      destCurrency,
      baseCurrency,
      override.source,
      override.dest,
    )
  ) {
    return null;
  }
  const resolved = resolveManualWorkplaceRates(
    sourceCurrency,
    destCurrency,
    baseCurrency,
    override.source,
    override.dest,
  );
  return resolved
    ? { sourceBaseRate: resolved.sourceBaseRate, destBaseRate: resolved.destBaseRate }
    : override.lastResolved;
}

/**
 * Resolves one cross-currency pair. Precedence per leg: override, then saved line
 * rates, then fetched market rates. Legs already in the base currency are always 1.
 */
export function resolveFxPair(input: FxPairInput): FxPair {
  const { sourceCurrency, destCurrency, baseCurrency, fetched, saved } = input;
  const override = input.override ?? NO_FX_OVERRIDE;
  const sourceAmount = input.sourceAmount ?? 0;
  const hasPair = Boolean(sourceCurrency && destCurrency);
  const isCrossCurrency = hasPair && sourceCurrency !== destCurrency;
  const needsBaseRate =
    hasPair && (sourceCurrency !== baseCurrency || destCurrency !== baseCurrency);
  const overrideRates = resolveOverrideRates(input, override);

  let sourceBaseRate: number | null = null;
  let destBaseRate: number | null = null;
  if (overrideRates) {
    ({ sourceBaseRate, destBaseRate } = normalizeBaseRates(
      input,
      overrideRates.sourceBaseRate,
      overrideRates.destBaseRate,
    ));
  } else if (hasPair) {
    const savedDest = parsePositiveRate(saved?.destRate);
    const savedSource =
      parsePositiveRate(saved?.sourceRate) ?? (sourceCurrency === destCurrency ? savedDest : null);
    ({ sourceBaseRate, destBaseRate } = normalizeBaseRates(
      input,
      savedSource ?? fetched?.sourceBaseRate ?? null,
      savedDest ?? fetched?.destBaseRate ?? null,
    ));
  }

  const pairRate = sourceBaseRate && destBaseRate ? sourceBaseRate / destBaseRate : null;
  const isLoading = !overrideRates && Boolean(fetched?.isLoading);
  const rateError = overrideRates ? null : (fetched?.error ?? null);
  const status: FxPairStatus = !needsBaseRate
    ? 'idle'
    : pairRate
      ? 'resolved'
      : isLoading
        ? 'loading'
        : 'unavailable';
  const hasManualDraft =
    override.kind === 'manualBase' && Boolean(override.source.trim() || override.dest.trim());

  return {
    sourceCurrency,
    destCurrency,
    baseCurrency,
    isCrossCurrency,
    needsBaseRate,
    sourceBaseRate,
    destBaseRate,
    pairRate,
    sourceAmount,
    convertedAmount:
      isCrossCurrency && pairRate && sourceAmount > 0 ? sourceAmount * pairRate : null,
    status,
    isLoading,
    rateError,
    needsManualRates: hasPair && Boolean(rateError || hasManualDraft),
    manualSourceBaseRate:
      override.kind === 'manualBase'
        ? override.source
        : override.kind === 'converted' && sourceCurrency !== baseCurrency
          ? formatManualBaseRate(override.rates.sourceBaseRate)
          : '',
    manualDestBaseRate:
      override.kind === 'manualBase'
        ? override.dest
        : override.kind === 'converted' &&
            destCurrency !== baseCurrency &&
            destCurrency !== sourceCurrency
          ? formatManualBaseRate(override.rates.destBaseRate)
          : '',
    override,
  };
}

/** Override after the user edits one manual base-rate field. */
export function withManualBaseRate(
  pair: FxPair,
  role: 'source' | 'destination',
  value: string,
): FxOverride {
  const source = role === 'source' ? value : pair.manualSourceBaseRate;
  const dest = role === 'destination' ? value : pair.manualDestBaseRate;
  const lastResolved =
    resolveOverrideRates(pair, { kind: 'manualBase', source, dest, lastResolved: null }) ??
    resolveOverrideRates(pair, pair.override);
  return { kind: 'manualBase', source, dest, lastResolved };
}

/**
 * Override implied by a user-edited destination amount, or null when no rate can be
 * implied (no source amount, or both legs foreign without an anchor rate).
 */
export function withConvertedAmount(pair: FxPair, convertedAmount: number): FxOverride | null {
  if (!pair.sourceCurrency || !pair.destCurrency) return null;
  const rates = resolveWorkplaceRatesFromConvertedAmount({
    sourceAmount: pair.sourceAmount,
    convertedAmount,
    sourceCurrency: pair.sourceCurrency,
    destCurrency: pair.destCurrency,
    workplaceCurrency: pair.baseCurrency,
    existingSourceBaseRate: pair.sourceBaseRate,
    existingDestBaseRate: pair.destBaseRate,
  });
  return rates
    ? {
        kind: 'converted',
        rates: { sourceBaseRate: rates.sourceBaseRate, destBaseRate: rates.destBaseRate },
      }
    : null;
}
