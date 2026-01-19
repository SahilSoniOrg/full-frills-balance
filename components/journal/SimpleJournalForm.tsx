import { AppButton, AppInput, AppText } from '@/components/core';
import { AppConfig, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SimpleJournalFormProps {
    accounts: Account[];
    onSuccess: () => void;
    initialType?: 'expense' | 'income' | 'transfer';
}

type TabType = 'expense' | 'income' | 'transfer';

export default function SimpleJournalForm({ accounts, onSuccess, initialType = 'expense' }: SimpleJournalFormProps) {
    const { theme } = useTheme();

    const [type, setType] = useState<TabType>(initialType);
    const [amount, setAmount] = useState('');
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Multi-currency state
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    // Use all accounts for flexibility (e.g., refunds, adjustments)
    const allAccounts = accounts;

    // Detect cross-currency transaction
    const sourceAccount = accounts.find(a => a.id === sourceId);
    const destAccount = accounts.find(a => a.id === destinationId);
    const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const sourceCurrency = sourceAccount?.currencyCode || defaultCurrency;
    const destCurrency = destAccount?.currencyCode || defaultCurrency;
    const isCrossCurrency = sourceCurrency !== destCurrency;

    // Calculate converted amount for preview
    const numAmount = sanitizeAmount(amount) || 0;
    const convertedAmount = isCrossCurrency && exchangeRate
        ? Math.round(numAmount * exchangeRate * 100) / 100
        : numAmount;

    // Fetch exchange rate when currencies differ
    useEffect(() => {
        if (!isCrossCurrency || !sourceId || !destinationId) {
            setExchangeRate(null);
            setRateError(null);
            return;
        }

        const fetchRate = async () => {
            setIsLoadingRate(true);
            setRateError(null);
            try {
                const rate = await exchangeRateService.getRate(sourceCurrency, destCurrency);
                if (rate <= 0) {
                    setRateError(`No exchange rate available for ${sourceCurrency} → ${destCurrency}`);
                    setExchangeRate(null);
                } else {
                    setExchangeRate(rate);
                }
            } catch (error) {
                setRateError(`Failed to fetch exchange rate`);
                setExchangeRate(null);
            } finally {
                setIsLoadingRate(false);
            }
        };

        fetchRate();
    }, [sourceId, destinationId, sourceCurrency, destCurrency, isCrossCurrency]);

    // Smart Defaults
    useEffect(() => {
        const lastSourceId = preferences.lastUsedSourceAccountId;
        const lastDestId = preferences.lastUsedDestinationAccountId;

        if (type === 'expense') {
            if (lastSourceId && allAccounts.some((a: Account) => a.id === lastSourceId)) setSourceId(lastSourceId);
            else if (allAccounts.length > 0) setSourceId(allAccounts[0].id);
            setDestinationId('');
        } else if (type === 'income') {
            if (lastDestId && allAccounts.some((a: Account) => a.id === lastDestId)) setDestinationId(lastDestId);
            else if (allAccounts.length > 0) setDestinationId(allAccounts[0].id);
            setSourceId('');
        } else {
            // Transfer
            if (lastSourceId && allAccounts.some((a: Account) => a.id === lastSourceId)) setSourceId(lastSourceId);
            if (lastDestId && allAccounts.some((a: Account) => a.id === lastDestId)) setDestinationId(lastDestId);
        }
    }, [type, allAccounts]);

    const handleSave = async () => {
        if (!numAmount || numAmount <= 0) return;

        // Validation
        if (type === 'expense' && (!sourceId || !destinationId)) return;
        if (type === 'income' && (!sourceId || !destinationId)) return;
        if (type === 'transfer' && (!sourceId || !destinationId || sourceId === destinationId)) return;

        // Cross-currency validation
        if (isCrossCurrency && !exchangeRate) {
            return; // Can't save without a valid exchange rate
        }

        setIsSubmitting(true);
        try {
            // Calculate exchange rates relative to journal currency
            const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
            const getExchangeRateToBase = async (currency: string) => {
                if (currency === defaultCurrency) return 1;
                return await exchangeRateService.getRate(currency, defaultCurrency);
            };

            const sourceRate = await getExchangeRateToBase(sourceCurrency);
            const destRate = await getExchangeRateToBase(destCurrency);

            if (type === 'expense') {
                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: destAccount?.name || 'Expense',
                    currencyCode: defaultCurrency,
                    transactions: [
                        { accountId: destinationId, amount: numAmount, transactionType: TransactionType.DEBIT, exchangeRate: destRate },
                        { accountId: sourceId, amount: numAmount, transactionType: TransactionType.CREDIT, exchangeRate: sourceRate }
                    ]
                });
                await preferences.setLastUsedSourceAccountId(sourceId);
            } else if (type === 'income') {
                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: sourceAccount?.name || 'Income',
                    currencyCode: defaultCurrency,
                    transactions: [
                        { accountId: destinationId, amount: numAmount, transactionType: TransactionType.DEBIT, exchangeRate: destRate },
                        { accountId: sourceId, amount: numAmount, transactionType: TransactionType.CREDIT, exchangeRate: sourceRate }
                    ]
                });
                await preferences.setLastUsedDestinationAccountId(destinationId);
            } else {
                // Transfer - use pre-calculated converted amount
                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: isCrossCurrency
                        ? `Transfer: ${sourceCurrency} → ${destCurrency}`
                        : `Transfer`,
                    currencyCode: defaultCurrency,
                    transactions: [
                        {
                            accountId: destinationId,
                            amount: convertedAmount,
                            transactionType: TransactionType.DEBIT,
                            exchangeRate: destRate
                        },
                        {
                            accountId: sourceId,
                            amount: numAmount,
                            transactionType: TransactionType.CREDIT,
                            exchangeRate: sourceRate
                        }
                    ]
                });
                await preferences.setLastUsedSourceAccountId(sourceId);
                await preferences.setLastUsedDestinationAccountId(destinationId);
            }

            setAmount('');
            onSuccess();
        } catch (error) {
            console.error('Failed to save journal:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderAccountGrid = (title: string, accountList: Account[], selectedId: string, onSelect: (id: string) => void) => (
        <View style={styles.section}>
            <AppText variant="subheading" style={styles.sectionTitle}>{title}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {accountList.map(account => (
                    <TouchableOpacity
                        key={account.id}
                        style={[
                            styles.chip,
                            { backgroundColor: theme.surfaceSecondary },
                            selectedId === account.id && { backgroundColor: theme.primary }
                        ]}
                        onPress={() => onSelect(account.id)}
                    >
                        <AppText
                            variant="body"
                            style={{ color: selectedId === account.id ? theme.pureInverse : theme.text }}
                        >
                            {account.name}
                        </AppText>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Type Selector: Ivy Style */}
            <View style={[styles.typeSelector, { backgroundColor: theme.surfaceSecondary }]}>
                {([
                    { key: 'expense', label: 'EXPENSE', color: theme.expense, icon: '−' },
                    { key: 'income', label: 'INCOME', color: theme.income, icon: '+' },
                    { key: 'transfer', label: 'TRANSFER', color: theme.transfer, icon: '⇄' }
                ] as const).map(t => (
                    <TouchableOpacity
                        key={t.key}
                        style={[
                            styles.typeButton,
                            type === t.key && { backgroundColor: t.color }
                        ]}
                        onPress={() => setType(t.key)}
                    >
                        <View style={styles.tabRow}>
                            {type === t.key && <AppText variant="caption" weight="bold" style={[styles.tabIcon, { color: theme.pureInverse }]}>{t.icon}</AppText>}
                            <AppText
                                variant="caption"
                                weight="bold"
                                style={{ color: type === t.key ? theme.pureInverse : theme.textSecondary }}
                            >
                                {t.label}
                            </AppText>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Amount Input Section: Hero Style */}
            <View style={styles.amountContainer}>
                <View style={[styles.amountRow, { borderBottomColor: theme.border }]}>
                    <AppText variant="heading" color="secondary" style={styles.currencySymbol}>
                        {accounts.find(a => a.id === (type === 'income' ? destinationId : sourceId))?.currencyCode || (preferences.defaultCurrencyCode || AppConfig.defaultCurrency)}
                    </AppText>
                    <AppInput
                        style={styles.amountInput}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus
                        placeholderTextColor={theme.textTertiary}
                    />
                </View>
            </View>

            {/* Dynamic Selectors based on context */}
            {type === 'expense' && (
                <>
                    {renderAccountGrid("What for?", allAccounts, destinationId, setDestinationId)}
                    {renderAccountGrid("Paid from?", allAccounts, sourceId, setSourceId)}
                </>
            )}

            {type === 'income' && (
                <>
                    {renderAccountGrid("Where from?", allAccounts, sourceId, setSourceId)}
                    {renderAccountGrid("Deposit to?", allAccounts, destinationId, setDestinationId)}
                </>
            )}

            {type === 'transfer' && (
                <>
                    {renderAccountGrid("From?", allAccounts, sourceId, setSourceId)}
                    {renderAccountGrid("To?", allAccounts, destinationId, setDestinationId)}
                </>
            )}

            {/* Cross-currency conversion preview */}
            {isCrossCurrency && sourceId && destinationId && (
                <View style={[styles.conversionPreview, { backgroundColor: theme.surfaceSecondary }]}>
                    {isLoadingRate ? (
                        <AppText variant="caption" color="secondary">Loading exchange rate...</AppText>
                    ) : rateError ? (
                        <AppText variant="caption" color="error">{rateError}</AppText>
                    ) : exchangeRate ? (
                        <>
                            <AppText variant="caption" color="secondary">
                                1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                            </AppText>
                            {numAmount > 0 && (
                                <AppText variant="body" weight="semibold">
                                    {numAmount.toFixed(2)} {sourceCurrency} → {convertedAmount.toFixed(2)} {destCurrency}
                                </AppText>
                            )}
                        </>
                    ) : null}
                </View>
            )}

            <View style={styles.footer}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={!amount || !sourceId || !destinationId || isSubmitting || isLoadingRate || !!rateError || (isCrossCurrency && !exchangeRate)}
                    style={styles.saveButton}
                >
                    {isSubmitting ? 'Saving...' : `Save ${type}`}
                </AppButton>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: Spacing.lg,
    },
    typeSelector: {
        flexDirection: 'row',
        marginBottom: Spacing.xl,
        borderRadius: 12,
        padding: 4,
    },
    typeButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    amountContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        borderBottomWidth: 1,
        paddingBottom: Spacing.xs,
    },
    tabRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tabIcon: {
        // Color set inline via theme.pureInverse
    },
    currencySymbol: {
        marginRight: Spacing.sm,
    },
    amountInput: {
        fontSize: 48,
        fontWeight: 'bold',
        minWidth: 150,
        textAlign: 'center',
        borderWidth: 0,
        backgroundColor: 'transparent',
    },
    section: {
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        opacity: 0.6,
    },
    chipScroll: {
        paddingBottom: Spacing.xs,
    },
    chip: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: 12,
        marginRight: Spacing.md,
    },
    conversionPreview: {
        padding: Spacing.lg,
        borderRadius: 12,
        marginBottom: Spacing.lg,
        alignItems: 'center',
        gap: Spacing.xs,
    },
    footer: {
        marginTop: Spacing.lg,
    },
    saveButton: {
        height: 56,
    },
});
