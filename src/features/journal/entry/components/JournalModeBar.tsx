import { AppIcon, AppText, IconButton } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useJournalModeOptions } from '@/src/features/journal/entry/hooks/useJournalModeOptions';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdvancedModeInfoModal } from './AdvancedModeInfoModal';

export type JournalModeBarProps = {
  mode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  /** `bar`: slim full-width row under the header. `chips`: inline compact chip group. */
  variant?: 'bar' | 'chips';
  isSimpleDisabled?: boolean;
  onOpenBatch?: () => void;
};

/** Slim mode switcher used under the journal entry header (`bar`) or as compact chips. */
export function JournalModeBar({
  mode,
  onToggleMode,
  variant = 'bar',
  isSimpleDisabled,
  onOpenBatch,
}: JournalModeBarProps) {
  const { theme } = useTheme();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const isBar = variant === 'bar';
  const modes = useJournalModeOptions();
  const activeOption = useMemo(
    () => modes.find(option => option.id === mode) ?? { id: mode, label: 'Batch' },
    [mode, modes],
  );

  return (
    <View style={[styles.wrapper, isBar && styles.barWrapper]}>
      <View style={[styles.controlArea, isBar && styles.barContainer]}>
        <TouchableOpacity
          style={[
            styles.levelButton,
            { borderColor: theme.border, backgroundColor: theme.surfaceSecondary },
          ]}
          onPress={() => setOptionsVisible(visible => !visible)}
          accessibilityRole="button"
          accessibilityLabel={`Detail level: ${activeOption.label}`}
        >
          <AppText variant="caption" color="secondary" weight="medium">
            Detail level
          </AppText>
          <AppText variant="body" color="text" weight="semibold">
            {activeOption.label}
          </AppText>
          <AppIcon name="chevronDown" size={Size.iconXs} color={theme.textSecondary} />
        </TouchableOpacity>

        {optionsVisible && (
          <View
            style={[styles.options, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            {modes.map(option => {
              const disabled = option.id === 'basic' && isSimpleDisabled;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, disabled && { opacity: Opacity.muted }]}
                  onPress={() => {
                    if (disabled) return;
                    setOptionsVisible(false);
                    onToggleMode(option.id);
                  }}
                  disabled={disabled}
                >
                  <AppText variant="body" color="text" weight="medium">
                    {option.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.batchButton, { borderColor: theme.border }]}
        onPress={onOpenBatch ?? (() => undefined)}
        accessibilityRole="button"
        accessibilityLabel="Open batch workspace"
      >
        <AppText variant="caption" color="secondary" weight="medium">
          Batch
        </AppText>
      </TouchableOpacity>

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
  levelButton: {
    minHeight: Size.buttonMd,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  options: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  batchButton: {
    minHeight: Size.buttonMd,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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
