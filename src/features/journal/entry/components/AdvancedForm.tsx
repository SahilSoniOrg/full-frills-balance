import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { JournalLineItem } from '@/src/features/journal/entry/components/JournalLineItem';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { useCallback } from 'react';
import { TouchableOpacity, View } from 'react-native';

interface AdvancedFormProps {
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  journalBaseCurrency: string;
  getLineBaseAmount: (line: JournalEntryLine, baseCurrency: string) => number;
  onSelectAccountRequest: (lineId: string) => void;
}

export const AdvancedForm = ({
  editor,
  workplaceCurrency,
  journalBaseCurrency,
  getLineBaseAmount,
  onSelectAccountRequest,
}: AdvancedFormProps) => {
  const handleUpdateLine = useCallback(
    <K extends keyof JournalEntryLine>(id: string, field: K, value: JournalEntryLine[K]) => {
      editor.updateLine(id, { [field]: value });
    },
    [editor],
  );

  return (
    <View style={{ gap: Spacing.md, padding: Spacing.lg }}>
      <View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: Spacing.sm,
            paddingHorizontal: Spacing.xs,
          }}
        >
          <AppText variant="heading">{AppConfig.strings.advancedEntry.journalLines}</AppText>
          <TouchableOpacity
            onPress={editor.addLine}
            style={{ padding: Spacing.sm }}
            accessibilityLabel={AppConfig.strings.advancedEntry.addLineAccessibility}
            accessibilityRole="button"
          >
            <AppText variant="body" color="primary">
              {AppConfig.strings.advancedEntry.addLine}
            </AppText>
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
              onAutoFetchRate={force => editor.fetchRatesForLines([line.id], force)}
              onBalanceLine={() => editor.balanceLine(line.id)}
              isBalancePrimary={editor.isUnbalanced && editor.isEntryReadyToBalance}
              getLineBaseAmount={getLineBaseAmount}
              workplaceCurrency={workplaceCurrency}
              journalBaseCurrency={journalBaseCurrency}
            />
          ))}
        </View>
      </View>
    </View>
  );
};
