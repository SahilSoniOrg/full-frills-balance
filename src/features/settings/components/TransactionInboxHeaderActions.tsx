import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { AppButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Platform, StyleSheet, View } from 'react-native';

type TransactionInboxHeaderActionsProps = {
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRules: () => void;
};

export function TransactionInboxHeaderActions({
  isRefreshing,
  onRefresh,
  onOpenRules,
}: TransactionInboxHeaderActionsProps) {
  const isAndroid = Platform.OS === 'android';

  return (
    <View style={styles.headerActions}>
      <AppButton variant="ghost" size="sm" onPress={onOpenRules}>
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
