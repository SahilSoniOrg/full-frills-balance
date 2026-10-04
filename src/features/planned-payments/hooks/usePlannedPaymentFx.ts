import { resolveFxPair, withConvertedAmount } from '@/src/domain/accounting/fxPair';
import { useCrossCurrencyRates } from '@/src/hooks/useCrossCurrencyRates';
import type { AccountFields } from '@/src/types/plainDtos';
import type { PlannedPaymentFormState } from './plannedPaymentFormDraft';
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
  const rates = useCrossCurrencyRates({
    sourceCurrency,
    destCurrency,
    workplaceCurrency: baseCurrency,
    refreshNonce,
    enabled: Boolean(sourceCurrency && destCurrency && sourceCurrency !== destCurrency),
  });
  const pair = useMemo(() => {
    const legacyCurrencyMismatch = !form.fxMode && form.currencyCode !== sourceCurrency;
    const input = {
      sourceCurrency,
      destCurrency,
      baseCurrency,
      fetched: rates,
      sourceAmount: legacyCurrencyMismatch ? 0 : Number(form.amount) || 0,
      destPrecision: destinationPrecision,
    };
    const estimate = resolveFxPair(input);
    const amount = Number(form.destinationAmount);
    // Fixed/manual native amounts are authoritative; market rates only seed the draft.
    const override =
      form.fxMode !== 'automatic' && amount > 0 ? withConvertedAmount(estimate, amount) : null;
    return override ? resolveFxPair({ ...input, override }) : estimate;
  }, [
    sourceCurrency,
    destCurrency,
    baseCurrency,
    rates,
    form.amount,
    form.currencyCode,
    form.fxMode,
    form.destinationAmount,
    destinationPrecision,
  ]);
  return { pair, refresh: () => setRefreshNonce(current => current + 1) };
}
