import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdvancedModeInfoModal } from './AdvancedModeInfoModal';

interface JournalModeToggleProps {
  mode: 'guided' | 'advanced' | 'bulk';
  onToggleMode: (mode: 'guided' | 'advanced' | 'bulk') => void;
  variant?: 'default' | 'compact';
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
  const isCompact = variant === 'compact';

  const modes: { id: 'guided' | 'advanced' | 'bulk'; label: string }[] = [
    { id: 'guided', label: 'Simple' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'bulk', label: 'Bulk' },
  ];

  if (isCompact) {
    return (
      <View style={[styles.compactWrapper]}>
        <View
          style={[
            styles.compactContainer,
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
                  { backgroundColor: isActive ? theme.surface : 'transparent' },
                  disabled && { opacity: Opacity.muted },
                ]}
                onPress={() => !disabled && onToggleMode(m.id)}
              >
                <AppText
                  variant="caption"
                  weight={isActive ? 'bold' : 'medium'}
                  style={{ color: isActive ? theme.primary : theme.textSecondary }}
                >
                  {m.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.infoIconCompact}
          onPress={() => setInfoModalVisible(true)}
          accessibilityLabel={AppConfig.strings.transactionFlow.explanationIconAccessibility}
        >
          <AppIcon name="helpCircle" size={Size.iconXs} color={theme.textSecondary} />
        </TouchableOpacity>

        <AdvancedModeInfoModal
          visible={infoModalVisible}
          onClose={() => setInfoModalVisible(false)}
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

      <TouchableOpacity
        style={styles.infoIconDefault}
        onPress={() => setInfoModalVisible(true)}
        accessibilityLabel={AppConfig.strings.transactionFlow.explanationIconAccessibility}
      >
        <AppIcon name="helpCircle" size={Size.iconSm} color={theme.textSecondary} />
      </TouchableOpacity>

      <AdvancedModeInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
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
  compactContainer: {
    flexDirection: 'row',
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  compactButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconCompact: {
    padding: Spacing.xs,
  },
  defaultWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.lg,
  },
  infoIconDefault: {
    padding: Spacing.sm,
  },
});
