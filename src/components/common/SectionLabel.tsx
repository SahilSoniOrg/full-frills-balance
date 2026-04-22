import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';

interface SectionLabelProps {
  label: string;
  marginTop?: keyof typeof Spacing;
  style?: StyleProp<TextStyle>;
}

/**
 * Standardized label for form sections and pickers.
 * Ensures consistent hierarchy, weight, and letter spacing across the app.
 */
export const SectionLabel = ({ label, marginTop = 'lg', style }: SectionLabelProps) => {
  return (
    <AppText
      variant="caption"
      weight="bold"
      color="secondary"
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
