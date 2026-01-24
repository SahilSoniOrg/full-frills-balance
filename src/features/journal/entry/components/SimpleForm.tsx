import { AppButton, AppInput, AppText } from '@/components/core';
import { AppConfig, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { accountingService } from '@/src/domain/AccountingService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SimpleFormProps {
    accounts: Account[];
    onSuccess: () => void;
    initialType?: 'expense' | 'income' | 'transfer';
}

type TabType = 'expense' | 'income' | 'transfer';

/**
 * SimpleForm - Guided entry mode for basic transactions.
 * Uses AccountingService to handle ledger construction.
 */
export const SimpleForm = ({ accounts, onSuccess, initialType = 'expense' }: SimpleFormProps) => {
    const { theme } = useTheme();

    const [type, setType] = useState<TabType>(initialType);
    const [amount, setAmount] = useState('');
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    const sourceAccount = accounts.find(a => a.id === sourceId);
    const destAccount = accounts.find(a => a.id === destinationId);
    const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const sourceCurrency = sourceAccount?.currencyCode || defaultCurrency;
    const destCurrency = destAccount?.currencyCode || defaultCurrency;
    const isCrossCurrency = sourceCurrency !== destCurrency;

    const numAmount = sanitizeAmount(amount) || 0;
    const convertedAmount = isCrossCurrency && exchangeRate
        ? Math.round(numAmount * exchangeRate * 100) / 100
        : numAmount;

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

    useEffect(() => {
        const lastSourceId = preferences.lastUsedSourceAccountId;
        const lastDestId = preferences.lastUsedDestinationAccountId;

        if (type === 'expense') {
            if (lastSourceId && accounts.some(a => a.id === lastSourceId)) setSourceId(lastSourceId);
            else if (accounts.length > 0) setSourceId(accounts[0].id);
            setDestinationId('');
        } else if (type === 'income') {
            if (lastDestId && accounts.some(a => a.id === lastDestId)) setDestinationId(lastDestId);
            else if (accounts.length > 0) setDestinationId(accounts[0].id);
            setSourceId('');
        } else {
            if (lastSourceId && accounts.some(a => a.id === lastSourceId)) setSourceId(lastSourceId);
            if (lastDestId && accounts.some(a => a.id === lastDestId)) setDestinationId(lastDestId);
        }
    }, [type, accounts]);

    const handleSave = async () => {
        if (!numAmount || numAmount <= 0) return;
        if (!sourceAccount || !destAccount) return;

        setIsSubmitting(true);
        try {
            const getRate = async (cur: string) => cur === defaultCurrency ? 1 : await exchangeRateService.getRate(cur, defaultCurrency);
            const sRate = await getRate(sourceCurrency);
            const dRate = await getRate(destCurrency);

            const journalData = accountingService.constructor.constructSimpleJournal({
                type,
                amount: type === 'transfer' ? convertedAmount : numAmount,
                sourceAccount: { id: sourceId, type: sourceAccount.accountType, rate: sRate },
                destinationAccount: { id: destinationId, type: destAccount.accountType, rate: dRate },
                description: type === 'expense' ? destAccount.name : type === 'income' ? sourceAccount.name : 'Transfer',
                date: Date.now()
            });

            // Adjust for transfer source amount
            if (type === 'transfer') {
                journalData.transactions[1].amount = numAmount;
                if (isCrossCurrency) {
                    journalData.description = `Transfer: ${sourceCurrency} → ${destCurrency}`;
                }
            }

            await journalRepository.createJournalWithTransactions(journalData);

            if (type === 'expense' || type === 'transfer') await preferences.setLastUsedSourceAccountId(sourceId);
            if (type === 'income' || type === 'transfer') await preferences.setLastUsedDestinationAccountId(destinationId);

            setAmount('');
            onSuccess();
        } catch (error) {
            console.error('Failed to save:', error);
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
            <View style={[styles.typeSelector, { backgroundColor: theme.surfaceSecondary }]}>
                {(['expense', 'income', 'transfer'] as const).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[
                            styles.typeButton,
                            type === t && { backgroundColor: t === 'expense' ? theme.expense : t === 'income' ? theme.income : theme.primary }
                        ]}
                        onPress={() => setType(t)}
                    >
                        <AppText
                            variant="caption"
                            weight="bold"
                            style={{ color: type === t ? theme.pureInverse : theme.textSecondary }}
                        >
                            {t.toUpperCase()}
                        </AppText>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.amountContainer}>
                <View style={[styles.amountRow, { borderBottomColor: theme.border }]}>
                    <AppText variant="heading" color="secondary" style={styles.currencySymbol}>
                        {sourceAccount?.currencyCode || defaultCurrency}
                    </AppText>
                    <AppInput
                        style={styles.amountInput}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus
                    />
                </View>
            </View>

            {type === 'expense' && (
                <>
                    {renderAccountGrid("What for?", accounts, destinationId, setDestinationId)}
                    {renderAccountGrid("Paid from?", accounts, sourceId, setSourceId)}
                </>
            )}

            {type === 'income' && (
                <>
                    {renderAccountGrid("Where from?", accounts, sourceId, setSourceId)}
                    {renderAccountGrid("Deposit to?", accounts, destinationId, setDestinationId)}
                </>
            )}

            {type === 'transfer' && (
                <>
                    {renderAccountGrid("From?", accounts, sourceId, setSourceId)}
                    {renderAccountGrid("To?", accounts, destinationId, setDestinationId)}
                </>
            )}

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
                    disabled={!amount || !sourceId || !destinationId || isSubmitting || isLoadingRate || !!rateError}
                    style={styles.saveButton}
                >
                    {isSubmitting ? 'Saving...' : `Save ${type}`}
                </AppButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: Spacing.lg },
    typeSelector: { flexDirection: 'row', marginBottom: Spacing.xl, borderRadius: 12, padding: 4 },
    typeButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    amountContainer: { alignItems: 'center', marginBottom: Spacing.xl },
    amountRow: { flexDirection: 'row', alignItems: 'baseline', borderBottomWidth: 1, paddingBottom: Spacing.xs },
    currencySymbol: { marginRight: Spacing.sm },
    amountInput: {
        fontSize: 48,
        fontWeight: 'bold',
        minWidth: 150,
        textAlign: 'center',
        borderWidth: 0,
        backgroundColor: 'transparent',
    },
    section: { marginBottom: Spacing.xl },
    sectionTitle: { marginBottom: Spacing.md, opacity: 0.6 },
    chipScroll: { paddingBottom: Spacing.xs },
    chip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: 12, marginRight: Spacing.md },
    conversionPreview: { padding: Spacing.lg, borderRadius: 12, marginBottom: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
    footer: { marginTop: Spacing.lg },
    saveButton: { height: 56 },
});
