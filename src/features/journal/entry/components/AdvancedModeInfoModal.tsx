import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';
import { JournalEntryScreenMode } from '../journalEntryPresentation';

interface AdvancedModeInfoModalProps {
  visible: boolean;
  onClose: () => void;
  mode: JournalEntryScreenMode;
}

export const AdvancedModeInfoModal = ({ visible, onClose, mode }: AdvancedModeInfoModalProps) => {
  const help = AppConfig.strings.journalEntryModesHelp;
  const content =
    mode === 'split'
      ? help.split
      : mode === 'advanced'
        ? help.advanced
        : mode === 'bulk'
          ? help.bulk
          : help.guided;

  return (
    <InfoSheet
      visible={visible}
      title={content.title}
      onClose={onClose}
      maxHeightPercent={70}
      accessibilityCloseLabel={AppConfig.strings.transactionFlow.modesHelpAccessibility}
    >
      <View style={styles.section}>
        <AppText variant="body" style={{ lineHeight: 22 }}>
          {content.body}
        </AppText>
      </View>
    </InfoSheet>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
});
