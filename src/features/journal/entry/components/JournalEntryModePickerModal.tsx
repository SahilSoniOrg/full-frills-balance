import { Icon, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppConfig } from '@/src/constants';
import { BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { JOURNAL_ENTRY_MODE_OPTIONS } from '@/src/features/journal/entry/journalEntryMode';
import type { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface JournalEntryModePickerModalProps {
  visible: boolean;
  activeMode: JournalEntryScreenMode;
  isSimpleDisabled?: boolean;
  onSelectMode: (mode: JournalEntryScreenMode) => void;
  onHelpMode: (mode: JournalEntryScreenMode) => void;
  onClose: () => void;
}

export const JournalEntryModePickerModal = React.memo(function JournalEntryModePickerModal({
  visible,
  activeMode,
  isSimpleDisabled = false,
  onSelectMode,
  onHelpMode,
  onClose,
}: JournalEntryModePickerModalProps) {
  const { theme } = useTheme();

  return (
    <ModalSurface
      visible={visible}
      title="What are you recording?"
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable
      maxHeightPercent={85}
      accessibilityCloseLabel="Close mode selector"
    >
      <View style={styles.listContainer}>
        <AppText variant="caption" color="secondary" style={styles.intro}>
          Choose by whether this is one transaction or several, and whether it affects one or
          several accounts.
        </AppText>
        {JOURNAL_ENTRY_MODE_OPTIONS.map(opt => {
          const isSelected = activeMode === opt.id;
          const isDisabled = opt.id === 'basic' && isSimpleDisabled;

          return (
            <View
              key={opt.id}
              style={[
                styles.optionCard,
                {
                  backgroundColor: isSelected
                    ? withOpacity(theme.primary, Opacity.soft)
                    : theme.surfaceSecondary,
                  borderColor: isSelected
                    ? withOpacity(theme.primary, Opacity.medium)
                    : 'transparent',
                },
                isDisabled && styles.disabledCard,
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  if (!isDisabled) {
                    onSelectMode(opt.id);
                    onClose();
                  }
                }}
                disabled={isDisabled}
                style={styles.optionMain}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                testID={`journal-entry-mode-${opt.id}`}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: isSelected
                        ? withOpacity(theme.primary, Opacity.medium)
                        : withOpacity(theme.text, Opacity.hover),
                    },
                  ]}
                >
                  <AppIcon
                    name={opt.icon}
                    size={Size.iconSm}
                    color={isSelected ? theme.primary : theme.textSecondary}
                  />
                </View>

                <View style={styles.textWrap}>
                  <View style={styles.labelRow}>
                    <AppText
                      variant="body"
                      weight={isSelected ? 'bold' : 'semibold'}
                      style={{
                        color: isSelected ? theme.primary : theme.text,
                      }}
                    >
                      {opt.label}
                    </AppText>
                    {isSelected && (
                      <View
                        style={[
                          styles.currentBadge,
                          { backgroundColor: withOpacity(theme.primary, Opacity.medium) },
                        ]}
                      >
                        <AppText
                          variant="caption"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          Active
                        </AppText>
                      </View>
                    )}
                    {opt.recommended && !isSelected && (
                      <View
                        style={[
                          styles.recommendedBadge,
                          { backgroundColor: withOpacity(theme.text, Opacity.hover) },
                        ]}
                      >
                        <AppText variant="caption" weight="semibold" color="secondary">
                          Most common
                        </AppText>
                      </View>
                    )}
                  </View>

                  <AppText
                    variant="caption"
                    color="secondary"
                    style={styles.subtitle}
                    numberOfLines={2}
                  >
                    {isDisabled
                      ? 'This entry already has more than two lines, so Advanced is required'
                      : opt.subtitle}
                  </AppText>
                  {!isDisabled && (
                    <AppText
                      variant="caption"
                      color="tertiary"
                      style={styles.bestFor}
                      numberOfLines={2}
                    >
                      {opt.bestFor}
                    </AppText>
                  )}
                </View>

                {isSelected && (
                  <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.primary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onHelpMode(opt.id)}
                style={[
                  styles.helpButton,
                  {
                    backgroundColor: isSelected
                      ? withOpacity(theme.primary, Opacity.soft)
                      : withOpacity(theme.text, Opacity.hover),
                    borderColor: isSelected
                      ? withOpacity(theme.primary, Opacity.medium)
                      : withOpacity(theme.text, Opacity.soft),
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={AppConfig.strings.transactionFlow.modeHelpAccessibility(
                  opt.label,
                )}
                testID={`journal-entry-mode-help-${opt.id}`}
                hitSlop={{
                  top: Spacing.sm,
                  bottom: Spacing.sm,
                  left: Spacing.sm,
                  right: Spacing.sm,
                }}
              >
                <AppIcon
                  name={Icon.HelpCircle}
                  size={Size.iconSm}
                  color={isSelected ? theme.primary : theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ModalSurface>
  );
});

const styles = StyleSheet.create({
  listContainer: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  intro: {
    marginBottom: Spacing.xs,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.lg,
    borderWidth: BorderWidth.medium,
    gap: Spacing.md,
  },
  optionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  helpButton: {
    width: Size.lg,
    height: Size.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Shape.radius.full,
  },
  disabledCard: {
    opacity: Opacity.medium,
  },
  iconWrap: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.none,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  currentBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.none,
    borderRadius: Shape.radius.full,
  },
  recommendedBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.none,
    borderRadius: Shape.radius.full,
  },
  subtitle: {
    flexShrink: 1,
  },
  bestFor: {
    flexShrink: 1,
    marginTop: Spacing.xs,
  },
});
