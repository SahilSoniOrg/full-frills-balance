import { AppText } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type FormSectionGroupProps = {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function FormSectionGroup({ title, children, style, contentStyle }: FormSectionGroupProps) {
  const { theme } = useTheme();

  return (
    <View style={style}>
      {title ? (
        <AppText
          variant="body"
          weight="semibold"
          style={[styles.title, { color: theme.textSecondary }]}
        >
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: Typography.sizes.sm,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  content: {
    gap: Spacing.md,
  },
});
