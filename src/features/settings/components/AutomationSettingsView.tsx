import { AppButton, AppCard, AppText, Badge, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  useNotificationSettingsViewModel,
  type NotificationSettingsViewModel,
} from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  useTransactionCaptureViewModel,
  type TransactionCaptureViewModel,
} from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { formatDate } from '@/src/utils/dateUtils';
import { GmailCaptureSettingsSection } from '@/src/features/settings/components/GmailCaptureSettingsSection';
import { useGmailCaptureViewModel } from '@/src/features/settings/hooks/useGmailCaptureViewModel';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

interface AutomationSettingsViewProps {
  notifications: NotificationSettingsViewModel;
  onOpenSmsSettings: () => void;
  capture: TransactionCaptureViewModel;
  gmailSection: ReactNode;
}

export function AutomationSettingsView({
  notifications,
  onOpenSmsSettings,
  capture,
  gmailSection,
}: AutomationSettingsViewProps) {
  const { resolvedHourCycle } = useHourCyclePrefs();
  return (
    <SettingsLayout title={strings.title} hideFooter>
      <Stack space="lg">
        <AppCard variant="secondary" paddingSize="sm">
          <AppText variant="bodySmall" color="secondary">
            {strings.workspaceDescription}
          </AppText>
        </AppCard>
        {capture.loading ? <AppText color="secondary">{strings.loading}</AppText> : null}
        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">{strings.loadError}</AppText>
            <AppButton variant="secondary" onPress={() => void capture.onRetry()}>
              {strings.retry}
            </AppButton>
          </Stack>
        ) : null}
        {Platform.OS !== 'web' ? (
          <ListGroup
            variant="card"
            header={strings.captureHeader}
            headerAccessory={
              <Badge
                variant={capture.enabled ? 'success' : 'default'}
                size="sm"
                icon={capture.enabled ? Icon.Check : undefined}
              >
                {capture.enabled ? 'On' : 'Off'}
              </Badge>
            }
            footer={
              capture.enabled && capture.enabledAt
                ? strings.enabledSince(
                    formatDate(capture.enabledAt, {
                      includeTime: true,
                      hourCycle: resolvedHourCycle,
                    }),
                  )
                : strings.disabledHint
            }
          >
            <ListRow
              focusId="transaction-capture-enabled"
              icon={Icon.Zap}
              title={strings.captureTitle}
              subtitle={strings.captureDescription}
              disabled={capture.loading || capture.busy || capture.settingsError}
              testID="transaction-capture-toggle"
              trailing={
                <ListRow.Toggle value={capture.enabled} onValueChange={capture.onToggleEnabled} />
              }
              wrap
            />
          </ListGroup>
        ) : (
          <AppCard variant="secondary" paddingSize="sm">
            <AppText variant="bodySmall" color="secondary">
              {strings.sourcesUnavailable}
            </AppText>
          </AppCard>
        )}
        {capture.enabled && capture.needsAccountSetup ? (
          <AppCard variant="secondary">
            <Stack space="md">
              <AppText variant="bodySmall" color="secondary">
                {strings.accountSetupHint}
              </AppText>
              <AppButton
                variant="secondary"
                disabled={capture.loading || capture.busy || capture.settingsError}
                onPress={() => void capture.onConfigureAccounts()}
              >
                {strings.accountSetupAction}
              </AppButton>
            </Stack>
          </AppCard>
        ) : null}

        <ListGroup variant="card" header={strings.reviewHeader}>
          <ListRow
            icon={Icon.Tag}
            title={strings.reviewOpenTitle}
            subtitle={
              capture.loading
                ? strings.reviewLoading
                : capture.error
                  ? strings.loadError
                  : capture.reviewCount > 0
                    ? strings.reviewCount(capture.reviewCount)
                    : strings.emptyReview
            }
            trailing={
              <Badge
                variant={
                  capture.loading || capture.error
                    ? 'default'
                    : capture.reviewCount > 0
                      ? 'warning'
                      : 'success'
                }
                size="sm"
                icon={
                  !capture.loading && !capture.error && capture.reviewCount === 0
                    ? Icon.Check
                    : undefined
                }
              >
                {capture.loading || capture.error ? '—' : capture.reviewCount}
              </Badge>
            }
            onPress={AppNavigation.toCategorizationReview}
            testID="transaction-capture-review-queue"
            wrap
          />
          <ListRow
            icon={Icon.Zap}
            title={strings.suggestionsTitle}
            subtitle={strings.suggestionsOverviewDescription}
            disabled={capture.loading || capture.error}
            onPress={AppNavigation.toCaptureSuggestions}
            testID="transaction-capture-suggestions"
            wrap
          />
        </ListGroup>

        <ReviewActivitySection />
        <ConnectedSourcesSection
          onOpenSmsSettings={onOpenSmsSettings}
          gmailSection={gmailSection}
        />

        <NotificationPreferenceView
          cadence={notifications.notificationCadence}
          hour={notifications.notificationHour}
          minute={notifications.notificationMinute}
          weekday={notifications.notificationWeekday}
          onUpdateCadence={notifications.onUpdateNotificationCadence}
          onUpdateTime={notifications.onUpdateNotificationTime}
          onSendTest={notifications.onSendTestNotification}
        />
      </Stack>
    </SettingsLayout>
  );
}

function ReviewActivitySection() {
  return (
    <ListGroup variant="card" header={strings.reviewActivityHeader}>
      <ListRow
        focusId="transaction-capture-inbox"
        icon={Icon.MessageSquare}
        title={strings.inboxTitle}
        subtitle={strings.inboxDescription}
        onPress={AppNavigation.toTransactionInbox}
        wrap
      />
      <ListRow
        focusId="transaction-capture-activity"
        icon={Icon.History}
        title={strings.activityTitle}
        subtitle={strings.activityDescription}
        onPress={() => AppNavigation.toPrimaryPage('activity')}
        wrap
      />
    </ListGroup>
  );
}

function ConnectedSourcesSection({
  onOpenSmsSettings,
  gmailSection,
}: {
  onOpenSmsSettings: () => void;
  gmailSection: ReactNode;
}) {
  const showSms = Platform.OS === 'android';
  const showGmail = Platform.OS !== 'web';
  if (!showSms && !showGmail) return null;
  return (
    <Stack space="md">
      {showSms ? (
        <ListGroup variant="card" header={strings.sourcesHeader}>
          <ListRow
            focusId="sms-settings"
            icon={Icon.MessageSquare}
            title={strings.smsTitle}
            subtitle={strings.smsDescription}
            onPress={onOpenSmsSettings}
            testID="settings-sms-settings"
            wrap
          />
        </ListGroup>
      ) : null}
      {showGmail ? gmailSection : null}
    </Stack>
  );
}

function CaptureWorkspaceScreen() {
  const notifications = useNotificationSettingsViewModel();
  const capture = useTransactionCaptureViewModel();
  return (
    <AutomationSettingsView
      key={capture.workplaceId}
      notifications={notifications}
      onOpenSmsSettings={AppNavigation.toSmsSettings}
      capture={capture}
      gmailSection={<ConnectedGmailSection />}
    />
  );
}

function ConnectedGmailSection() {
  const gmail = useGmailCaptureViewModel();
  return <GmailCaptureSettingsSection gmail={gmail} />;
}

export default withPrivacyScope(CaptureWorkspaceScreen);
