import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppButton } from '@/src/components/core/AppButton';
import { AppCard } from '@/src/components/core/AppCard';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppInput } from '@/src/components/core/AppInput';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AccountTileList } from '@/src/features/journal/components/AccountTileList';
import { useTheme } from '@/src/hooks/use-theme';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { TabType, UseSimpleJournalEditorProps, useSimpleJournalEditor } from '../hooks/useSimpleJournalEditor';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SimpleFormProps extends UseSimpleJournalEditorProps { }

/**
 * SimpleForm - Smart container that orchestrates logic via useSimpleJournalEditor.
 */
export const SimpleForm = (props: SimpleFormProps) => {
    const editorProps = useSimpleJournalEditor(props);
    return <SimpleFormView {...editorProps} />;
};

export interface SimpleFormViewProps {
    type: TabType;
    setType: (type: TabType) => void;
    amount: string;
    setAmount: (amount: string) => void;
    sourceId: string;
    setSourceId: (id: string) => void;
    destinationId: string;
    setDestinationId: (id: string) => void;
    journalDate: string;
    setJournalDate: (date: string) => void;
    journalTime: string;
    setJournalTime: (time: string) => void;
    description: string;
    setDescription: (description: string) => void;
    isSubmitting: boolean;
    exchangeRate: number | null;
    isLoadingRate: boolean;
    rateError: string | null;
    isCrossCurrency: boolean;
    convertedAmount: number;
    transactionAccounts: Account[];
    expenseAccounts: Account[];
    incomeAccounts: Account[];
    sourceAccount?: Account;
    destAccount?: Account;
    sourceCurrency?: string;
    destCurrency?: string;
    handleSave: () => void;
}

