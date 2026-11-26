import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { StyleSheet, View } from 'react-native';
export function SplitExpenseScreen() {
  return (
    <ScreenWithChrome
      chrome={buildDetailNavChrome({
        phase: 'ready',
        readyTitle: 'Split expense',
        loadingTitle: 'Split expense',
        onBack: AppNavigation.back,
      })}
    >
      <View style={styles.content}>
        <AppText>Split expense</AppText>
      </View>
    </ScreenWithChrome>
  );
}
const styles = StyleSheet.create({ content: { flex: 1, padding: Spacing.lg } });
