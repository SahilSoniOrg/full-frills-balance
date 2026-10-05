import type { AccountFields, PlannedPaymentFxMode } from '@/src/types/plainDtos';
import { useFxPairDraft } from '@/src/hooks/useFxPairDraft';
import { useMemo, useState } from 'react';

export type PlannedPaymentFxDraft = {
  amount: string;
  currencyCode: string;
  fxMode?: PlannedPaymentFxMode;
  destinationAmount?: string;
};

/** A current estimate is presentation only. Posting resolves its own conversion. */
export function usePlannedPaymentFx(
  form: PlannedPaymentFxDraft,
  sourceAccount: AccountFields | undefined,
  destinationAccount: AccountFields | undefined,
  destinationPrecision: number,
  currencies?: { source?: string; dest?: string },
) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const sourceCurrency = currencies?.source ?? sourceAccount?.currencyCode;
  const destCurrency = currencies?.dest ?? destinationAccount?.currencyCode;
  const baseCurrency = sourceCurrency ?? form.currencyCode;
  const legacyCurrencyMismatch = !form.fxMode && form.currencyCode !== sourceCurrency;
  const sourceAmount = legacyCurrencyMismatch ? 0 : Number(form.amount) || 0;
  const convertedDestAmount = useMemo(() => {
    if (form.fxMode === 'automatic') return undefined;
    const amount = Number(form.destinationAmount);
    return amount > 0 ? amount : undefined;
  }, [form.destinationAmount, form.fxMode]);

  const { pair } = useFxPairDraft({
    sourceCurrency,
    destCurrency,
    baseCurrency,
    sourceAmount,
    destPrecision: destinationPrecision,
    refreshNonce,
    enabled: Boolean(sourceCurrency && destCurrency && sourceCurrency !== destCurrency),
    convertedDestAmount,
  });

  return { pair, refresh: () => setRefreshNonce(current => current + 1) };
}
