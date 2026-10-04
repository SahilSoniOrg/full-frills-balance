import { ExchangeRateCard } from '@/src/components/forms/ExchangeRateCard';
import {
  NO_FX_OVERRIDE,
  withConvertedAmount,
  withManualBaseRate,
  type FxOverride,
} from '@/src/domain/accounting/fxPair';
import { useFxPairDraft } from '@/src/hooks/useFxPairDraft';
import { getJournalFxDateKey, normalizeCurrencyAmount } from '@/src/domain/accounting/journalFx';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface JournalFxRateEditorProps {
  accountCurrency: string;
  journalCurrency: string;
  journalDate: number;
  amount: string;
  sourcePrecision: number;
  journalPrecision: number;
  exchangeRate?: string;
  onExchangeRateChange: (
    value: string,
    source: 'historical' | 'manual' | 'converted' | 'missing',
  ) => void;
  testIDPrefix: string;
}

/** Journal FX controls for editing a line against the journal's valuation currency. */
export function JournalFxRateEditor({
  accountCurrency,
  journalCurrency,
  journalDate,
  amount,
  sourcePrecision,
  journalPrecision,
  exchangeRate,
  onExchangeRateChange,
  testIDPrefix,
}: JournalFxRateEditorProps) {
  const [override, setOverride] = useState<FxOverride>(NO_FX_OVERRIDE);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const pendingMarketRateRef = useRef(false);
  const normalizedAccountCurrency = accountCurrency.trim().toUpperCase();
  const normalizedJournalCurrency = journalCurrency.trim().toUpperCase();
  const isCrossCurrency = normalizedAccountCurrency !== normalizedJournalCurrency;
  const journalDateKey = getJournalFxDateKey(journalDate);
  const parsedAmount = Number(amount);
  const sourceAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? normalizeCurrencyAmount(parsedAmount, sourcePrecision).amount
      : 0;

  const { pair } = useFxPairDraft({
    sourceCurrency: normalizedAccountCurrency,
    destCurrency: normalizedJournalCurrency,
    baseCurrency: normalizedJournalCurrency,
    journalDate: journalDateKey ?? '',
    refreshNonce,
    enabled: isCrossCurrency,
    saved: exchangeRate ? { sourceRate: exchangeRate } : null,
    override,
    sourceAmount: Number.isFinite(sourceAmount) ? sourceAmount : 0,
    destPrecision: journalPrecision,
  });
  useEffect(() => {
    if (!isCrossCurrency || pair.sourceBaseRate === null) return;
    if (pendingMarketRateRef.current) return;
    if (exchangeRate?.trim() && Number(exchangeRate) > 0) return;
    onExchangeRateChange(String(pair.sourceBaseRate), 'historical');
  }, [exchangeRate, isCrossCurrency, onExchangeRateChange, pair.sourceBaseRate]);

  useEffect(() => {
    if (!pendingMarketRateRef.current || pair.sourceBaseRate === null) return;
    pendingMarketRateRef.current = false;
    onExchangeRateChange(String(pair.sourceBaseRate), 'historical');
  }, [onExchangeRateChange, pair.sourceBaseRate]);

  const handleConvertedAmountChange = useCallback(
    (value: string) => {
      const nextOverride = withConvertedAmount(pair, Number(value));
      if (nextOverride?.kind !== 'converted') return;
      pendingMarketRateRef.current = false;
      setOverride(nextOverride);
      onExchangeRateChange(String(nextOverride.rates.sourceBaseRate), 'converted');
    },
    [onExchangeRateChange, pair],
  );

  const handleManualRateChange = useCallback(
    (role: 'source' | 'destination', value: string) => {
      pendingMarketRateRef.current = false;
      setOverride(withManualBaseRate(pair, role, value));
      onExchangeRateChange(value, 'manual');
    },
    [onExchangeRateChange, pair],
  );

  const resetToMarketRate = useCallback(() => {
    setOverride(NO_FX_OVERRIDE);
    pendingMarketRateRef.current = true;
    onExchangeRateChange('', 'missing');
    if (pair.sourceBaseRate !== null) {
      pendingMarketRateRef.current = false;
      onExchangeRateChange(String(pair.sourceBaseRate), 'historical');
      return;
    }
    setRefreshNonce(current => current + 1);
  }, [onExchangeRateChange, pair.sourceBaseRate]);

  if (!isCrossCurrency) return null;

  return (
    <ExchangeRateCard
      pair={pair}
      destLabel="Journal amount"
      precision={journalPrecision}
      resetRateAccessibilityLabel="Reset to journal-date rate"
      onManualBaseRateChange={handleManualRateChange}
      onConvertedAmountChange={handleConvertedAmountChange}
      onResetToApiRate={resetToMarketRate}
      testIDPrefix={testIDPrefix}
      containerStyle={{ marginHorizontal: 0, marginTop: 0 }}
    />
  );
}
