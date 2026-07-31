import { AppText, IconButton } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useJournalModeOptions } from '@/src/features/journal/entry/hooks/useJournalModeOptions';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdvancedModeInfoModal } from './AdvancedModeInfoModal';

interface JournalModeToggleProps {
  mode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  /** `bar`: slim full-width row under the header (journal entry). `compact`: inline chip group. */
  variant?: 'default' | 'compact' | 'bar';
  isSimpleDisabled?: boolean;
}

export const JournalModeToggle = ({
  mode,
  onToggleMode,
  variant = 'default',
  isSimpleDisabled,
}: JournalModeToggleProps) => {
  const { theme } = useTheme();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const isBar = variant === 'bar';
  const isCompact = variant === 'compact';
  const modes = useJournalModeOptions();

  if (isBar || isCompact) {
    return (
      <View style={[styles.compactWrapper, isBar && styles.barWrapper]}>
        <View
          style={[
            styles.compactContainer,
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
                  styles.compactButton,
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
          style={isBar ? styles.infoIconBar : styles.infoIconCompact}
        />

        <AdvancedModeInfoModal
          visible={infoModalVisible}
          onClose={() => setInfoModalVisible(false)}
          mode={mode}
        />
      </View>
    );
  }

  return (
    <View style={styles.defaultWrapper}>
      <View
        style={[
          styles.modeToggleContainer,
          styles.modeToggleContainerDefault,
          { backgroundColor: theme.surfaceSecondary },
        ]}
      >
        {modes.map(m => {
          const isActive = mode === m.id;
          const disabled = m.id === 'guided' && isSimpleDisabled;
          return (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modeButton,
                { backgroundColor: isActive ? theme.surface : 'transparent' },
                isActive && Shape.elevation.sm,
                disabled && { opacity: Opacity.muted },
              ]}
              onPress={() => !disabled && onToggleMode(m.id)}
            >
              <AppText
                variant="body"
                weight={isActive ? 'bold' : 'medium'}
                style={{ color: isActive ? theme.primary : theme.textSecondary }}
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
        style={styles.infoIconDefault}
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
  modeToggleContainer: {
    flexDirection: 'row',
    borderRadius: Shape.radius.full,
    padding: Spacing.xs,
  },
  modeToggleContainerDefault: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  compactContainer: {
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
  compactButton: {
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
  infoIconCompact: {
    width: Size.buttonMd,
    height: Size.buttonMd,
  },
  infoIconBar: {
    width: Size.buttonMd,
    height: Size.buttonMd,
    marginRight: -Spacing.xs,
  },
  defaultWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.lg,
  },
  infoIconDefault: {
    width: Size.buttonMd,
    height: Size.buttonMd,
  },
});
