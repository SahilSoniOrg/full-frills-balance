import { AppInput } from '@/src/components/core/AppInput';
import { Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { View, type TextStyle } from 'react-native';

export interface UnderlineNameFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  maxLength?: number;
  testID?: string;
}

const NameFieldAlignmentContext = createContext<TextStyle['textAlign']>('left');

export function FormHeroNameFieldAlignment({
  align,
  children,
}: {
  align: 'left' | 'center';
  children: ReactNode;
}) {
  return (
    <NameFieldAlignmentContext.Provider value={align}>
      {children}
    </NameFieldAlignmentContext.Provider>
  );
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
  const textAlign = useContext(NameFieldAlignmentContext);
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
        inputStyle={{
          fontSize: Typography.sizes.lg,
          fontFamily: fonts.medium,
          color: theme.text,
          paddingVertical: Spacing.xs,
          textAlign,
          letterSpacing: Typography.letterSpacing.tight,
        }}
        containerStyle={{ marginBottom: 0 }}
      />
    </View>
  );
}
