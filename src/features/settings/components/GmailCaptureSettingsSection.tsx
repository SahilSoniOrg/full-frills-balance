import { AppButton, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { gmailCaptureStrings as strings } from '@/src/constants/copy/domains/gmailCaptureStrings';
import type { useGmailCaptureViewModel } from '@/src/features/settings/hooks/useGmailCaptureViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { Platform } from 'react-native';

export function GmailCaptureSettingsSection({
  gmail,
  featureEnabled,
}: {
  gmail: ReturnType<typeof useGmailCaptureViewModel>;
  featureEnabled: boolean;
}) {
  if (Platform.OS === 'web' || (!featureEnabled && !gmail.connected)) return null;

  return (
    <ListGroup variant="plain">
      <ListRow
        focusId="transaction-capture-gmail"
        icon={Icon.Mail}
        title={strings.title}
        subtitle={
          !featureEnabled
            ? strings.featurePaused
            : gmail.connected
              ? gmail.syncState === 'error'
                ? strings.syncError
                : strings.connected
              : strings.disconnected
        }
        disabled={gmail.loading || gmail.busy}
        onPress={gmail.onToggleGmail}
        testID="transaction-capture-gmail"
      />
      {featureEnabled && gmail.connected && gmail.syncState === 'error' ? (
        <AppButton variant="ghost" disabled={gmail.busy} onPress={gmail.onReconnectGmail}>
          {strings.reconnect}
        </AppButton>
      ) : null}
      {gmail.connected ? (
        <ListRow
          focusId="transaction-capture-gmail-background"
          icon={Icon.History}
          title={strings.backgroundSetting}
          subtitle={!featureEnabled ? strings.backgroundPaused : strings.backgroundDescription}
          disabled={gmail.loading || gmail.busy || (!featureEnabled && !gmail.backgroundEnabled)}
          trailing={
            <ListRow.Toggle
              value={gmail.backgroundEnabled}
              onValueChange={gmail.onToggleGmailBackground}
            />
          }
        />
      ) : null}
      {gmail.connected ? (
        <ListRow
          focusId="transaction-capture-gmail-auto"
          icon={Icon.Zap}
          title={strings.automaticSetting}
          subtitle={!featureEnabled ? strings.automaticPaused : strings.automaticDescription}
          disabled={
            gmail.loading || gmail.busy || (!featureEnabled && !gmail.automaticCaptureEnabled)
          }
          trailing={
            <ListRow.Toggle
              value={gmail.automaticCaptureEnabled}
              onValueChange={gmail.onToggleGmailAutomaticCapture}
            />
          }
        />
      ) : null}
      {featureEnabled && gmail.connected ? (
        <ListRow
          focusId="transaction-capture-gmail-accounts"
          icon={Icon.Document}
          title={strings.accountHelp}
          subtitle={strings.accountHelpDescription}
          onPress={AppNavigation.toAccounts}
        />
      ) : null}
    </ListGroup>
  );
}
