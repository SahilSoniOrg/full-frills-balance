import { AppText } from '@/src/components/core/AppText';
import type { IconName } from '@/src/types/domainIcons';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { AppInputField } from './AppInputField';

export type AppInputBaseProps = BoxBaseProps & {
  label?: string;
  error?: string;
  variant?: 'default' | 'minimal';
  leftIcon?: IconName;
  inputStyle?: TextInputProps['style'];
};

export type AppInputProps = AppInputBaseProps & TextInputProps;

export const AppInput = forwardRef<TextInput, AppInputProps>((initialProps, ref) => {
  const {
    label,
    error,
    variant,
    leftIcon,
    inputStyle,
    style: textInputStyle,
    ...propsWithoutInputProps
  } = initialProps;

  const { boxProps, restProps } = extractBoxProps(propsWithoutInputProps);
  const fieldProps = restProps;

  const containerProps = boxProps;

  return (
    <Box width="100%" {...containerProps}>
      {label && (
        <AppText variant="body" weight="medium" style={styles.label}>
          {label}
        </AppText>
      )}

      <View>
        <AppInputField
          ref={ref}
          variant={variant}
          leftIcon={leftIcon}
          style={textInputStyle}
          inputStyle={inputStyle}
          borderColor={error ? 'error' : undefined}
          {...fieldProps}
        />
      </View>

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
