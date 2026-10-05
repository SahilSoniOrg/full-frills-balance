import type { FxFetchedRates } from '@/src/domain/accounting/fxPair';

export function fxFetchedRates(
  sourceBaseRate: number | null,
  destBaseRate: number | null,
  overrides: Partial<FxFetchedRates> = {},
): FxFetchedRates {
  return {
    sourceBaseRate,
    destBaseRate,
    isLoading: false,
    error: null,
    ...overrides,
  };
}
