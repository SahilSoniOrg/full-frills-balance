import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleProp, ViewStyle, View, StyleSheet } from 'react-native';

interface FormFieldProps {
  label: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FormField({ label, subtitle, children, style }: FormFieldProps) {
  return (
    <View style={[styles.container, style]}>
      <AppText variant="caption" weight="bold" color="secondary" style={styles.label}>
        {label.toUpperCase()}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color="secondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    letterSpacing: 0.5,
  },
  subtitle: {
    marginBottom: Spacing.xs,
  },
  content: {
    // Spacer/margins handled by children
  },
});
