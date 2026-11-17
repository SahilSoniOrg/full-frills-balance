import { AppIcon, AppInput, PressScaleTouchable } from '@/src/components/core';
import { Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { StyleSheet, View } from 'react-native';

/** Settings-style search field with an inline clear control. */
export function CaptureSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
  clearTestID,
  clearAccessibilityLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  testID: string;
  clearTestID: string;
  clearAccessibilityLabel: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.searchField}>
      <AppInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        leftIcon={Icon.Search}
        inputStyle={[styles.searchInput, value ? styles.inputWithClear : null]}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
      {value ? (
        <PressScaleTouchable
          pressScale="subtle"
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          testID={clearTestID}
          style={styles.clearButton}
          hitSlop={8}
        >
          <AppIcon name={Icon.Close} size={18} color={theme.textSecondary} />
        </PressScaleTouchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchField: { position: 'relative' },
  searchInput: {
    paddingVertical: 0,
    minHeight: 0,
    height: Size.inputMd - 2,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  inputWithClear: { paddingRight: 40 },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
