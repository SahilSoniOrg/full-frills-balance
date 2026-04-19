import { AppIcon, IconName } from '@/src/components/core/AppIcon';
import { ColorKey, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

export type AppInputFieldBaseProps = BoxBaseProps & {
  variant?: 'default' | 'hero' | 'minimal';
  leftIcon?: IconName;
  background?: ColorKey | 'transparent';
  borderColor?: ColorKey | 'transparent';
  borderWidth?: number;
  inputStyle?: TextInputProps['style'];
};

export type AppInputFieldProps = AppInputFieldBaseProps & TextInputProps;

const AppInputFieldInner = forwardRef<TextInput, AppInputFieldProps>((initialProps, ref) => {
  const {
    variant = 'default',
    leftIcon,
    background: backgroundProp,
    borderColor: borderColorProp,
    borderWidth: borderWidthProp,
    inputStyle,
    style: textInputStyle,
    ...propsWithoutFieldProps
  } = initialProps as AppInputFieldProps;

  const { boxProps, restProps } = extractBoxProps(propsWithoutFieldProps);
  const { multiline, ...textInputProps } = restProps as TextInputProps;

  const shellProps = boxProps;

  const { theme, tokens, fonts } = useTheme();

  const isHero = variant === 'hero';
  const isMinimal = variant === 'minimal';

  return (
    <Box
      flexDirection="row"
      alignItems={multiline ? 'flex-start' : 'center'}
      borderWidth={borderWidthProp ?? (isMinimal ? 0 : 1)}
      borderRadius={isHero ? 'none' : 'r3'}
      paddingHorizontal={isMinimal ? 0 : 'md'}
      minHeight={isHero ? Size.xxl * 2.5 : isMinimal ? 0 : Size.inputMd}
      justifyContent={isHero ? 'center' : 'flex-start'}
      background={backgroundProp || (isMinimal ? 'transparent' : 'surface')}
      borderColor={isMinimal ? 'transparent' : borderColorProp || 'border'}
      {...shellProps}
    >
      {leftIcon && (
        <View style={styles.iconContainer}>
          <AppIcon name={leftIcon} size={20} color={tokens.input.placeholder} />
        </View>
      )}
      <TextInput
        ref={ref}
        style={[
          styles.input,
          isHero && [styles.heroInput, { fontFamily: fonts.bold }],
          multiline && styles.multilineInput,
          { color: theme.text },
          textInputStyle,
          inputStyle,
        ]}
        placeholderTextColor={tokens.input.placeholder}
        multiline={multiline}
        {...textInputProps}
      />
    </Box>
  );
});

AppInputFieldInner.displayName = 'AppInputField';

export const AppInputField = AppInputFieldInner;

const styles = StyleSheet.create({
  input: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.base,
    minHeight: Size.inputMd,
  },
  heroInput: {
    fontSize: Typography.sizes.hero,
    textAlign: 'center',
    minHeight: Size.xxl * 2.5,
  },
  multilineInput: {
    minHeight: Size.xxl * 2,
    textAlignVertical: 'top',
  },
  iconContainer: {
    marginRight: Spacing.sm,
  },
});
