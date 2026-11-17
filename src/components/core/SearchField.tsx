import { AppConfig } from '@/src/constants/app-config';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { AppInput } from './AppInput';
import { PressScaleTouchable } from './PressScaleTouchable';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  clearAccessibilityLabel?: string;
  autoFocus?: boolean;
  testID?: string;
  clearTestID?: string;
}

/** Search input with a leading search icon and an inline clear control that keeps focus. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(
  (
    {
      value,
      onChangeText,
      placeholder,
      accessibilityLabel = placeholder,
      clearAccessibilityLabel = AppConfig.strings.common.clearSearch,
      autoFocus,
      testID,
      clearTestID,
    },
    ref,
  ) => {
    const { theme } = useTheme();
    const inputRef = useRef<TextInput>(null);
    useImperativeHandle(ref, () => inputRef.current as TextInput);

    return (
      <View>
        <AppInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          leftIcon={Icon.Search}
          inputStyle={[styles.input, value ? styles.inputWithClear : null]}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        />
        {value ? (
          <PressScaleTouchable
            pressScale="subtle"
            onPress={() => {
              onChangeText('');
              inputRef.current?.focus();
            }}
            accessibilityRole="button"
            accessibilityLabel={clearAccessibilityLabel}
            testID={clearTestID}
            style={styles.clearButton}
            hitSlop={Spacing.sm}
          >
            <AppIcon name={Icon.Close} size={Size.iconSm} color={theme.textSecondary} />
          </PressScaleTouchable>
        ) : null}
      </View>
    );
  },
);

SearchField.displayName = 'SearchField';

const styles = StyleSheet.create({
  // AppInputField's paddingVertical + minHeight sinks placeholder text.
  input: {
    paddingVertical: 0,
    minHeight: 0,
    height: Size.inputMd - 2,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  inputWithClear: { paddingRight: Size.touchTarget },
  clearButton: {
    position: 'absolute',
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
