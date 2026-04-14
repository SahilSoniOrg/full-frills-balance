import { AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

interface FormSelectorFieldProps {
  label?: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  onClear?: () => void;
  containerStyle?: ViewStyle;
  testID?: string;
}

export const FormSelectorField: React.FC<FormSelectorFieldProps> = ({
  label,
  value,
  placeholder,
  onPress,
  onClear,
  containerStyle,
  testID,
}) => {
  const { theme, fonts } = useTheme();

  const hasValue = value && value !== '';

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText
          variant="body"
          style={[styles.label, { fontFamily: fonts.semibold, color: theme.text }]}
        >
          {label}
        </AppText>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.selectorButton,
          { borderColor: theme.border, backgroundColor: theme.surface },
        ]}
        testID={testID}
      >
        <AppText
          variant="body"
          style={{ color: hasValue ? theme.text : theme.textSecondary }}
          numberOfLines={1}
        >
          {hasValue ? value : placeholder}
        </AppText>
        <View style={styles.selectorActions}>
          {onClear && hasValue && (
            <TouchableOpacity
              onPress={e => {
                e.stopPropagation();
                onClear();
              }}
              style={[
                styles.clearButton,
                { backgroundColor: withOpacity(theme.text, Opacity.hover) },
              ]}
            >
              <AppText variant="caption" color="secondary">
                Clear
              </AppText>
            </TouchableOpacity>
          )}
          <IvyIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginBottom: Spacing.xs,
  },
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.sm,
    borderWidth: 1,
    minHeight: Size.touchTarget,
  },
  selectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clearButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.xs,
  },
});
