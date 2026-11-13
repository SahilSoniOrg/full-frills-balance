import { AppButton, AppCard, AppText, Badge, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { AppNavigation } from '@/src/utils/navigation';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  useTransactionCaptureViewModel,
  type TransactionCaptureViewModel,
} from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { formatDate } from '@/src/utils/dateUtils';
import { GmailCaptureSettingsSection } from '@/src/features/settings/components/GmailCaptureSettingsSection';
import { useGmailCaptureViewModel } from '@/src/features/settings/hooks/useGmailCaptureViewModel';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

interface CaptureWorkspaceViewProps {
  onOpenSmsSettings: () => void;
  capture: TransactionCaptureViewModel;
  gmailSection: ReactNode;
  gmailSettingsEnabled?: boolean;
  hasAutomaticCaptureSource: boolean;
  captureSourceLoading: boolean;
}

export function CaptureWorkspaceView({
  onOpenSmsSettings,
  capture,
  gmailSection,
  gmailSettingsEnabled = false,
  hasAutomaticCaptureSource,
  captureSourceLoading,
}: CaptureWorkspaceViewProps) {
  const { resolvedHourCycle } = useHourCyclePrefs();
  return (
    <SettingsLayout title={strings.title}>
      <Stack space="lg">
        <FocusTarget targetId="capture-review">
          <ConnectedSourcesSection
            onOpenSmsSettings={onOpenSmsSettings}
            gmailSection={gmailSection}
          />
        </FocusTarget>

        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">{strings.loadError}</AppText>
            <AppButton variant="secondary" onPress={() => void capture.onRetry()}>
              {strings.retry}
            </AppButton>
          </Stack>
        ) : null}
        <FocusTarget targetId="transaction-capture-enabled">
          {Platform.OS === 'web' ? (
            <AppCard variant="secondary" paddingSize="sm">
              <AppText variant="bodySmall" color="secondary">
                {strings.captureUnavailable}
              </AppText>
            </AppCard>
          ) : hasAutomaticCaptureSource || capture.enabled ? (
            <ListGroup
              variant="plain"
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
                capture.loading
                  ? strings.loading
                  : captureSourceLoading
                    ? strings.checkingSources
                    : capture.enabled && !hasAutomaticCaptureSource
                      ? strings.noAutomaticSourceEnabled
                      : capture.enabled && capture.enabledAt
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
          ) : capture.loading || captureSourceLoading ? (
            <AppText color="secondary">
              {capture.loading ? strings.loading : strings.checkingSources}
            </AppText>
          ) : (
            <AppCard variant="secondary" paddingSize="sm">
              <AppText variant="bodySmall" color="secondary">
                {gmailSettingsEnabled
                  ? Platform.OS === 'android'
                    ? strings.captureSourceRequiredAndroid
                    : strings.captureSourceRequired
                  : Platform.OS === 'android'
                    ? strings.captureSourceRequiredAndroidWithoutGmail
                    : strings.captureSourceUnavailableWithoutGmail}
              </AppText>
            </AppCard>
          )}
        </FocusTarget>
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

        <ListGroup variant="plain" header={strings.attentionHeader}>
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
            focusId="transaction-capture-inbox"
            icon={Icon.MessageSquare}
            title={strings.inboxTitle}
            subtitle={strings.inboxDescription}
            onPress={AppNavigation.toTransactionInbox}
            wrap
          />
        </ListGroup>

        <ListGroup variant="plain" header={strings.matchingHeader}>
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
      </Stack>
    </SettingsLayout>
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
  const showGmail = Platform.OS !== 'web' && gmailSection !== null;
  if (!showSms && !showGmail) return null;
  return (
    <Stack space="sm">
      <Box paddingHorizontal="md">
        <AppText variant="overline" color="secondary" accessibilityRole="header">
          {strings.sourcesHeader}
        </AppText>
      </Box>
      {showSms ? (
        <ListGroup variant="plain">
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
  const capture = useTransactionCaptureViewModel();
  if (Platform.OS === 'web') {
    return (
      <CaptureWorkspaceView
        key={capture.workplaceId}
        onOpenSmsSettings={AppNavigation.toSmsSettings}
        capture={capture}
        gmailSection={null}
        gmailSettingsEnabled={false}
        hasAutomaticCaptureSource={false}
        captureSourceLoading={false}
      />
    );
  }

  return <NativeCaptureWorkspaceView capture={capture} />;
}

function NativeCaptureWorkspaceView({ capture }: { capture: TransactionCaptureViewModel }) {
  const smsPrefs = useSmsPrefs();
  const gmail = useGmailCaptureViewModel();
  const hasAutomaticCaptureSource =
    (Platform.OS === 'android' && smsPrefs.isAutomaticSmsImportEnabled) ||
    (gmail.featureEnabled && gmail.connected && gmail.automaticCaptureEnabled);

  return (
    <CaptureWorkspaceView
      key={capture.workplaceId}
      onOpenSmsSettings={AppNavigation.toSmsSettings}
      capture={capture}
      gmailSection={
        gmail.featureEnabled || gmail.connected ? (
          <GmailCaptureSettingsSection gmail={gmail} featureEnabled={gmail.featureEnabled} />
        ) : null
      }
      gmailSettingsEnabled={gmail.featureEnabled}
      hasAutomaticCaptureSource={hasAutomaticCaptureSource}
      captureSourceLoading={gmail.featureEnabled && !hasAutomaticCaptureSource && gmail.loading}
    />
  );
}

export default withPrivacyScope(CaptureWorkspaceScreen);
