import { IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import React, { forwardRef } from 'react';
import { StyleProp, StyleSheet, TextInput, type TextInputProps, ViewStyle } from 'react-native';
import { AppInputField } from './AppInputField';

export type AppInputBaseProps = BoxBaseProps & {
  label?: string;
  error?: string;
  variant?: 'default' | 'hero' | 'minimal';
  leftIcon?: IconName;
  inputStyle?: TextInputProps['style'];
  /** @deprecated use structural Box props */
  containerStyle?: StyleProp<ViewStyle>;
};

export type AppInputProps = AppInputBaseProps & TextInputProps;

export const AppInput = forwardRef<TextInput, AppInputProps>((initialProps, ref) => {
  const {
    label,
    error,
    variant,
    leftIcon,
    inputStyle,
    containerStyle,
    style: textInputStyle,
    ...propsWithoutInputProps
  } = initialProps;

  const { boxProps, restProps } = extractBoxProps(propsWithoutInputProps);
  const fieldProps = restProps;

  const containerProps = boxProps;

  return (
    <Box width="100%" style={containerStyle} {...containerProps}>
      {label && (
        <AppText variant="body" weight="medium" style={styles.label}>
          {label}
        </AppText>
      )}

      <AppInputField
        ref={ref}
        variant={variant}
        leftIcon={leftIcon}
        style={textInputStyle}
        inputStyle={inputStyle}
        borderColor={error ? 'error' : undefined}
        {...fieldProps}
      />

      {error && (
        <AppText variant="caption" color="error" style={styles.error}>
          {error}
        </AppText>
      )}
    </Box>
  );
});

AppInput.displayName = 'AppInput';

const styles = StyleSheet.create({
  label: {
    marginBottom: Spacing.xs,
  },
  error: {
    marginTop: Spacing.xs,
  },
});
