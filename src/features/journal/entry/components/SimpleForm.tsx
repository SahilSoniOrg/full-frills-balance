import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppButton } from '@/src/components/core/AppButton';
import { AppCard } from '@/src/components/core/AppCard';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppInput } from '@/src/components/core/AppInput';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TabType, UseSimpleJournalEditorProps, useSimpleJournalEditor } from '../hooks/useSimpleJournalEditor';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { SimpleFormAmountInput } from './SimpleFormAmountInput';
import { SimpleFormTabs } from './SimpleFormTabs';

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
                <SimpleFormTabs
                    type={type}
                    setType={setType}
                    activeColor={activeColor}
                    frameBorderColor={frameBorderColor}
                />

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

                <SimpleFormAmountInput
                    amount={amount}
                    setAmount={setAmount}
                    activeColor={activeColor}
                    displayCurrency={displayCurrency}
                    sectionLabelColor={sectionLabelColor}
                    amountLabel={AppConfig.strings.transactionFlow.amount}
                />

                <SimpleFormAccountSections
                    sections={accountSections}
                    activeColor={activeColor}
                    frameBorderColor={frameBorderColor}
                />

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
