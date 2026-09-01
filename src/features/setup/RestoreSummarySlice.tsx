import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { workplaceService } from '@/src/services/WorkplaceService';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import type { RestoreHandoff, RestoreSummaryIntent, SetupJourneyId } from './setupTypes';
import type { WorkplaceId } from '@/src/types/ids';

type Verification =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | {
      readonly status: 'ready';
      readonly name: string;
      readonly currency: string;
      readonly icon: string;
    };

export function RestoreSummarySlice({
  journeyId,
  operationId,
  handoff,
  isCompleting,
  onIntent,
  onBack,
}: {
  readonly journeyId: SetupJourneyId;
  readonly operationId: WorkplaceId;
  readonly handoff: RestoreHandoff | undefined;
  readonly isCompleting: boolean;
  readonly onIntent: (intent: RestoreSummaryIntent) => void;
  readonly onBack: () => void;
}) {
  const [retryKey, setRetryKey] = useState(0);
  const [verification, setVerification] = useState<Verification>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!handoff || handoff.operationId !== operationId) {
        if (!cancelled) setVerification({ status: 'missing' });
        return;
      }
      const workplace = await workplaceService.getWorkplace(handoff.workplaceId);
      if (cancelled) return;
      if (!workplace || workplace.id !== handoff.workplaceId) {
        setVerification({ status: 'missing' });
        return;
      }
      setVerification({
        status: 'ready',
        name: workplace.name,
        currency: workplace.defaultCurrencyCode,
        icon: workplace.icon,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff, operationId, retryKey]);

  const stats = handoff?.stats;
  const skippedItems = stats?.skippedItems ?? [];
  const warnings = handoff?.warnings ?? [];
  const verified = verification.status === 'ready';
  const continues = journeyId === 'first_run_restore';
  const activates = journeyId === 'empty_device_restore';

  return (
    <Box flex={1} padding="lg">
      <ScrollView>
        <Stack gap="md">
          <AppText variant="title">Restore is ready</AppText>
          {verification.status === 'loading' ? (
            <AppText variant="body" color="secondary">
              Verifying the published workplace...
            </AppText>
          ) : verified ? (
            <AppText variant="body" color="secondary">
              {verification.name} was published and is not active yet.
            </AppText>
          ) : (
            <AppText variant="body" color="secondary">
              Restore publication could not be verified. Retry or discard this restore.
            </AppText>
          )}
          {verified ? (
            <AppCard elevation="sm" paddingSize="md">
              <Stack gap="xs">
                <AppText variant="caption">Workplace {verification.name}</AppText>
                <AppText variant="caption">Icon {verification.icon}</AppText>
                <AppText variant="caption">Currency {verification.currency}</AppText>
                {stats ? (
                  <>
                    <AppText variant="caption">Accounts {stats.accounts}</AppText>
                    <AppText variant="caption">Journals {stats.journals}</AppText>
                    <AppText variant="caption">Entries {stats.transactions}</AppText>
                    {stats.skippedTransactions > 0 ? (
                      <AppText variant="caption">Skipped {stats.skippedTransactions}</AppText>
                    ) : null}
                  </>
                ) : null}
              </Stack>
            </AppCard>
          ) : null}
          {verified && skippedItems.length > 0 ? (
            <AppCard elevation="sm" paddingSize="md">
              <Stack gap="xs">
                <AppText variant="caption">Skipped items</AppText>
                {skippedItems.slice(0, 20).map(item => (
                  <AppText key={item.id} variant="caption">
                    {item.reason}
                    {item.description ? ` — ${item.description}` : ''}
                  </AppText>
                ))}
              </Stack>
            </AppCard>
          ) : null}
          {verified && warnings.length > 0 ? (
            <AppCard elevation="sm" paddingSize="md">
              <Stack gap="xs">
                <AppText variant="caption">Warnings</AppText>
                {warnings.map(warning => (
                  <AppText key={warning} variant="caption">
                    {warning}
                  </AppText>
                ))}
              </Stack>
            </AppCard>
          ) : null}
          {continues ? (
            <AppButton
              variant="primary"
              testID="restore-summary-continue"
              onPress={() => onIntent('continue')}
              loading={isCompleting}
              disabled={!verified}
            >
              Continue setup
            </AppButton>
          ) : (
            <AppButton
              variant="primary"
              testID="restore-summary-open"
              onPress={() => onIntent('open')}
              loading={isCompleting}
              disabled={!verified}
            >
              {activates ? 'Activate' : 'Open workplace'}
            </AppButton>
          )}
          {journeyId === 'picker_restore' ? (
            <AppButton
              variant="outline"
              onPress={() => onIntent('return_to_picker')}
              disabled={isCompleting}
            >
              Return to picker
            </AppButton>
          ) : null}
          {journeyId === 'settings_restore' ? (
            <AppButton variant="outline" onPress={() => onIntent('stay')} disabled={isCompleting}>
              Stay here
            </AppButton>
          ) : null}
          {verification.status === 'missing' ? (
            <AppButton
              variant="outline"
              testID="restore-summary-retry"
              onPress={() => {
                setVerification({ status: 'loading' });
                setRetryKey(key => key + 1);
              }}
              disabled={isCompleting}
            >
              Retry
            </AppButton>
          ) : null}
          <AppButton variant="ghost" onPress={() => onIntent('discard')} disabled={isCompleting}>
            Discard
          </AppButton>
          <AppButton variant="ghost" onPress={onBack} disabled={isCompleting}>
            Back
          </AppButton>
        </Stack>
      </ScrollView>
    </Box>
  );
}
