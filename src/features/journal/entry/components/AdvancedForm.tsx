import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppButton, AppCard, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { JournalLineItem } from '@/src/features/journal/entry/components/JournalLineItem';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

interface AdvancedFormProps {
    accounts: any[];
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

    return (
        <View style={{ gap: Spacing.md, padding: Spacing.lg }}>
            <AppCard elevation="sm" padding="lg">
                <AppText variant="title">{editor.isEdit ? AppConfig.strings.advancedEntry.editTitle : AppConfig.strings.advancedEntry.createTitle}</AppText>
            </AppCard>

            <AppCard elevation="sm" padding="lg">
                <View style={{ gap: Spacing.md }}>
                    <TouchableOpacity
                        activeOpacity={Opacity.soft}
                        onPress={() => setShowDatePicker(true)}
                        style={{ flex: 1 }}
                    >
                        <AppInput
                            label={AppConfig.strings.advancedEntry.dateTime}
                            value={dayjs(`${editor.journalDate}T${editor.journalTime}`).format('DD MMM YYYY, HH:mm')}
                            editable={false}
                            pointerEvents="none"
                        />
                    </TouchableOpacity>

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

            <AppCard elevation="sm" padding="lg">
                <View style={{ gap: Spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <AppText variant="heading">{AppConfig.strings.advancedEntry.journalLines}</AppText>
                        <TouchableOpacity onPress={editor.addLine} style={{ padding: Spacing.sm }} accessibilityLabel={AppConfig.strings.advancedEntry.addLineAccessibility} accessibilityRole="button">
                            <AppText variant="body" color="primary">{AppConfig.strings.advancedEntry.addLine}</AppText>
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
                            onAutoFetchRate={() => editor.autoFetchLineRate(line.id)}
                            getLineBaseAmount={JournalCalculator.getLineBaseAmount}
                        />
                    ))}
                </View>
            </AppCard>

            <JournalSummary
                totalDebits={totalDebits}
                totalCredits={totalCredits}
                isBalanced={isBalanced}
            />

            <View style={{ paddingVertical: Spacing.lg }}>
                <AppButton
                    variant="primary"
                    onPress={editor.submit}
                    disabled={!isBalanced || editor.isSubmitting}
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
