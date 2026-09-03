import { AppInput } from '@/src/components/core/AppInput';
import { Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleProp, View, ViewStyle } from 'react-native';

interface HeroNumberInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'decimal-pad';
  containerStyle?: StyleProp<ViewStyle>;
  minWidth?: number;
  testID?: string;
}

/**
 * A large, centered input for high-priority numeric values (amounts).
 * Enforces the hero hierarchy requested in the design system review.
 */
export const HeroNumberInput = ({
  value,
  onChangeText,
  placeholder = '0.00',
  keyboardType = 'decimal-pad',
  containerStyle,
  minWidth = 150,
  testID,
}: HeroNumberInputProps) => {
  const { theme, fonts } = useTheme();

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
        containerStyle,
      ]}
    >
      <AppInput
        variant="minimal"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        testID={testID}
        inputStyle={{
          fontSize: Typography.sizes.hero / 1.5,
          fontFamily: fonts.semibold,
          textAlign: 'center',
          minWidth: minWidth,
          letterSpacing: -1,
          color: theme.text,
        }}
      />
    </View>
  );
};
