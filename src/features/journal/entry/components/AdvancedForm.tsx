import { AppConfig, Shape, Spacing } from '@/constants';
import { AppButton, AppCard, AppInput, AppText, Box, Stack } from '@/src/components/core';
import { JournalCalculator, JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import React from 'react';
import { TouchableOpacity } from 'react-native';
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
    // const { theme } = useTheme(); // Unused

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
    // const validationResult = JournalValidator.validate(getDomainLines()); // Unused
    const isBalanced = JournalCalculator.isBalanced(getDomainLines());

    return (
        <Stack space="md" padding="lg">
            <AppCard elevation="sm" padding="lg">
                <AppText variant="title">{editor.isEdit ? 'Edit Journal Entry' : 'Create Journal Entry'}</AppText>
            </AppCard>

            <AppCard elevation="sm" padding="lg">
                <Stack space="md">
                    <Stack horizontal space="md">
                        <AppInput
                            label="Date"
                            value={editor.journalDate}
                            onChangeText={editor.setJournalDate}
                            placeholder="YYYY-MM-DD"
                            containerStyle={{ flex: 1 }}
                        />
                        <AppInput
                            label="Time"
                            value={editor.journalTime}
                            onChangeText={editor.setJournalTime}
                            placeholder="HH:mm"
                            containerStyle={{ flex: 1 }}
                        />
                    </Stack>

                    <AppInput
                        label="Description"
                        value={editor.description}
                        onChangeText={editor.setDescription}
                        placeholder="Enter description"
                        multiline
                        numberOfLines={3}
                        style={{ height: 80, textAlignVertical: 'top' }}
                    />
                </Stack>
            </AppCard>

            <AppCard elevation="sm" padding="lg">
                <Stack space="md">
                    <Box direction="row" justify="space-between" align="center">
                        <AppText variant="heading">Journal Lines</AppText>
                        <TouchableOpacity onPress={editor.addLine} style={{ padding: Spacing.sm }}>
                            <AppText variant="body" color="primary">+ Add Line</AppText>
                        </TouchableOpacity>
                    </Box>

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
                </Stack>
            </AppCard>

            <JournalSummary
                totalDebits={getTotalDebits()}
                totalCredits={getTotalCredits()}
                isBalanced={isBalanced}
            />

            <Box style={{ paddingVertical: Spacing.lg }}>
                <AppButton
                    variant="primary"
                    onPress={editor.submit}
                    disabled={!isBalanced || editor.isSubmitting}
                    style={{ marginBottom: Spacing.xl, height: 60, borderRadius: Shape.radius.r4 }}
                >
                    {editor.isSubmitting ? (editor.isEdit ? 'Updating...' : 'Creating...') : (editor.isEdit ? 'Update Journal' : 'Create Journal')}
                </AppButton>
            </Box>
        </Stack>
    );
};

// styles removed as it was empty and unused
