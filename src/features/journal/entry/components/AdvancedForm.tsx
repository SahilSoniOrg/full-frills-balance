import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppButton, AppCard, AppInput, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useAccounts } from '@/src/features/accounts';
import { JournalLineItem } from '@/src/features/journal/entry/components/JournalLineItem';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import dayjs from 'dayjs';
import React, { useCallback, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

interface AdvancedFormProps {
    accounts: ReturnType<typeof useAccounts>['accounts'];
    editor: ReturnType<typeof useJournalEditor>;
    onSelectAccountRequest: (lineId: string) => void;
}

export const AdvancedForm = ({
    accounts: _accounts,
    editor,
    onSelectAccountRequest,
}: AdvancedFormProps) => {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const { totalDebits, totalCredits, isBalanced } = useAdvancedJournalSummary(editor.lines);
    const hasDescription = editor.description.trim().length > 0;
    const hasIncompleteLines = editor.lines.some(line => !line.accountId || !line.amount.trim());
    const canSubmit = isBalanced && hasDescription && !hasIncompleteLines && !editor.isSubmitting;

    // Handlers
    const handleUpdateLine = useCallback((id: string, field: string, value: any) => {
        editor.updateLine(id, { [field]: value });
    }, [editor]);

    return (
        <View style={{ gap: Spacing.md, padding: Spacing.lg }}>
            <AppCard elevation="sm" padding="lg">
                {/* <AppText variant="title" style={{ marginBottom: Spacing.md }}>
                    {editor.isEdit ? AppConfig.strings.advancedEntry.editTitle : AppConfig.strings.advancedEntry.createTitle}
                </AppText> */}

                <View style={{ gap: Spacing.md }}>
                    <ListRow
                        title={AppConfig.strings.advancedEntry.dateTime}
                        subtitle={dayjs(`${editor.journalDate}T${editor.journalTime}`).format('DD MMM YYYY, HH:mm')}
                        onPress={() => setShowDatePicker(true)}
                        showDivider
                        style={{ marginHorizontal: -Spacing.lg }}
                    />

                    <DateTimePickerModal
                        visible={showDatePicker}
                        date={editor.journalDate}
                        time={editor.journalTime}
                        onClose={() => setShowDatePicker(false)}
                        onSelect={(d, t) => {
                            editor.setJournalDate(d);
                            editor.setJournalTime(t);
                        }}
                    />

                    <AppInput
                        label={AppConfig.strings.advancedEntry.description}
                        value={editor.description}
                        onChangeText={editor.setDescription}
                        placeholder={AppConfig.strings.advancedEntry.descriptionPlaceholder}
                        multiline
                        numberOfLines={3}
                    />
                </View>
            </AppCard>

            <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs }}>
                    <AppText variant="heading">{AppConfig.strings.advancedEntry.journalLines}</AppText>
                    <TouchableOpacity onPress={editor.addLine} style={{ padding: Spacing.sm }} accessibilityLabel={AppConfig.strings.advancedEntry.addLineAccessibility} accessibilityRole="button">
                        <AppText variant="body" color="primary">{AppConfig.strings.advancedEntry.addLine}</AppText>
                    </TouchableOpacity>
                </View>

                <View style={{ gap: 0 }}>
                    {editor.lines.map((line, index) => (
                        <JournalLineItem
                            key={line.id}
                            line={line}
                            index={index}
                            canRemove={editor.lines.length > 2}
                            onUpdate={(field, value) => handleUpdateLine(line.id, field, value)}
                            onRemove={() => editor.removeLine(line.id)}
                            onSelectAccount={() => onSelectAccountRequest(line.id)}
                            onAutoFetchRate={() => editor.autoFetchLineRate(line.id)}
                            getLineBaseAmount={JournalCalculator.getLineBaseAmount}
                        />
                    ))}
                </View>
            </View>

            <JournalSummary
                totalDebits={totalDebits}
                totalCredits={totalCredits}
                isBalanced={isBalanced}
            />

            <View style={{ paddingVertical: Spacing.lg }}>
                <AppButton
                    variant="primary"
                    onPress={editor.submit}
                    disabled={!canSubmit}
                    style={{ marginBottom: Spacing.xl, height: Size.buttonXl, borderRadius: Shape.radius.r4 }}
                >
                    {editor.isSubmitting
                        ? (editor.isEdit ? AppConfig.strings.advancedEntry.updating : AppConfig.strings.advancedEntry.creating)
                        : (editor.isEdit ? AppConfig.strings.advancedEntry.updateJournal : AppConfig.strings.advancedEntry.createJournal)}
                </AppButton>
            </View>
        </View>
    );
};
