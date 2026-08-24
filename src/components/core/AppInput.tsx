import type { IconName } from '@/src/types/domainIcons';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import { forwardRef } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  type TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { AppInputField } from './AppInputField';

export type AppInputBaseProps = BoxBaseProps & {
  label?: string;
  error?: string;
  variant?: 'default' | 'hero' | 'minimal';
  leftIcon?: IconName;
  inputStyle?: TextInputProps['style'];
  /** @deprecated use structural Box props */
  containerStyle?: StyleProp<ViewStyle>;
  calculator?: boolean;
  onCalculatorPress?: () => void;
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
    calculator,
    onCalculatorPress,
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

      {(() => {
        const inputField = (
          <View pointerEvents={calculator ? 'none' : 'auto'}>
            <AppInputField
              ref={ref}
              variant={variant}
              leftIcon={leftIcon}
              style={textInputStyle}
              inputStyle={[
                inputStyle,
                calculator && variant !== 'minimal' && styles.calculatorTextInput,
              ]}
              borderColor={error ? 'error' : undefined}
              {...fieldProps}
              editable={calculator ? false : fieldProps.editable}
            />
          </View>
        );

        return calculator ? (
          <TouchableOpacity
            onPress={onCalculatorPress}
            accessibilityRole="button"
            accessibilityLabel="Open calculator"
            activeOpacity={0.8}
            style={styles.calculatorRow}
          >
            {inputField}
            <View pointerEvents="none" style={styles.calculatorButton}>
              <AppIcon name="calculator" size={20} color="primary" />
            </View>
          </TouchableOpacity>
        ) : (
          <View>{inputField}</View>
        );
      })()}

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
  calculatorButton: {
    position: 'absolute',
    right: Spacing.xs,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  calculatorRow: {
    position: 'relative',
  },
  calculatorTextInput: {
    paddingRight: Spacing.xl,
  },
});
