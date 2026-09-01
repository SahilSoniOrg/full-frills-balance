import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { loadRestoreSummary, type RestoreSummaryView } from './setupFinishers';
import type { RestoreSummaryActions } from './setupRecipes';
import type { RestoreSetupDraft, RestoreSummaryIntent } from './setupTypes';

type Verification =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly view: RestoreSummaryView };

export function RestoreSummarySlice({
  draft,
  actions,
  isCompleting,
  onIntent,
  onBack,
}: {
  readonly draft: RestoreSetupDraft;
  readonly actions: RestoreSummaryActions;
  readonly isCompleting: boolean;
  readonly onIntent: (intent: RestoreSummaryIntent) => void;
  readonly onBack: () => void;
}) {
  const [retryKey, setRetryKey] = useState(0);
  const [verification, setVerification] = useState<Verification>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const view = await loadRestoreSummary(draft);
      if (cancelled) return;
      setVerification(view ? { status: 'ready', view } : { status: 'missing' });
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, retryKey]);

  const stats = draft.restore.handoff?.stats;
  const skippedItems = stats?.skippedItems ?? [];
  const warnings = draft.restore.handoff?.warnings ?? [];
  const verified = verification.status === 'ready';
  const view = verification.status === 'ready' ? verification.view : undefined;

  return (
    <Box flex={1} padding="lg" testID="restore-summary-slice">
      <ScrollView>
        <Stack gap="md">
          <AppText variant="title">Restore is ready</AppText>
          {verification.status === 'loading' ? (
            <AppText variant="body" color="secondary">
              Verifying the published workplace...
            </AppText>
          ) : verified && view ? (
            <AppText variant="body" color="secondary">
              {view.name} was published and is not active yet.
            </AppText>
          ) : (
            <AppText variant="body" color="secondary">
              Restore publication could not be verified. Retry or discard this restore.
            </AppText>
          )}
          {view ? (
            <AppCard elevation="sm" paddingSize="md">
              <Stack gap="xs">
                <AppText variant="caption">Workplace {view.name}</AppText>
                <AppText variant="caption">Icon {view.icon}</AppText>
                <AppText variant="caption">Currency {view.currency}</AppText>
                <AppText variant="caption">Accounts {view.accounts}</AppText>
                <AppText variant="caption">Categories {view.categories}</AppText>
                <AppText variant="caption">Journals {view.journals}</AppText>
                {stats && stats.skippedTransactions > 0 ? (
                  <AppText variant="caption">Skipped {stats.skippedTransactions}</AppText>
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
          <AppButton
            variant="primary"
            testID={
              actions.primary.intent === 'continue'
                ? 'restore-summary-continue'
                : 'restore-summary-open'
            }
            onPress={() => onIntent(actions.primary.intent)}
            loading={isCompleting}
            disabled={!verified}
          >
            {actions.primary.label}
          </AppButton>
          {actions.secondary ? (
            <AppButton
              variant="outline"
              testID="restore-summary-secondary"
              onPress={() => {
                const secondary = actions.secondary;
                if (secondary) onIntent(secondary.intent);
              }}
              disabled={!verified || isCompleting}
            >
              {actions.secondary.label}
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
