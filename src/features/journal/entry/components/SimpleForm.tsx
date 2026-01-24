import { AppButton, AppCard, AppInput, AppText } from '@/components/core';
import { AppConfig, Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { accountingService } from '@/src/domain/AccountingService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
    const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
    const [journalTime, setJournalTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
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
        if (sourceId === destinationId) {
            console.warn('Source and destination accounts must be different');
            return;
        }

        setIsSubmitting(true);
        try {
            const getRate = async (cur: string) => cur === defaultCurrency ? 1 : await exchangeRateService.getRate(cur, defaultCurrency);
            const sRate = await getRate(sourceCurrency);
            const dRate = await getRate(destCurrency);

            const journalData: CreateJournalData = {
                ...accountingService.constructSimpleJournal({
                    type,
                    amount: type === 'transfer' ? convertedAmount : numAmount,
                    sourceAccount: { id: sourceId, type: sourceAccount.accountType, rate: sRate },
                    destinationAccount: { id: destinationId, type: destAccount.accountType, rate: dRate },
                    description: type === 'expense' ? destAccount.name : type === 'income' ? sourceAccount.name : 'Transfer',
                    date: new Date(`${journalDate}T${journalTime}`).getTime()
                }),
                currencyCode: defaultCurrency
            };

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

    const renderAccountSelector = (title: string, accountList: Account[], selectedId: string, onSelect: (id: string) => void) => (
        <View style={styles.section}>
            <AppText variant="caption" weight="bold" color="tertiary" style={styles.sectionTitle}>
                {title.toUpperCase()}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountScroll}>
                {accountList.map(account => (
                    <TouchableOpacity
                        key={account.id}
                        style={[
                            styles.accountCard,
                            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                            selectedId === account.id && { backgroundColor: type === 'expense' ? theme.expense + '15' : type === 'income' ? theme.income + '15' : theme.primary + '15', borderColor: type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary }
                        ]}
                        onPress={() => onSelect(account.id)}
                    >
                        <View style={[styles.accountIndicator, { backgroundColor: type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary, opacity: selectedId === account.id ? 1 : 0.2 }]} />
                        <AppText
                            variant="body"
                            weight={selectedId === account.id ? "semibold" : "regular"}
                            style={{ color: theme.text, flex: 1 }}
                        >
                            {account.name}
                        </AppText>
                        {selectedId === account.id && (
                            <Ionicons name="checkmark-circle" size={18} color={type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary} />
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    const activeColor = type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;

    return (
        <View style={styles.container}>
            {/* Amount Section */}
            <View style={styles.heroSection}>
                <AppText variant="caption" weight="bold" color="tertiary" style={styles.labelCenter}>
                    AMOUNT
                </AppText>
                <View style={styles.amountWrapper}>
                    <View style={styles.currencyWrapper}>
                        <AppText variant="title" weight="bold" style={{ color: activeColor, opacity: 0.6 }}>
                            {sourceAccount?.currencyCode || defaultCurrency}
                        </AppText>
                    </View>
                    <TextInput
                        style={[styles.heroInput, { color: activeColor }]}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus
                        placeholderTextColor={activeColor + '30'}
                        cursorColor={activeColor}
                        selectionColor={activeColor + '40'}
                    />
                </View>
            </View>

            {/* Type Selector */}
            <View style={[styles.typeSelectorContainer, { backgroundColor: theme.surfaceSecondary }]}>
                {(['expense', 'income', 'transfer'] as const).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[
                            styles.typeTab,
                            type === t && { backgroundColor: theme.surface, ...Shape.elevation.sm }
                        ]}
                        onPress={() => setType(t)}
                    >
                        <AppText
                            variant="caption"
                            weight="bold"
                            style={{ color: type === t ? activeColor : theme.textSecondary }}
                        >
                            {t.toUpperCase()}
                        </AppText>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Account Selection */}
            <AppCard elevation="none" variant="secondary" style={styles.mainCard}>
                {type === 'expense' && (
                    <>
                        {renderAccountSelector("To Category / Account", accounts, destinationId, setDestinationId)}
                        <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                        {renderAccountSelector("From Account", accounts, sourceId, setSourceId)}
                    </>
                )}

                {type === 'income' && (
                    <>
                        {renderAccountSelector("From Source / Account", accounts, sourceId, setSourceId)}
                        <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                        {renderAccountSelector("To Account", accounts, destinationId, setDestinationId)}
                    </>
                )}

                {type === 'transfer' && (
                    <>
                        {renderAccountSelector("Source Account", accounts, sourceId, setSourceId)}
                        <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                        {renderAccountSelector("Destination Account", accounts, destinationId, setDestinationId)}
                    </>
                )}
            </AppCard>

            {/* Exchange Rate / Conversion */}
            {isCrossCurrency && sourceId && destinationId && (
                <View style={[styles.conversionBadge, { backgroundColor: theme.primary + '10' }]}>
                    {isLoadingRate ? (
                        <AppText variant="caption" color="secondary">Fetching rate...</AppText>
                    ) : rateError ? (
                        <AppText variant="caption" color="error">{rateError}</AppText>
                    ) : exchangeRate ? (
                        <View style={styles.conversionRow}>
                            <AppText variant="caption" color="primary" weight="medium">
                                1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                            </AppText>
                            {numAmount > 0 && (
                                <AppText variant="caption" color="primary">
                                    Total: {convertedAmount.toFixed(2)} {destCurrency}
                                </AppText>
                            )}
                        </View>
                    ) : null}
                </View>
            )}

            {/* Schedule Section */}
            <View style={styles.scheduleSection}>
                <AppText variant="caption" weight="bold" color="tertiary" style={styles.sectionTitle}>
                    SCHEDULE
                </AppText>
                <View style={[styles.scheduleCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <AppInput
                        placeholder="Date"
                        value={journalDate}
                        onChangeText={setJournalDate}
                        containerStyle={styles.flex1}
                        style={[styles.scheduleInput, { color: theme.text }]}
                    />
                    <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />
                    <AppInput
                        placeholder="Time"
                        value={journalTime}
                        onChangeText={setJournalTime}
                        containerStyle={styles.flex1}
                        style={[styles.scheduleInput, { color: theme.text }]}
                    />
                </View>
            </View>

            {/* Actions */}
            <View style={styles.footer}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={!amount || !sourceId || !destinationId || (sourceId === destinationId) || isSubmitting || isLoadingRate || !!rateError}
                    style={[styles.saveButton, { backgroundColor: activeColor }]}
                >
                    {isSubmitting ? 'SAVING...' : sourceId === destinationId ? 'CHOOSE DIFFERENT ACCOUNTS' : `SAVE ${type.toUpperCase()}`}
                </AppButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: Spacing.lg },
    heroSection: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.xxxl,
        marginTop: Spacing.lg,
    },
    labelCenter: { textAlign: 'center', marginBottom: Spacing.md, letterSpacing: 2, opacity: 0.6 },
    amountWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    currencyWrapper: {
        marginRight: Spacing.sm,
        marginTop: 6, // Visual baseline alignment
    },
    heroInput: {
        fontSize: 72,
        fontWeight: '800',
        textAlign: 'center',
        padding: 0,
        margin: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
    },
    typeSelectorContainer: {
        flexDirection: 'row',
        padding: 6,
        borderRadius: 16,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    typeTab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
    },
    mainCard: {
        borderRadius: 24,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    section: { marginBottom: Spacing.lg },
    sectionTitle: { marginBottom: Spacing.sm, letterSpacing: 0.5, marginLeft: 4 },
    accountScroll: { paddingVertical: Spacing.xs },
    accountCard: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: 12,
        marginRight: Spacing.md,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    accountIndicator: {
        width: 4,
        height: 16,
        borderRadius: 2,
    },
    cardDivider: { height: 1, marginVertical: Spacing.md, opacity: 0.3 },
    conversionBadge: {
        padding: Spacing.md,
        borderRadius: 12,
        marginBottom: Spacing.xl,
        alignItems: 'center',
    },
    conversionRow: { flexDirection: 'row', gap: Spacing.lg },
    scheduleSection: { marginBottom: Spacing.xxl },
    scheduleCard: {
        flexDirection: 'row',
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    scheduleInput: { borderWidth: 0, height: 52, fontSize: 16, fontWeight: '600' },
    flex1: { flex: 1 },
    verticalDivider: { width: 1, height: 24, marginHorizontal: Spacing.md },
    footer: { marginTop: Spacing.md },
    saveButton: { height: 60, borderRadius: 16 },
});
