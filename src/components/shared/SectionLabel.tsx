import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { StyleProp, TextStyle } from 'react-native';

interface SectionLabelProps {
  label: string;
  marginTop?: keyof typeof Spacing;
  style?: StyleProp<TextStyle>;
}

/**
 * Form-section overline (Phase 2.3 heading role for forms).
 */
export const SectionLabel = ({ label, marginTop = 'lg', style }: SectionLabelProps) => {
  return (
    <AppText
      variant="caption"
      weight="bold"
      color="secondary"
      accessibilityRole="header"
      style={[
        {
          letterSpacing: 0.5,
          marginBottom: Spacing.sm,
          marginTop: Spacing[marginTop],
        },
        style,
      ]}
    >
      {label.toUpperCase()}
    </AppText>
  );
};
