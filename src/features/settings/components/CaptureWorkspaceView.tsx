import {
  AppButton,
  AppCard,
  AppText,
  Badge,
  ListGroup,
  ListRow,
  ErrorStateView,
} from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  useTransactionCaptureViewModel,
  type TransactionCaptureViewModel,
} from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { formatDate } from '@/src/utils/dateFormatting';
import { GmailCaptureSettingsSection } from '@/src/features/settings/components/GmailCaptureSettingsSection';
import { useGmailCaptureViewModel } from '@/src/features/settings/hooks/useGmailCaptureViewModel';
import { isGmailCaptureSectionVisible } from '@/src/features/settings/utils/gmailCaptureVisibility';
import { shortcutSmsIntakeService } from '@/src/services/sms/ShortcutSmsIntakeService';
import { AppState, Platform } from 'react-native';
import { type ReactNode, useEffect, useState } from 'react';

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
      <FocusTarget targetId="capture-review">
        <ConnectedSourcesSection
          onOpenSmsSettings={onOpenSmsSettings}
          gmailSection={gmailSection}
        />
      </FocusTarget>

      {capture.error ? (
        <ErrorStateView
          variant="inline"
          message={strings.loadError}
          onRetry={() => void capture.onRetry()}
          retryLabel={strings.retry}
        />
      ) : null}
      <FocusTarget targetId="transaction-capture-enabled">
        {Platform.OS === 'web' ? (
          <AppCard variant="secondary" padding="md">
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
          <AppCard variant="secondary" padding="md">
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
          <Stack gap="md">
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
          focusId="transaction-capture-review-queue"
          icon={Icon.Tag}
          title={strings.reviewOpenTitle}
          subtitle={
            capture.loading
              ? strings.reviewLoading
              : capture.error && !capture.hasSnapshot
                ? strings.loadError
                : capture.reviewCount > 0
                  ? strings.reviewCount(capture.reviewCount)
                  : strings.emptyReview
          }
          trailing={
            <Badge
              variant={
                capture.loading || (capture.error && !capture.hasSnapshot)
                  ? 'default'
                  : capture.reviewCount > 0
                    ? 'warning'
                    : 'success'
              }
              size="sm"
              icon={
                !capture.loading &&
                (!capture.error || capture.hasSnapshot) &&
                capture.reviewCount === 0
                  ? Icon.Check
                  : undefined
              }
            >
              {capture.loading || (capture.error && !capture.hasSnapshot)
                ? '—'
                : capture.reviewCount}
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
          focusId="transaction-capture-suggestions"
          icon={Icon.Zap}
          title={strings.suggestionsTitle}
          subtitle={strings.suggestionsOverviewDescription}
          disabled={capture.loading || (!capture.hasSnapshot && Boolean(capture.error))}
          onPress={AppNavigation.toCaptureSuggestions}
          testID="transaction-capture-suggestions"
          wrap
        />
      </ListGroup>
    </SettingsLayout>
  );
}

function ShortcutSmsSetup() {
  const [firstReceivedAt, setFirstReceivedAt] = useState<number | null | 'loading' | 'unavailable'>(
    'loading',
  );
  const { resolvedHourCycle } = useHourCyclePrefs();
  const copy = strings.shortcutSms;

  useEffect(() => {
    let active = true;
    const refreshStatus = () => {
      void shortcutSmsIntakeService.getFirstReceivedAt().then(
        date => {
          if (active) setFirstReceivedAt(date);
        },
        () => {
          if (active) setFirstReceivedAt('unavailable');
        },
      );
    };
    refreshStatus();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshStatus();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <ListGroup
      variant="plain"
      header={copy.title}
      footer={
        firstReceivedAt === 'unavailable'
          ? copy.unavailable
          : firstReceivedAt === 'loading'
            ? copy.loading
            : firstReceivedAt === null
              ? copy.waiting
              : copy.firstReceived(
                  formatDate(firstReceivedAt, { includeTime: true, hourCycle: resolvedHourCycle }),
                )
      }
    >
      <Stack gap="sm" padding="md">
        {copy.steps.map((step, index) => (
          <AppText key={step} variant="bodySmall" color="secondary">
            {`${index + 1}. ${step}`}
          </AppText>
        ))}
        <AppText variant="bodySmall" color="secondary">
          {copy.privacy}
        </AppText>
        <AppText variant="bodySmall" color="secondary">
          {copy.replayHint}
        </AppText>
      </Stack>
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
  const showGmail = Platform.OS !== 'web' && gmailSection !== null;
  const showShortcutSms = shortcutSmsIntakeService.canSetUp;
  if (!showSms && !showGmail && !showShortcutSms) return null;

  return (
    <Stack gap="sm">
      <Box paddingHorizontal="md">
        <SectionLabel label={strings.sourcesHeader} marginTop="none" />
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
      {showShortcutSms ? <ShortcutSmsSetup /> : null}
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
        isGmailCaptureSectionVisible(gmail.featureEnabled, gmail.connected) ? (
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
