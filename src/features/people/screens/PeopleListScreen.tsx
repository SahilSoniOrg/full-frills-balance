import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { StyleSheet, View } from 'react-native';

const chrome: TabScreenChrome = { kind: 'tab', screenTitle: 'People' };
export function PeopleListScreen() {
  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.content}>
        <AppText variant="subheading">People</AppText>
        <AppText color="secondary">Balances, splits, and settlements</AppText>
      </View>
    </ScreenWithChrome>
  );
}
const styles = StyleSheet.create({ content: { flex: 1, padding: Spacing.lg, gap: Spacing.sm } });
