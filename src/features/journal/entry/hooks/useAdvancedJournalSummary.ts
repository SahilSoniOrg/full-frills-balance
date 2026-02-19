import { AppConfig } from '@/src/constants';
import { JournalCalculator, JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { preferences } from '@/src/utils/preferences';
import { useEffect, useMemo, useState } from 'react';

interface AdvancedJournalLineLike {
    amount: number | string;
    exchangeRate?: number | string;
    transactionType: JournalLineInput['type'];
    accountCurrency?: string;
}

export function useAdvancedJournalSummary(lines: AdvancedJournalLineLike[]) {
    const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const firstLineCurrency = lines[0]?.accountCurrency;

    // Identify all unique currencies present in the lines
    const availableCurrencies = useMemo(() => {
        const currencies = new Set<string>();
        lines.forEach(line => {
            if (line.accountCurrency) {
                currencies.add(line.accountCurrency);
            }
        });
        // Always include default currency as a fallback/option
        currencies.add(defaultCurrency);
        return Array.from(currencies).sort();
    }, [lines, defaultCurrency]);

    // Default to first line currency when available, otherwise app default.
    const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
        return lines[0]?.accountCurrency || defaultCurrency;
    });
    const [isCurrencyManuallySelected, setIsCurrencyManuallySelected] = useState(false);

    // If user has not manually chosen a currency, keep summary currency aligned with first line.
    useEffect(() => {
        if (!isCurrencyManuallySelected && firstLineCurrency && firstLineCurrency !== selectedCurrency) {
            setSelectedCurrency(firstLineCurrency);
        }
    }, [firstLineCurrency, isCurrencyManuallySelected, selectedCurrency]);

    // Keep selected currency valid if available currencies change.
    useEffect(() => {
        if (!availableCurrencies.includes(selectedCurrency)) {
            setSelectedCurrency(availableCurrencies[0] || defaultCurrency);
            setIsCurrencyManuallySelected(false);
        }
    }, [availableCurrencies, selectedCurrency, defaultCurrency]);

    const selectedCurrencyRate = useMemo(() => {
        const line = lines.find(l => l.accountCurrency === selectedCurrency);
        if (!line) return 1;
        const rate = typeof line.exchangeRate === 'string' ? parseFloat(line.exchangeRate) : line.exchangeRate;
        return rate && rate > 0 ? rate : 1;
    }, [lines, selectedCurrency]);

    // Totals in currently selected display currency.
    const displayLines = useMemo<JournalLineInput[]>(() => {
        return lines.map((line) => {
            const lineCurrency = line.accountCurrency || defaultCurrency;
            const baseAmount = JournalCalculator.getLineBaseAmount({
                amount: line.amount,
                exchangeRate: line.exchangeRate,
                accountCurrency: lineCurrency
            });

            const displayAmount = selectedCurrency === defaultCurrency
                ? baseAmount
                : baseAmount / selectedCurrencyRate;

            return {
                amount: JournalCalculator.roundAmount(displayAmount),
                type: line.transactionType,
            };
        });
    }, [lines, selectedCurrency, defaultCurrency, selectedCurrencyRate]);

    // Canonical validation in base currency (independent of display currency).
    const baseLines = useMemo<JournalLineInput[]>(() => {
        return lines.map((line) => ({
            amount: JournalCalculator.getLineBaseAmount({
                amount: line.amount,
                exchangeRate: line.exchangeRate,
                accountCurrency: line.accountCurrency || defaultCurrency
            }),
            type: line.transactionType,
        }));
    }, [lines, defaultCurrency]);

    const totalDebits = useMemo(() => JournalCalculator.calculateTotalDebits(displayLines), [displayLines]);
    const totalCredits = useMemo(() => JournalCalculator.calculateTotalCredits(displayLines), [displayLines]);
    const isBalanced = useMemo(() => {
        const baseDebits = JournalCalculator.calculateTotalDebits(baseLines);
        const baseCredits = JournalCalculator.calculateTotalCredits(baseLines);
        return Math.abs(baseDebits - baseCredits) < 0.0001;
    }, [baseLines]);

    const imbalance = useMemo(() => JournalCalculator.calculateImbalance(baseLines), [baseLines]);

    const onSelectCurrency = (currency: string) => {
        setIsCurrencyManuallySelected(true);
        setSelectedCurrency(currency);
    };

    return {
        totalDebits,
        totalCredits,
        isBalanced,
        imbalance,
        availableCurrencies,
        selectedCurrency,
        setSelectedCurrency: onSelectCurrency
    };
}
