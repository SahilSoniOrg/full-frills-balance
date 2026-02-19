import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useAccounts } from '@/src/features/accounts';
import { JournalLineItem } from '@/src/features/journal/entry/components/JournalLineItem';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import React, { useCallback } from 'react';
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
    // Handlers
    const handleUpdateLine = useCallback((id: string, field: string, value: any) => {
        editor.updateLine(id, { [field]: value });
    }, [editor]);

    return (
        <View style={{ gap: Spacing.md, padding: Spacing.lg }}>

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
                            onBalanceLine={() => editor.balanceLine(line.id)}
                            getLineBaseAmount={JournalCalculator.getLineBaseAmount}
                        />
                    ))}
                </View>
            </View>
        </View>
    );
};
