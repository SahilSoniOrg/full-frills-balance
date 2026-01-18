import { AppButton, AppText } from '@/components/core';
import { AppConfig, Spacing, ThemeMode, useThemeColors } from '@/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface SimpleJournalFormProps {
    accounts: Account[];
    themeMode: ThemeMode;
    onSuccess: () => void;
    initialType?: 'expense' | 'income' | 'transfer';
}

type TabType = 'expense' | 'income' | 'transfer';

export default function SimpleJournalForm({ accounts, themeMode, onSuccess, initialType = 'expense' }: SimpleJournalFormProps) {
    const theme = useThemeColors(themeMode);

    const [type, setType] = useState<TabType>(initialType);
    const [amount, setAmount] = useState('');
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter accounts
    const assetAccounts = accounts.filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY);
    const expenseAccounts = accounts.filter(a => a.accountType === AccountType.EXPENSE);
    const incomeAccounts = accounts.filter(a => a.accountType === AccountType.INCOME);

    // Smart Defaults
    useEffect(() => {
        const lastSourceId = preferences.lastUsedSourceAccountId;
        const lastDestId = preferences.lastUsedDestinationAccountId;

        if (type === 'expense') {
            if (lastSourceId && assetAccounts.some(a => a.id === lastSourceId)) setSourceId(lastSourceId);
            else if (assetAccounts.length > 0) setSourceId(assetAccounts[0].id);
            setDestinationId(''); // Reset for category selection
        } else if (type === 'income') {
            if (lastDestId && assetAccounts.some(a => a.id === lastDestId)) setDestinationId(lastDestId);
            else if (assetAccounts.length > 0) setDestinationId(assetAccounts[0].id);
            setSourceId(''); // Reset for category selection
        } else {
            // Transfer
            if (lastSourceId && assetAccounts.some(a => a.id === lastSourceId)) setSourceId(lastSourceId);
            if (lastDestId && assetAccounts.some(a => a.id === lastDestId)) setDestinationId(lastDestId);
        }
    }, [type, accounts]);

    const handleSave = async () => {
        const numAmount = sanitizeAmount(amount);
        if (!numAmount || numAmount <= 0) return;

        // Validation
        if (type === 'expense' && (!sourceId || !destinationId)) return;
        if (type === 'income' && (!sourceId || !destinationId)) return;
        if (type === 'transfer' && (!sourceId || !destinationId || sourceId === destinationId)) return;

        setIsSubmitting(true);
        try {
            const fromAcc = accounts.find(a => a.id === sourceId || (type === 'income' && a.id === sourceId));
            const toAcc = accounts.find(a => a.id === destinationId || (type === 'expense' && a.id === destinationId));

            if (type === 'expense') {
                // Expense: Source (Asset) Credit -> Destination (Expense) Debit
                // Wait, simple entries usually think: Debit Expense, Credit Asset. 
                // Yes.
                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: accounts.find(a => a.id === destinationId)?.name || 'Expense',
                    currencyCode: AppConfig.defaultCurrency,
                    transactions: [
                        { accountId: destinationId, amount: numAmount, transactionType: TransactionType.DEBIT, exchangeRate: 1 },
                        { accountId: sourceId, amount: numAmount, transactionType: TransactionType.CREDIT, exchangeRate: 1 }
                    ]
                });
                await preferences.setLastUsedSourceAccountId(sourceId);
            } else if (type === 'income') {
                // Income: Source (Income) Credit -> Destination (Asset) Debit
                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: accounts.find(a => a.id === sourceId)?.name || 'Income',
                    currencyCode: AppConfig.defaultCurrency,
                    transactions: [
                        { accountId: destinationId, amount: numAmount, transactionType: TransactionType.DEBIT, exchangeRate: 1 },
                        { accountId: sourceId, amount: numAmount, transactionType: TransactionType.CREDIT, exchangeRate: 1 }
                    ]
                });
                await preferences.setLastUsedDestinationAccountId(destinationId);
            } else {
                // Transfer: Source (Asset) Credit -> Destination (Asset) Debit
                const fromAcc = accounts.find(a => a.id === sourceId);
                const toAcc = accounts.find(a => a.id === destinationId);
                const fromCurrency = fromAcc?.currencyCode || AppConfig.defaultCurrency;
                const toCurrency = toAcc?.currencyCode || AppConfig.defaultCurrency;

                // We store amounts in account-local currency. 
                // We need to calculate how much toCredit and how much toDebit.
                // Normally the user enters the amount they "send" (fromAmount).
                const fromToUSDRate = await exchangeRateService.getRate(fromCurrency, AppConfig.defaultCurrency);
                const toToUSDRate = await exchangeRateService.getRate(toCurrency, AppConfig.defaultCurrency);

                let fromAmount = numAmount;
                let toAmount = numAmount;

                if (fromCurrency !== toCurrency) {
                    const fromToToRate = await exchangeRateService.getRate(fromCurrency, toCurrency);
                    toAmount = Math.round(numAmount * fromToToRate * 100) / 100;
                }

                await journalRepository.createJournalWithTransactions({
                    journalDate: Date.now(),
                    description: `Transfer: ${fromCurrency} to ${toCurrency}`,
                    currencyCode: AppConfig.defaultCurrency,
                    transactions: [
                        {
                            accountId: destinationId,
                            amount: toAmount,
                            transactionType: TransactionType.DEBIT,
                            exchangeRate: toToUSDRate
                        },
                        {
                            accountId: sourceId,
                            amount: fromAmount,
                            transactionType: TransactionType.CREDIT,
                            exchangeRate: fromToUSDRate
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
            <AppText variant="subheading" themeMode={themeMode} style={styles.sectionTitle}>{title}</AppText>
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
                            themeMode={themeMode}
                            style={{ color: selectedId === account.id ? '#fff' : theme.text }}
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
                            {type === t.key && <AppText style={styles.tabIcon}>{t.icon}</AppText>}
                            <AppText
                                variant="caption"
                                themeMode={themeMode}
                                style={[styles.typeButtonText, { color: type === t.key ? '#fff' : theme.textSecondary }]}
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
                    <AppText variant="subheading" color="secondary" themeMode={themeMode} style={styles.currencySymbol}>
                        {accounts.find(a => a.id === (type === 'income' ? destinationId : sourceId))?.currencyCode || AppConfig.defaultCurrency}
                    </AppText>
                    <TextInput
                        style={[styles.amountInput, { color: theme.text }]}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus
                        placeholderTextColor={theme.textTertiary}
                    />
                </View>
            </View>

            {/* Dynamic Selectors based on type */}
            {type === 'expense' && (
                <>
                    {renderAccountGrid("What for?", expenseAccounts, destinationId, setDestinationId)}
                    {renderAccountGrid("Paid from?", assetAccounts, sourceId, setSourceId)}
                </>
            )}

            {type === 'income' && (
                <>
                    {renderAccountGrid("Where from?", incomeAccounts, sourceId, setSourceId)}
                    {renderAccountGrid("Deposit to?", assetAccounts, destinationId, setDestinationId)}
                </>
            )}

            {type === 'transfer' && (
                <>
                    {renderAccountGrid("From?", assetAccounts, sourceId, setSourceId)}
                    {renderAccountGrid("To?", assetAccounts, destinationId, setDestinationId)}
                </>
            )}

            <View style={styles.footer}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={!amount || !sourceId || !destinationId || isSubmitting}
                    themeMode={themeMode}
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
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 4,
    },
    typeButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    typeButtonText: {
        fontWeight: 'bold',
        fontSize: 10,
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
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    currencySymbol: {
        marginRight: Spacing.sm,
        fontSize: 24,
    },
    amountInput: {
        fontSize: 48,
        fontWeight: 'bold',
        minWidth: 150,
        textAlign: 'center',
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
    footer: {
        marginTop: Spacing.lg,
    },
    saveButton: {
        height: 56,
    },
});
