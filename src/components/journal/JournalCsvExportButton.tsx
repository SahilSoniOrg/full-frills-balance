import { Keyboard, Platform, StyleSheet } from 'react-native';
import { useState } from 'react';
import { AppButton } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import type { ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';

export function JournalCsvExportButton({ csvExport }: { csvExport?: ShareableCsvControl }) {
  const [idleWidth, setIdleWidth] = useState<number>();
  if (!csvExport) return null;
  const strings = AppConfig.strings.journal.csvExport;

  return (
    <AppButton
      variant="secondary"
      size="sm"
      style={styles.button}
      buttonStyle={csvExport.isExportingCsv ? { minWidth: idleWidth } : undefined}
      onLayout={event => {
        if (!csvExport.isExportingCsv) setIdleWidth(event.nativeEvent.layout.width);
      }}
      loading={csvExport.isExportingCsv}
      disabled={csvExport.isExportDisabled}
      onPress={() => {
        Keyboard.dismiss();
        void csvExport.onExportCsv();
      }}
      accessibilityLabel={strings.label}
      accessibilityHint={strings.hint}
      testID="journal-export-csv"
    >
      {strings.label}
    </AppButton>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Platform.OS === 'android' ? 48 : Size.touchTarget,
    justifyContent: 'center',
  },
});
