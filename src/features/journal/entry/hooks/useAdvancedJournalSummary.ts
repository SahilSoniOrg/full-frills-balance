import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { JournalCalculator, JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { useMemo, useState } from 'react';

export interface AdvancedJournalLineLike {
  amount: number | string;
  exchangeRate?: number | string;
  transactionType: JournalLineInput['type'];
  accountCurrency?: string;
}

export function useAdvancedJournalSummary(lines: AdvancedJournalLineLike[]) {
  const { defaultCurrencyCode: defaultCurrency } = useWorkplace();
  const firstLineCurrency = lines[0]?.accountCurrency;

  // Identify all unique currencies present in the lines
  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    lines.forEach(line => {
      if (line.accountCurrency) {
        currencies.add(line.accountCurrency);
      }
    });

    // Only include default currency if explicitly used or if no other currencies exist
    if (currencies.size === 0) {
      currencies.add(defaultCurrency);
    }
    return Array.from(currencies).sort();
  }, [lines, defaultCurrency]);

  // Manual pick is sticky while still valid; otherwise derive from lines.
  const [manualCurrency, setManualCurrency] = useState<string | null>(null);

  const selectedCurrency = useMemo(() => {
    if (manualCurrency && availableCurrencies.includes(manualCurrency)) {
      return manualCurrency;
    }
    if (firstLineCurrency && availableCurrencies.includes(firstLineCurrency)) {
      return firstLineCurrency;
    }
    return availableCurrencies[0] || defaultCurrency;
  }, [manualCurrency, availableCurrencies, firstLineCurrency, defaultCurrency]);

  const selectedCurrencyRate = useMemo(() => {
    const line = lines.find(l => l.accountCurrency === selectedCurrency);
    if (!line) return 1;
    const rate =
      typeof line.exchangeRate === 'string' ? parseFloat(line.exchangeRate) : line.exchangeRate;
    return rate && rate > 0 ? rate : 1;
  }, [lines, selectedCurrency]);

  // Totals in currently selected display currency.
  const displayLines = useMemo<JournalLineInput[]>(() => {
    return lines.map(line => {
      const lineCurrency = line.accountCurrency || defaultCurrency;
      const baseAmount = JournalCalculator.getLineBaseAmount(
        {
          amount: line.amount,
          exchangeRate: line.exchangeRate,
          accountCurrency: lineCurrency,
        },
        defaultCurrency,
      );

      const displayAmount =
        selectedCurrency === defaultCurrency ? baseAmount : baseAmount / selectedCurrencyRate;

      return {
        amount: JournalCalculator.roundAmount(displayAmount),
        type: line.transactionType,
      };
    });
  }, [lines, selectedCurrency, defaultCurrency, selectedCurrencyRate]);

  // Canonical validation in base currency (independent of display currency).
  const baseLines = useMemo<JournalLineInput[]>(() => {
    return lines.map(line => ({
      amount: JournalCalculator.getLineBaseAmount(
        {
          amount: line.amount,
          exchangeRate: line.exchangeRate,
          accountCurrency: line.accountCurrency || defaultCurrency,
        },
        defaultCurrency,
      ),
      type: line.transactionType,
    }));
  }, [lines, defaultCurrency]);

  const totalDebits = useMemo(
    () => JournalCalculator.calculateTotalDebits(displayLines, defaultCurrency),
    [displayLines, defaultCurrency],
  );
  const totalCredits = useMemo(
    () => JournalCalculator.calculateTotalCredits(displayLines, defaultCurrency),
    [displayLines, defaultCurrency],
  );
  const isBalancedBase = useMemo(
    () => JournalCalculator.isBalanced(baseLines, defaultCurrency),
    [baseLines, defaultCurrency],
  );

  const isBalancedDisplay = useMemo(
    () => JournalCalculator.isBalanced(displayLines, selectedCurrency),
    [displayLines, selectedCurrency],
  );

  const imbalance = useMemo(
    () => JournalCalculator.calculateImbalance(baseLines, defaultCurrency),
    [baseLines, defaultCurrency],
  );

  const onSelectCurrency = (currency: string) => {
    setManualCurrency(currency);
  };

  return {
    totalDebits,
    totalCredits,
    isBalanced: isBalancedBase,
    isBalancedDisplay,
    imbalance,
    availableCurrencies,
    selectedCurrency,
    setSelectedCurrency: onSelectCurrency,
    baseCurrency: defaultCurrency,
  };
}
