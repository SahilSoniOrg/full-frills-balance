import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppButton, IconButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Icon } from '@/src/types/domainIcons';
import { Platform, StyleSheet, View } from 'react-native';

type TransactionInboxHeaderActionsProps = {
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenCaptureWorkspace: () => void;
};

export function TransactionInboxHeaderActions({
  isRefreshing,
  onRefresh,
  onOpenCaptureWorkspace,
}: TransactionInboxHeaderActionsProps) {
  const isMobile = Platform.OS !== 'web';

  return (
    <View style={styles.headerActions}>
      <AppButton variant="ghost" size="sm" onPress={onOpenCaptureWorkspace}>
        Capture & review
      </AppButton>
      {isMobile ? (
        <IconButton
          name={Icon.Refresh}
          size={Size.iconSm}
          variant="clear"
          onPress={onRefresh}
          disabled={isRefreshing}
          testID="inbox-refresh-sms"
          accessibilityLabel="Refresh transaction inbox"
        />
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
