import { AppInput } from '@/src/components/core/AppInput';
import { Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { View } from 'react-native';

export interface UnderlineNameFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  maxLength?: number;
  testID?: string;
}

export function UnderlineNameField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  maxLength,
  testID = 'hero-name-input',
}: UnderlineNameFieldProps) {
  const { theme, fonts } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: focused ? theme.primary : theme.border,
        paddingBottom: Spacing.xs,
      }}
    >
      <AppInput
        variant="minimal"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoFocus={autoFocus}
        maxLength={maxLength}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        marginBottom={0}
        inputStyle={{
          fontSize: Typography.sizes.lg,
          fontFamily: fonts.medium,
          color: theme.text,
          paddingVertical: Spacing.xs,
          textAlign: 'left',
          letterSpacing: Typography.letterSpacing.tight,
        }}
      />
    </View>
  );
}
