import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { AppButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import { Platform, StyleSheet, View } from 'react-native';

type TransactionInboxHeaderActionsProps = {
  isRefreshing: boolean;
  onRefresh: () => void;
};

export function TransactionInboxHeaderActions({
  isRefreshing,
  onRefresh,
}: TransactionInboxHeaderActionsProps) {
  const isAndroid = Platform.OS === 'android';

  return (
    <View style={styles.headerActions}>
      <AppButton variant="ghost" size="sm" onPress={AppNavigation.toSmsRules}>
        Rules
      </AppButton>
      {isAndroid ? (
        <AppButton
          variant="ghost"
          size="sm"
          loading={isRefreshing}
          onPress={onRefresh}
          testID="inbox-refresh-sms"
        >
          Refresh SMS
        </AppButton>
      ) : null}
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
