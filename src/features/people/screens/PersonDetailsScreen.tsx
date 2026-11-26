import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { StyleSheet, View } from 'react-native';
export function PersonDetailsScreen() {
  return (
    <ScreenWithChrome
      chrome={buildDetailNavChrome({
        phase: 'ready',
        readyTitle: 'Person',
        loadingTitle: 'Person',
        onBack: AppNavigation.back,
      })}
    >
      <View style={styles.content}>
        <AppText variant="subheading">Person details</AppText>
      </View>
    </ScreenWithChrome>
  );
}
const styles = StyleSheet.create({ content: { flex: 1, padding: Spacing.lg } });
