import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { StyleSheet, View } from 'react-native';
export function SettleUpScreen() {
  return (
    <ScreenWithChrome
      chrome={buildDetailNavChrome({
        phase: 'ready',
        readyTitle: 'Settle up',
        loadingTitle: 'Settle up',
        onBack: AppNavigation.back,
      })}
    >
      <View style={styles.content}>
        <AppText>Settle up</AppText>
      </View>
    </ScreenWithChrome>
  );
}
const styles = StyleSheet.create({ content: { flex: 1, padding: Spacing.lg } });
