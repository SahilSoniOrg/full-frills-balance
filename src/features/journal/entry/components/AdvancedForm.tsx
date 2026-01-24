import { AppButton, AppCard, AppInput, AppText } from '@/components/core';
import { AppConfig, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { JournalCalculator, JournalLineInput } from '@/src/domain/accounting/JournalCalculator';
import { JournalValidator } from '@/src/domain/accounting/JournalValidator';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useJournalEditor } from '../hooks/useJournalEditor';
import { JournalLineItem } from './JournalLineItem';
import { JournalSummary } from './JournalSummary';

interface AdvancedFormProps {
    accounts: any[];
    editor: ReturnType<typeof useJournalEditor>;
    onSelectAccountRequest: (lineId: string) => void;
}

/**
 * AdvancedForm - Generic multi-leg journal entry form.
 * Pure presentation component that uses the editor controller.
 */
export const AdvancedForm = ({
    accounts,
    editor,
    onSelectAccountRequest,
}: AdvancedFormProps) => {
    const { theme } = useTheme();

    const getLineBaseAmount = (line: any): number => {
        const amount = sanitizeAmount(line.amount) || 0;
        const rate = line.exchangeRate && parseFloat(line.exchangeRate) ? parseFloat(line.exchangeRate) : 1;
        const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        if (!line.accountCurrency || line.accountCurrency === defaultCurrency) {
            return amount;
        }
        const baseAmount = amount * rate;
        return Math.round(baseAmount * 100) / 100;
    };

    const getDomainLines = (): JournalLineInput[] => {
        return editor.lines.map(line => ({
            amount: getLineBaseAmount(line),
            type: line.transactionType
        }));
    };

    const getTotalDebits = () => JournalCalculator.calculateTotalDebits(getDomainLines());
    const getTotalCredits = () => JournalCalculator.calculateTotalCredits(getDomainLines());
    const validationResult = JournalValidator.validate(getDomainLines());
    const isBalanced = JournalCalculator.isBalanced(getDomainLines());

    return (
        <View>
            <AppCard elevation="sm" padding="lg" style={styles.titleCard}>
                <AppText variant="title">{editor.isEdit ? 'Edit Journal Entry' : 'Create Journal Entry'}</AppText>
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.inputCard}>
                <View style={styles.dateTimeRow}>
                    <AppInput
                        label="Date"
                        value={editor.journalDate}
                        onChangeText={editor.setJournalDate}
                        placeholder="YYYY-MM-DD"
                        containerStyle={styles.dateTimeInput}
                    />
                    <AppInput
                        label="Time"
                        value={editor.journalTime}
                        onChangeText={editor.setJournalTime}
                        placeholder="HH:mm"
                        containerStyle={styles.dateTimeInput}
                    />
                </View>

                <AppInput
                    label="Description"
                    value={editor.description}
                    onChangeText={editor.setDescription}
                    placeholder="Enter description"
                    multiline
                    numberOfLines={3}
                    style={styles.textArea}
                />
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.linesCard}>
                <View style={styles.linesHeader}>
                    <AppText variant="heading">Journal Lines</AppText>
                    <TouchableOpacity onPress={editor.addLine} style={styles.addButton}>
                        <AppText variant="body" color="primary">+ Add Line</AppText>
                    </TouchableOpacity>
                </View>

                {editor.lines.map((line, index) => (
                    <JournalLineItem
                        key={line.id}
                        line={line}
                        index={index}
                        canRemove={editor.lines.length > 2}
                        onUpdate={(field, value) => editor.updateLine(line.id, { [field]: value })}
                        onRemove={() => editor.removeLine(line.id)}
                        onSelectAccount={() => onSelectAccountRequest(line.id)}
                        getLineBaseAmount={getLineBaseAmount}
                    />
                ))}
            </AppCard>

            <JournalSummary
                totalDebits={getTotalDebits()}
                totalCredits={getTotalCredits()}
                isBalanced={isBalanced}
            />

            <View style={styles.actions}>
                <AppButton
                    variant="primary"
                    onPress={editor.submit}
                    disabled={!isBalanced || editor.isSubmitting}
                    style={styles.createButton}
                >
                    {editor.isSubmitting ? (editor.isEdit ? 'Updating...' : 'Creating...') : (editor.isEdit ? 'Update Journal' : 'Create Journal')}
                </AppButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    titleCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
    inputCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
    dateTimeRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
    dateTimeInput: { flex: 1 },
    linesCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
    textArea: { height: 80, textAlignVertical: 'top' },
    linesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    addButton: { padding: Spacing.sm },
    actions: { padding: Spacing.lg },
    createButton: { marginBottom: Spacing.xl },
});
