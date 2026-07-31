import { AppText, IconButton } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useJournalModeOptions } from '@/src/features/journal/entry/hooks/useJournalModeOptions';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
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
      <View
        style={[
          styles.container,
          isBar && styles.barContainer,
          { borderColor: theme.border, backgroundColor: theme.surfaceSecondary },
        ]}
      >
        {modes.map(m => {
          const isActive = mode === m.id;
          const disabled = m.id === 'guided' && isSimpleDisabled;
          return (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.button,
                isBar && styles.barButton,
                { backgroundColor: isActive ? theme.surface : 'transparent' },
                disabled && { opacity: Opacity.muted },
              ]}
              onPress={() => !disabled && onToggleMode(m.id)}
            >
              <AppText
                variant="caption"
                weight={isActive ? 'bold' : 'medium'}
                style={{ color: isActive ? theme.primary : theme.textSecondary }}
                numberOfLines={1}
              >
                {m.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
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
  container: {
    flexDirection: 'row',
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  barContainer: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 2,
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
