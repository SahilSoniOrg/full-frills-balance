import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { IconButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import { StyleSheet, View } from 'react-native';

/** Primary nav actions only — period lives in the secondary filter bar. */
export function JournalListHeaderActions() {
  return (
    <View style={styles.headerActions}>
      <IconButton
        name="reports"
        size={Size.iconSm}
        variant="surface"
        onPress={AppNavigation.toReports}
        accessibilityLabel="View Analytics"
      />
      <IconButton
        name="search"
        size={Size.iconSm}
        variant="surface"
        onPress={() => AppNavigation.toJournalSearch()}
        accessibilityLabel="Search and Filter"
      />
      <PrivacyToggleButton />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
