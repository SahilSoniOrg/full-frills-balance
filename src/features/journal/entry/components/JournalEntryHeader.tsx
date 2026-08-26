import { AppIcon, AppText, IconButton } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { AdvancedModeInfoModal } from '@/src/features/journal/entry/components/AdvancedModeInfoModal';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
  title: string;
  onClose: () => void;
  mode: JournalEntryScreenMode;
}

export const JournalEntryHeader = ({ title, onClose, mode }: JournalEntryHeaderProps) => {
  const { theme, fonts } = useTheme();
  const [infoModalVisible, setInfoModalVisible] = useState(false);

  return (
    <View style={[styles.header, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        onPress={onClose}
        style={styles.backButton}
        accessibilityLabel={AppConfig.strings.common.cancel}
        accessibilityRole="button"
      >
        <AppIcon name="close" size={Size.iconMd} color={theme.text} />
      </TouchableOpacity>

      <View style={styles.titleWrap}>
        <AppText
          variant="heading"
          style={[styles.headerTitle, { fontFamily: fonts.bold }]}
          numberOfLines={1}
        >
          {title}
        </AppText>
      </View>
      <IconButton
        name="helpCircle"
        variant="clear"
        size={Size.iconSm}
        onPress={() => setInfoModalVisible(true)}
        accessibilityLabel={AppConfig.strings.transactionFlow.modesHelpAccessibility}
      />
      <AdvancedModeInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        mode={mode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  headerTitle: {
    textAlign: 'left',
    // dynamic font
  },
});
