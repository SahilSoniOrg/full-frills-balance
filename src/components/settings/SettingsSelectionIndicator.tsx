import { AppIcon } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

export function SettingsSelectionIndicator({ selected }: { selected: boolean }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.indicator,
        {
          backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {selected ? <AppIcon name="check" size={13} color={theme.onPrimary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
