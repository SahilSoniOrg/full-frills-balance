import { AppSegmentedControl, IconButton } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useJournalModeOptions } from '@/src/features/journal/entry/hooks/useJournalModeOptions';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdvancedModeInfoModal } from './AdvancedModeInfoModal';

export type JournalModeBarProps = {
  mode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  /** `bar`: slim full-width row under the header. `chips`: inline compact chip group. */
  variant?: 'bar' | 'chips';
  isSimpleDisabled?: boolean;
};

/** Slim mode switcher used under the journal entry header (`bar`) or as compact chips. */
export function JournalModeBar({
  mode,
  onToggleMode,
  variant = 'bar',
  isSimpleDisabled,
}: JournalModeBarProps) {
  const { theme } = useTheme();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const isBar = variant === 'bar';
  const modes = useJournalModeOptions();

  return (
    <View style={[styles.wrapper, isBar && styles.barWrapper]}>
      <View style={[styles.controlArea, isBar && styles.barContainer]}>
        <AppSegmentedControl
          options={modes}
          value={mode}
          onChange={onToggleMode}
          flex
          size="sm"
          trackColor={theme.surfaceSecondary}
          pillColor={theme.surface}
          activeTextColor={theme.primary}
          inactiveTextColor={theme.textSecondary}
          disabledOptions={isSimpleDisabled ? ['basic'] : []}
          testID="journal-mode-switcher"
        />
      </View>

      <IconButton
        name="helpCircle"
        variant="clear"
        size={Size.iconSm}
        onPress={() => setInfoModalVisible(true)}
        accessibilityLabel={AppConfig.strings.transactionFlow.modesHelpAccessibility}
        style={isBar ? styles.infoIconBar : styles.infoIconChips}
      />

      <AdvancedModeInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        mode={mode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  controlArea: { flex: 1, position: 'relative' },
  barContainer: {
    flex: 1,
    minWidth: 0,
  },
  infoIconChips: {
    width: Size.buttonMd,
    height: Size.buttonMd,
  },
  infoIconBar: {
    width: Size.buttonMd,
    height: Size.buttonMd,
    marginRight: -Spacing.xs,
  },
});
