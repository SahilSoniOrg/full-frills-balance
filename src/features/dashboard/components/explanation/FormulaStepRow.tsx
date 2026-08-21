import { AppIcon, AppText } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface FormulaStepRowProps {
  title: string;
  detail: string;
  amountText: string;
  amountColor?: 'primary' | 'warning' | 'error';
  isExpanded: boolean;
  onToggle: () => void;
}

export const FormulaStepRow = ({
  title,
  detail,
  amountText,
  amountColor = 'primary',
  isExpanded,
  onToggle,
}: FormulaStepRowProps) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
    >
      <View style={styles.container}>
        <View style={styles.textContainer}>
          <AppText variant="body" weight="medium">
            {title}
          </AppText>
          <AppText variant="caption" color="secondary">
            {detail}
          </AppText>
        </View>
        <AppText variant="subheading" color={amountColor} tabular>
          {amountText}
        </AppText>
        <AppIcon
          name={isExpanded ? 'chevronUp' : 'chevronDown'}
          size={Size.sm}
          color={theme.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
});
