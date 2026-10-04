import { AppInput, AppText } from '@/src/components/core';
import { Size, Spacing, Typography } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export function ManualBaseRateField({
  currency,
  workplaceCurrency,
  value,
  onChangeText,
}: {
  currency: string;
  workplaceCurrency: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.container}>
      <AppText variant="caption" color="secondary">
        1 {currency} =
      </AppText>
      <AppInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Rate"
        keyboardType="decimal-pad"
        variant="minimal"
        containerStyle={styles.inputContainer}
        style={styles.input}
      />
      <AppText variant="caption" color="secondary">
        {workplaceCurrency}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inputContainer: {
    width: Size.fieldNarrow,
    minHeight: 0,
  },
  input: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
    fontWeight: '700',
  },
});