export const SimpleFormView = ({
    type,
    setType,
    amount,
    setAmount,
    sourceId,
    setSourceId,
    destinationId,
    setDestinationId,
    journalDate,
    setJournalDate,
    journalTime,
    setJournalTime,
    description,
    setDescription,
    isSubmitting,
    exchangeRate,
    isLoadingRate,
    rateError,
    isCrossCurrency,
    convertedAmount,
    transactionAccounts,
    expenseAccounts,
    incomeAccounts,
    sourceAccount,
    destAccount,
    sourceCurrency,
    destCurrency,
    handleSave,
}: SimpleFormViewProps) => {
    const [showDatePicker, setShowDatePicker] = useState(false);

    const { theme } = useTheme();

    const activeColor = type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;
    const isDisabled = !amount || !sourceId || !destinationId || (sourceId === destinationId) || isSubmitting || isLoadingRate || !!rateError;
    const displayCurrency = sourceCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    const sectionLabelColor = theme.textSecondary;
    const frameBorderColor = withOpacity(theme.textSecondary, Opacity.muted);

    const typeMeta: Record<TabType, { label: string; icon: 'arrowDown' | 'arrowUp' | 'swapHorizontal' }> = {
        expense: { label: 'Expense', icon: 'arrowDown' },
        income: { label: 'Income', icon: 'arrowUp' },
        transfer: { label: 'Transfer', icon: 'swapHorizontal' },
    };

    const accountSections = type === 'expense'
        ? [
            { title: 'To Category / Account', accounts: expenseAccounts, selectedId: destinationId, onSelect: setDestinationId },
            { title: 'From Account', accounts: transactionAccounts, selectedId: sourceId, onSelect: setSourceId },
        ]
        : type === 'income'
            ? [
                { title: 'From Source / Account', accounts: incomeAccounts, selectedId: sourceId, onSelect: setSourceId },
                { title: 'To Account', accounts: transactionAccounts, selectedId: destinationId, onSelect: setDestinationId },
            ]
            : [
                { title: 'Source Account', accounts: transactionAccounts, selectedId: sourceId, onSelect: setSourceId },
                { title: 'Destination Account', accounts: transactionAccounts, selectedId: destinationId, onSelect: setDestinationId },
            ];

    return (
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={[styles.typeTabs, { backgroundColor: theme.surfaceSecondary, borderColor: frameBorderColor }]}>
                {(['expense', 'income', 'transfer'] as const).map(t => (
                    <TouchableOpacity
                        key={t}
                        testID={`tab-${t}`}
                        style={[
                            styles.typeTab,
                            type === t && { backgroundColor: theme.surface }
                        ]}
                        onPress={() => setType(t)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: type === t }}
                    >
                        <View style={styles.typeTabContent}>
                            <AppIcon name={typeMeta[t].icon} size={Size.iconXs} color={type === t ? activeColor : theme.textSecondary} />
                            <AppText
                                variant="caption"
                                weight="bold"
                                style={{ color: type === t ? activeColor : theme.textSecondary }}
                            >
                                {typeMeta[t].label.toUpperCase()}
                            </AppText>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.section}>
                <AppText variant="caption" weight="bold" style={[styles.sectionLabel, { color: sectionLabelColor }]}>
                    {AppConfig.strings.transactionFlow.descriptionOptional}
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
                    style={{ backgroundColor: theme.surface }}
                    containerStyle={styles.descriptionContainer}
                />
            </View>

            <View style={styles.section}>
                <AppText variant="caption" weight="bold" style={[styles.sectionLabel, { color: sectionLabelColor }]}>
                    {AppConfig.strings.transactionFlow.schedule}
                </AppText>
                <TouchableOpacity
                    activeOpacity={Opacity.soft}
                    onPress={() => setShowDatePicker(true)}
                >
                    <AppCard elevation="none" padding="none" style={[styles.scheduleCard, { backgroundColor: theme.surface, borderColor: frameBorderColor }]}>
                        <View style={styles.scheduleRow}>
                            <AppIcon name="calendar" size={Size.iconSm} color={theme.textSecondary} />
                            <AppText variant="body" style={{ flex: 1 }}>
                                {dayjs(`${journalDate}T${journalTime}`).format('DD MMM YYYY, HH:mm')}
                            </AppText>
                            <AppIcon name="chevronRight" size={Size.iconXs} color={theme.textSecondary} />
                        </View>
                    </AppCard>
                </TouchableOpacity>
            </View>

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

            <AppCard
                elevation="none"
                variant="default"
                style={[styles.amountCard, { borderColor: withOpacity(activeColor, Opacity.medium), backgroundColor: theme.surface }]}
            >
                <AppText variant="caption" weight="bold" style={[styles.eyebrow, { color: sectionLabelColor }]}>
                    {AppConfig.strings.transactionFlow.amount}
                </AppText>
                <View style={[styles.amountRow, { backgroundColor: theme.surfaceSecondary }]}>
                    <View style={styles.currencyWrap}>
                        <AppText variant="xl" weight="bold" style={{ color: theme.textSecondary, opacity: Opacity.heavy }}>
                            {displayCurrency}
                        </AppText>
                    </View>
                    <TextInput
                        style={[styles.amountInput, { color: activeColor }]}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        autoFocus
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        placeholder="0"
                        placeholderTextColor={withOpacity(theme.textSecondary, Opacity.medium)}
                        cursorColor={activeColor}
                        selectionColor={withOpacity(activeColor, Opacity.muted)}
                        testID="amount-input"
                    />
                </View>
            </AppCard>

            <View style={styles.accountSectionStack}>
                {accountSections.map(section => (
                    <AppCard
                        key={section.title}
                        elevation="none"
                        variant="default"
                        style={[styles.mainCard, { borderColor: frameBorderColor, backgroundColor: theme.surface }]}
                    >
                        <AccountTileList
                            title={section.title}
                            accounts={section.accounts}
                            selectedId={section.selectedId}
                            onSelect={section.onSelect}
                            tintColor={activeColor}
                        />
                    </AppCard>
                ))}
            </View>

            {isCrossCurrency && sourceId && destinationId && (
                <View style={[styles.fxCard, { backgroundColor: withOpacity(theme.primary, Opacity.soft), borderColor: withOpacity(theme.primary, Opacity.medium) }]}>
                    {isLoadingRate ? (
                        <AppText variant="caption" color="secondary">{AppConfig.strings.transactionFlow.fetchingRate}</AppText>
                    ) : rateError ? (
                        <AppText variant="caption" color="error">{rateError}</AppText>
                    ) : exchangeRate ? (
                        <View style={styles.fxContent}>
                            <View style={styles.fxRateRow}>
                                <AppIcon name="refresh" size={Size.iconXs} color={theme.primary} />
                                <AppText variant="caption" color="primary" weight="medium">
                                    1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                                </AppText>
                            </View>
                            {parseFloat(amount) > 0 && (
                                <View style={styles.fxTotalPill}>
                                    <AppText variant="caption" color="primary" weight="bold">
                                        Total: {convertedAmount.toFixed(2)} {destCurrency}
                                    </AppText>
                                </View>
                            )}
                        </View>
                    ) : null}
                </View>
            )}
            </ScrollView>

            <View style={[styles.footerButton, { backgroundColor: theme.background, borderTopColor: frameBorderColor }]}>
                <AppButton
                    variant="primary"
                    onPress={handleSave}
                    disabled={isDisabled}
                    style={[
                        styles.saveButton,
                        isDisabled
                            ? { backgroundColor: theme.surfaceSecondary, borderColor: withOpacity(theme.textSecondary, Opacity.muted) }
                            : { backgroundColor: activeColor, borderColor: activeColor },
                    ]}
                    testID="save-button"
                >
                    {isSubmitting ? AppConfig.strings.transactionFlow.saving : sourceId === destinationId ? AppConfig.strings.transactionFlow.chooseDifferentAccounts : AppConfig.strings.transactionFlow.save(type)}
                </AppButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    container: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xxxxl + Size.buttonXl,
    },
    amountCard: {
        borderWidth: 1,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.lg,
        minHeight: Size.inputLg + Spacing.md,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
        width: '100%',
        overflow: 'hidden',
    },
    currencyWrap: {
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: Size.xl * 2,
    },
    amountInput: {
        flex: 1,
        minWidth: 0,
        maxWidth: '100%',
        flexShrink: 1,
        fontSize: Typography.sizes.xxxl,
        fontFamily: Typography.fonts.bold,
        textAlign: 'right',
        writingDirection: 'auto',
        includeFontPadding: false,
    },
    eyebrow: {
        letterSpacing: Typography.letterSpacing.wide * 2,
        marginBottom: Spacing.sm,
    },
    typeTabs: {
        flexDirection: 'row',
        padding: Spacing.xs,
        borderRadius: Shape.radius.full,
        marginTop: Spacing.sm,
        marginBottom: Spacing.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    typeTab: {
        flex: 1,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        borderRadius: Shape.radius.full,
    },
    typeTabContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    mainCard: {
        borderRadius: Shape.radius.r2,
        padding: Spacing.md,
        marginTop: 0,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    accountSectionStack: {
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    fxCard: {
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        marginBottom: Spacing.lg,
        borderWidth: 1,
    },
    fxContent: {
        alignItems: 'center',
        gap: Spacing.sm,
    },
    fxRateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    fxTotalPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: Shape.radius.full,
    },
    section: {
        marginBottom: Spacing.md,
    },
    sectionLabel: {
        marginLeft: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    scheduleCard: {
        borderWidth: 1,
    },
    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    descriptionContainer: {
        borderRadius: Shape.radius.r3,
    },
    footerButton: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.lg,
        borderTopWidth: 1,
    },
    saveButton: {
        ...Shape.elevation.md,
        borderWidth: 1,
        minHeight: Size.buttonXl,
        borderRadius: Shape.radius.r4,
    },
});
