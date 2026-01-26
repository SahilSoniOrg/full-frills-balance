import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/constants';
import { AppButton } from '@/src/components/core/AppButton';
import { AppCard } from '@/src/components/core/AppCard';
import { AppInput } from '@/src/components/core/AppInput';
import { AppText } from '@/src/components/core/AppText';
import { Box } from '@/src/components/core/Box';
import { Stack } from '@/src/components/core/Stack';
import Account, { AccountType } from '@/src/data/models/Account';
import { CreateJournalData } from '@/src/data/repositories/JournalRepository';
import { useJournalActions } from '@/src/features/journal';
import { useTheme } from '@/src/hooks/use-theme';
import { accountingService } from '@/src/services/AccountingService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
    const { createJournal } = useJournalActions();

    // Filter accounts by type
    const transactionAccounts = accounts.filter(a =>
        a.accountType === AccountType.ASSET ||
        a.accountType === AccountType.LIABILITY
    );
    const expenseAccounts = accounts.filter(a => a.accountType === AccountType.EXPENSE);
    const incomeAccounts = accounts.filter(a => a.accountType === AccountType.INCOME);

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
            } catch {
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
            // Expenses: Pay FROM (Asset/Liability) -> TO (Expense)
            const isSourceValid = sourceId && transactionAccounts.some(a => a.id === sourceId);
            if (!isSourceValid) {
                if (lastSourceId && transactionAccounts.some(a => a.id === lastSourceId)) {
                    setSourceId(lastSourceId);
                } else if (transactionAccounts.length > 0) {
                    setSourceId(transactionAccounts[0].id);
                } else {
                    setSourceId('');
                }
            }

            const isDestValid = destinationId && accounts.find(a => a.id === destinationId)?.accountType === AccountType.EXPENSE;
            if (!isDestValid) {
                setDestinationId('');
            }
        } else if (type === 'income') {
            // Income: Receive FROM (Income) -> TO (Asset/Liability)
            const isDestValid = destinationId && transactionAccounts.some(a => a.id === destinationId);
            if (!isDestValid) {
                if (lastDestId && transactionAccounts.some(a => a.id === lastDestId)) {
                    setDestinationId(lastDestId);
                } else if (transactionAccounts.length > 0) {
                    setDestinationId(transactionAccounts[0].id);
                } else {
                    setDestinationId('');
                }
            }

            const isSourceValid = sourceId && accounts.find(a => a.id === sourceId)?.accountType === AccountType.INCOME;
            if (!isSourceValid) {
                setSourceId('');
            }
        } else {
            // Transfer: Asset/Liability -> Asset/Liability (usually)
            const isSourceValid = sourceId && accounts.some(a => a.id === sourceId);
            if (!isSourceValid && lastSourceId && accounts.some(a => a.id === lastSourceId)) {
                setSourceId(lastSourceId);
            }

            const isDestValid = destinationId && accounts.some(a => a.id === destinationId);
            if (!isDestValid && lastDestId && accounts.some(a => a.id === lastDestId)) {
                setDestinationId(lastDestId);
            }
        }
    }, [type, accounts, transactionAccounts, sourceId, destinationId]);


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

            await createJournal(journalData);

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
        <Box gap="sm" marginVertical="md">
            <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs }}>
                {title.toUpperCase()}
            </AppText>
            <View style={{ minHeight: 80 }}>
                <FlashList<Account>
                    data={accountList}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // @ts-ignore: estimatedItemSize missing in v2 types
                    estimatedItemSize={200}
                    extraData={selectedId}
                    renderItem={({ item: account }) => (
                        <TouchableOpacity
                            style={[
                                styles.accountCard,
                                { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                                selectedId === account.id && {
                                    backgroundColor: withOpacity(activeColor, Opacity.soft),
                                    borderColor: activeColor
                                }
                            ]}
                            onPress={() => onSelect(account.id)}
                        >
                            <View style={[styles.accountIndicator, { backgroundColor: activeColor, opacity: selectedId === account.id ? 1 : Opacity.soft }]} />
                            <AppText
                                variant="body"
                                weight={selectedId === account.id ? "semibold" : "regular"}
                                style={{ color: theme.text, flex: 1 }}
                            >
                                {account.name}
                            </AppText>
                            {selectedId === account.id && (
                                <Ionicons name="checkmark-circle" size={18} color={activeColor} />
                            )}
                        </TouchableOpacity>
                    )}
                    contentContainerStyle={{ paddingHorizontal: Spacing.xs }}
                    ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
                />
            </View>
        </Box>
    );

    const activeColor = type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;

    return (
        <Box padding="lg">
            {/* Amount Section */}
            <Stack align="center" marginVertical="lg" space="md">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ letterSpacing: 2 }}>
                    AMOUNT
                </AppText>
                <Stack horizontal align="center" justify="center">
                    <Box marginVertical="sm" style={{ marginTop: Spacing.md }}>
                        <AppText variant="title" weight="bold" style={{ color: activeColor, opacity: Opacity.heavy }}>
                            {sourceAccount?.currencyCode || defaultCurrency}
                        </AppText>
                    </Box>
                    <AppInput
                        variant="hero"
                        style={{ color: activeColor }}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus
                        cursorColor={activeColor}
                        selectionColor={withOpacity(activeColor, Opacity.muted)}
                        testID="amount-input"
                    />
                </Stack>
            </Stack>

            {/* Type Selector */}
            <Box direction="row" padding="xs" backgroundColor={theme.surfaceSecondary} borderRadius={Shape.radius.r4} marginVertical="xl">
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
            </Box>

            {/* Account Selection */}
            <AppCard elevation="none" variant="secondary" style={styles.mainCard}>
                {type === 'expense' && (
                    <>
                        {renderAccountSelector("To Category / Account", expenseAccounts, destinationId, setDestinationId)}
                        <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                        {renderAccountSelector("From Account", transactionAccounts, sourceId, setSourceId)}
                    </>
                )}

                {type === 'income' && (
                    <>
                        {renderAccountSelector("From Source / Account", incomeAccounts, sourceId, setSourceId)}
                        <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                        {renderAccountSelector("To Account", transactionAccounts, destinationId, setDestinationId)}
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
                <Box align="center" padding="md" borderRadius={Shape.radius.sm} backgroundColor={withOpacity(theme.primary, Opacity.soft)} marginVertical="lg">
                    {isLoadingRate ? (
                        <AppText variant="caption" color="secondary">Fetching rate...</AppText>
                    ) : rateError ? (
                        <AppText variant="caption" color="error">{rateError}</AppText>
                    ) : exchangeRate ? (
                        <Stack horizontal space="lg">
                            <AppText variant="caption" color="primary" weight="medium">
                                1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                            </AppText>
                            {numAmount > 0 && (
                                <AppText variant="caption" color="primary">
                                    Total: {convertedAmount.toFixed(2)} {destCurrency}
                                </AppText>
                            )}
                        </Stack>
                    ) : null}
                </Box>
            )}

            {/* Schedule Section */}
            <Box marginVertical="lg">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs, marginBottom: Spacing.sm }}>
                    SCHEDULE
                </AppText>
                <AppCard elevation="none" padding="none" style={{ backgroundColor: theme.surfaceSecondary, borderColor: theme.border, borderWidth: 1 }}>
                    <Stack horizontal align="center" paddingHorizontal="lg">
                        <AppInput
                            variant="minimal"
                            placeholder="Date"
                            value={journalDate}
                            onChangeText={setJournalDate}
                            containerStyle={{ flex: 1 }}
                        />
                        <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />
                        <AppInput
                            variant="minimal"
                            placeholder="Time"
                            value={journalTime}
                            onChangeText={setJournalTime}
                            containerStyle={{ flex: 1 }}
                        />
                    </Stack>
                </AppCard>
            </Box>

            {/* Actions */}
            <Box style={{ marginTop: Spacing.md }}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={!amount || !sourceId || !destinationId || (sourceId === destinationId) || isSubmitting || isLoadingRate || !!rateError}
                    style={{ backgroundColor: activeColor, height: 60, borderRadius: Shape.radius.r4 }}
                >
                    {isSubmitting ? 'SAVING...' : sourceId === destinationId ? 'CHOOSE DIFFERENT ACCOUNTS' : `SAVE ${type.toUpperCase()}`}
                </AppButton>
            </Box>
        </Box>
    );
};

const styles = StyleSheet.create({
    accountScroll: { paddingVertical: Spacing.xs },
    accountCard: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minWidth: 160,
    },
    accountIndicator: {
        width: 4,
        height: 16,
        borderRadius: Shape.radius.full,
    },
    typeTab: {
        flex: 1,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        borderRadius: Shape.radius.sm,
    },
    mainCard: {
        borderRadius: Shape.radius.r2,
        padding: Spacing.lg,
        marginVertical: Spacing.xl,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    cardDivider: { height: 1, marginVertical: Spacing.md, opacity: Opacity.muted },
    verticalDivider: { width: 1, height: Size.md, marginHorizontal: Spacing.md },
});
