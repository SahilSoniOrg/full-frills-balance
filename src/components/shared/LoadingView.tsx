import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

export interface LoadingViewProps {
  loading: boolean;
  text?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}

export function LoadingView({
  loading,
  text = AppConfig.strings.common.loading,
  size = 'large',
  style,
}: LoadingViewProps) {
  const { theme } = useTheme();
  if (!loading) return null;

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={theme.primary} />
      <AppText variant="body" color="secondary" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    marginTop: Spacing.sm,
  },
});
