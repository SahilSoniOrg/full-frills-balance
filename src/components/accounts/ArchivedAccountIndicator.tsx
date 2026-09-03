import { AppIcon } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

type ArchivedAccountIndicatorProps = {
  emphasized?: boolean;
};

export function ArchivedAccountIndicator({ emphasized = false }: ArchivedAccountIndicatorProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <AppIcon
        name="archive"
        size={Size.iconSm}
        color={theme.textTertiary}
        opacity={emphasized ? 1 : Opacity.medium}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: Spacing.xs,
  },
});
