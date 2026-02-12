import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { TypedFlashList } from '@/src/components/common/TypedFlashList';
import { AppButton } from '@/src/components/core/AppButton';
import { AppCard } from '@/src/components/core/AppCard';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppInput } from '@/src/components/core/AppInput';
import { AppText } from '@/src/components/core/AppText';
import { Box } from '@/src/components/core/Box';
import { Stack } from '@/src/components/core/Stack';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useTheme } from '@/src/hooks/use-theme';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SimpleFormProps {
    accounts: Account[];
    onSuccess: () => void;
    journalId?: string;
    initialType?: 'expense' | 'income' | 'transfer';
    initialAmount?: string;
    initialSourceId?: string;
    initialDestinationId?: string;
    initialDate?: string;
    initialTime?: string;
    initialDescription?: string;
}

type TabType = 'expense' | 'income' | 'transfer';

export const SimpleForm = ({
    accounts,
    onSuccess,
    journalId,
    initialType = 'expense',
    initialAmount = '',
    initialSourceId = '',
    initialDestinationId = '',
    initialDate = new Date().toISOString().split('T')[0],
    initialTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    initialDescription = '',
}: SimpleFormProps) => {
    const { theme } = useTheme();
    const { saveSimpleEntry } = useJournalActions();
    const { fetchRate } = useExchangeRate();

    const transactionAccounts = useMemo(() => {
        const filtered = accounts.filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY);
        // Debugging logs disabled for now to avoid polluting stdout unless needed
        return filtered;
    }, [accounts]);

    const expenseAccounts = accounts.filter(a => a.accountType === AccountType.EXPENSE);
    const incomeAccounts = accounts.filter(a => a.accountType === AccountType.INCOME);

    console.log('[SimpleForm] All accounts:', accounts.map(a => `${a.name} (${a.accountType})`));
    console.log('[SimpleForm] Transaction accounts:', transactionAccounts.map(a => `${a.name}`));
    console.log('[SimpleForm] Expense accounts:', expenseAccounts.map(a => `${a.name}`));

    const [type, setType] = useState<TabType>(initialType);
    const [amount, setAmount] = useState(initialAmount);
    const [sourceId, setSourceId] = useState<string>(initialSourceId);
    const [destinationId, setDestinationId] = useState<string>(initialDestinationId);
    const [journalDate, setJournalDate] = useState(initialDate);
    const [journalTime, setJournalTime] = useState(initialTime);
    const [description, setDescription] = useState(initialDescription);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    const sourceAccount = accounts.find(a => a.id === sourceId);
    const destAccount = accounts.find(a => a.id === destinationId);
    const sourceCurrency = sourceAccount?.currencyCode;
    const destCurrency = destAccount?.currencyCode;
    const isCrossCurrency = sourceCurrency && destCurrency && sourceCurrency !== destCurrency;

    const numAmount = parseFloat(amount.replace(',', '.'));
    const convertedAmount = (numAmount && exchangeRate) ? numAmount * exchangeRate : numAmount;

    useEffect(() => {
        if (!isCrossCurrency) {
            setExchangeRate(null);
            setRateError(null);
            return;
        }

        const updateExchangeRate = async () => {
            setIsLoadingRate(true);
            setRateError(null);
            try {
                const rate = await fetchRate(sourceCurrency, destCurrency);
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

        updateExchangeRate();
    }, [sourceId, destinationId, sourceCurrency, destCurrency, isCrossCurrency, fetchRate]);

    useEffect(() => {
        const lastSourceId = preferences.lastUsedSourceAccountId;
        const lastDestId = preferences.lastUsedDestinationAccountId;

        if (type === 'expense') {
            const isSourceValid = sourceId && transactionAccounts.some(a => a.id === sourceId);
            if (!isSourceValid) {
                if (initialSourceId && transactionAccounts.some(a => a.id === initialSourceId)) {
                    setSourceId(initialSourceId);
                } else if (lastSourceId && transactionAccounts.some(a => a.id === lastSourceId)) {
                    setSourceId(lastSourceId);
                } else {
                    setSourceId('');
                }
            }

            const isDestValid = destinationId && accounts.find(a => a.id === destinationId)?.accountType === AccountType.EXPENSE;
            if (!isDestValid) {
                if (initialDestinationId && accounts.find(a => a.id === initialDestinationId)?.accountType === AccountType.EXPENSE) {
                    setDestinationId(initialDestinationId);
                } else {
                    setDestinationId('');
                }
            }
        } else if (type === 'income') {
            const isDestValid = destinationId && transactionAccounts.some(a => a.id === destinationId);
            if (!isDestValid) {
                if (initialDestinationId && transactionAccounts.some(a => a.id === initialDestinationId)) {
                    setDestinationId(initialDestinationId);
                } else if (lastDestId && transactionAccounts.some(a => a.id === lastDestId)) {
                    setDestinationId(lastDestId);
                } else {
                    setDestinationId('');
                }
            }

            const isSourceValid = sourceId && accounts.find(a => a.id === sourceId)?.accountType === AccountType.INCOME;
            if (!isSourceValid) {
                if (initialSourceId && accounts.find(a => a.id === initialSourceId)?.accountType === AccountType.INCOME) {
                    setSourceId(initialSourceId);
                } else {
                    setSourceId('');
                }
            }
        } else {
            const isSourceValid = sourceId && accounts.some(a => a.id === sourceId);
            if (!isSourceValid) {
                if (initialSourceId && accounts.some(a => a.id === initialSourceId)) {
                    setSourceId(initialSourceId);
                } else if (lastSourceId && accounts.some(a => a.id === lastSourceId)) {
                    setSourceId(lastSourceId);
                } else {
                    setSourceId('');
                }
            }

            const isDestValid = destinationId && accounts.some(a => a.id === destinationId);
            if (!isDestValid) {
                if (initialDestinationId && accounts.some(a => a.id === initialDestinationId)) {
                    setDestinationId(initialDestinationId);
                } else if (lastDestId && accounts.some(a => a.id === lastDestId)) {
                    setDestinationId(lastDestId);
                } else {
                    setDestinationId('');
                }
            }
        }
    }, [type, accounts, transactionAccounts, sourceId, destinationId, expenseAccounts, incomeAccounts, initialDestinationId, initialSourceId]);

    const handleSave = async () => {
        if (!numAmount || numAmount <= 0) return;
        if (!sourceId || !destinationId) return;

        setIsSubmitting(true);
        try {
            await saveSimpleEntry({
                type,
                amount: numAmount,
                sourceId,
                destinationId,
                journalDate: new Date(`${journalDate}T${journalTime}`).getTime(),
                description: description || undefined,
                exchangeRate: (isCrossCurrency && exchangeRate) ? exchangeRate : undefined,
                journalId
            });

            if (type === 'expense' || type === 'transfer') await preferences.setLastUsedSourceAccountId(sourceId);
            if (type === 'income' || type === 'transfer') await preferences.setLastUsedDestinationAccountId(destinationId);

            setAmount('');
            onSuccess();
        } catch (error) {
            logger.error('Failed to save:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderAccountSelector = (title: string, accountList: Account[], selectedId: string, onSelect: (id: string) => void, tintColor?: string) => {
        const selectorColor = tintColor || activeColor;
        return (
            <Box gap="sm" marginVertical="md">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs }}>
                    {title.toUpperCase()}
                </AppText>
                <View style={{ minHeight: 80 }}>
                    <TypedFlashList<Account>
                        data={accountList}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        estimatedItemSize={120}
                        getItemLayout={(data: ArrayLike<Account> | null | undefined, index: number) => ({
                            length: 120, // estimatedItemSize
                            offset: 120 * index,
                            index,
                        })}
                        initialScrollIndex={Math.max(0, accountList.findIndex(a => a.id === selectedId))}
                        renderItem={({ item: account }: { item: Account }) => {
                            const isSelected = selectedId === account.id;
                            const colorKey = journalPresenter.getAccountColorKey(account.accountType);
                            const accountColor = tintColor || (theme as any)[colorKey] || theme.primary;

                            return (
                                <TouchableOpacity
                                    testID={`account-option-${account.name.replace(/\s+/g, '-')}`}
                                    style={[
                                        styles.accountCard,
                                        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                                        isSelected && {
                                            backgroundColor: withOpacity(accountColor, Opacity.soft),
                                            borderColor: accountColor
                                        }
                                    ]}
                                    onPress={() => onSelect(isSelected ? '' : account.id)}
                                >
                                    <View style={[styles.accountIndicator, { backgroundColor: accountColor, opacity: isSelected ? 1 : Opacity.soft }]} />
                                    <AppText
                                        variant="body"
                                        weight={isSelected ? "semibold" : "regular"}
                                        style={{ color: theme.text, flex: 1 }}
                                    >
                                        {account.name}
                                    </AppText>
                                    {isSelected && (
                                        <AppIcon name="checkCircle" size={18} color={accountColor} />
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                        contentContainerStyle={{ paddingHorizontal: Spacing.xs }}
                        ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
                    />
                </View>
            </Box>
        );
    };

    const activeColor = type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;

    return (
        <Box padding="lg">
            <Stack align="center" marginVertical="lg" space="md">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ letterSpacing: 2 }}>
                    AMOUNT
                </AppText>
                <Stack horizontal align="center" justify="center">
                    <Box marginVertical="sm" style={{ marginTop: Spacing.md }}>
                        <AppText variant="title" weight="bold" style={{ color: theme.textSecondary, opacity: Opacity.heavy }}>
                            {sourceAccount?.currencyCode || 'USD'}
                        </AppText>
                    </Box>
                    <AppInput
                        variant="hero"
                        style={{ color: activeColor }}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        autoFocus
                        cursorColor={activeColor}
                        selectionColor={withOpacity(activeColor, Opacity.muted)}
                        testID="amount-input"
                    />
                </Stack>
            </Stack>

            <Box direction="row" padding="xs" backgroundColor={theme.surfaceSecondary} borderRadius={Shape.radius.r4} marginVertical="xl">
                {(['expense', 'income', 'transfer'] as const).map(t => (
                    <TouchableOpacity
                        key={t}
                        testID={`tab-${t}`}
                        style={[
                            styles.typeTab,
                            type === t && { backgroundColor: theme.surface, ...Shape.elevation.sm }
                        ]}
                        onPress={() => {
                            setType(t);
                            // Clear selections to force manual selection, unless they are already valid for the new type
                            setSourceId('');
                            setDestinationId('');
                        }}
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

            <Box marginVertical="lg">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs, marginBottom: Spacing.sm }}>
                    SCHEDULE
                </AppText>
                <TouchableOpacity
                    activeOpacity={Opacity.soft}
                    onPress={() => setShowDatePicker(true)}
                >
                    <AppCard elevation="none" padding="none" style={{ backgroundColor: theme.surfaceSecondary, borderColor: theme.border, borderWidth: 1 }}>
                        <Stack horizontal align="center" paddingHorizontal="lg" paddingVertical="md" space="md">
                            <AppIcon name="calendar" size={20} color={theme.textSecondary} />
                            <AppText variant="body" style={{ flex: 1 }}>
                                {dayjs(`${journalDate}T${journalTime}`).format('DD MMM YYYY, HH:mm')}
                            </AppText>
                            <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
                        </Stack>
                    </AppCard>
                </TouchableOpacity>
            </Box>

            <DateTimePickerModal
                visible={showDatePicker}
                date={journalDate}
                time={journalTime}
                onClose={() => setShowDatePicker(false)}
                onSelect={(d, t) => {
                    setJournalDate(d);
                    setJournalTime(t);
                }}
            />

            <Box marginVertical="lg">
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs, marginBottom: Spacing.sm }}>
                    DESCRIPTION (OPTIONAL)
                </AppText>
                <AppInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder={
                        type === 'expense'
                            ? destAccount?.name || 'Expense'
                            : type === 'income'
                                ? sourceAccount?.name || 'Income'
                                : 'Transfer'
                    }
                    testID="description-input"
                    style={{ backgroundColor: theme.surfaceSecondary }}
                />
            </Box>

            <Box style={{ marginTop: Spacing.md }}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={!amount || !sourceId || !destinationId || (sourceId === destinationId) || isSubmitting || isLoadingRate || !!rateError}
                    testID="save-button"
                >
                    {isSubmitting ? 'SAVING...' : sourceId === destinationId ? 'CHOOSE DIFFERENT ACCOUNTS' : `SAVE ${type.toUpperCase()}`}
                </AppButton>
            </Box>
        </Box>
    );
};

const styles = StyleSheet.create({
    accountCard: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minWidth: Size.cardMinWidth,
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
});
