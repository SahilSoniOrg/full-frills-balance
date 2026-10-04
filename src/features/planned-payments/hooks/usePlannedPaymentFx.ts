import type { AccountFields } from '@/src/types/plainDtos';
import type { PlannedPaymentFormState } from './plannedPaymentFormDraft';
import { useFxPairDraft } from '@/src/hooks/useFxPairDraft';
import { useMemo, useState } from 'react';

/** A current estimate is presentation only. Posting resolves its own conversion. */
export function usePlannedPaymentFx(
  form: Pick<PlannedPaymentFormState, 'amount' | 'currencyCode' | 'fxMode' | 'destinationAmount'>,
  sourceAccount: AccountFields | undefined,
  destinationAccount: AccountFields | undefined,
  destinationPrecision: number,
) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const sourceCurrency = sourceAccount?.currencyCode;
  const destCurrency = destinationAccount?.currencyCode;
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
