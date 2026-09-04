import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { loadRestoreSummaries, type RestoreSummaryView } from './setupFinishers';
import type { RestoreSummaryActions } from './setupRecipes';
import type { RestoreSetupDraft, RestoreSummaryIntent } from './setupTypes';

type Verification =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly views: readonly RestoreSummaryView[] };

export function RestoreSummarySlice({
  draft,
  actions,
  isCompleting,
  onIntent,
}: {
  readonly draft: RestoreSetupDraft;
  readonly actions: RestoreSummaryActions;
  readonly isCompleting: boolean;
  readonly onIntent: (intent: RestoreSummaryIntent) => void;
}) {
  const { theme } = useTheme();
  const [retryKey, setRetryKey] = useState(0);
  const [verification, setVerification] = useState<Verification>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const views = await loadRestoreSummaries(draft);
        if (cancelled) return;
        setVerification(views?.length ? { status: 'ready', views } : { status: 'missing' });
      } catch {
        if (!cancelled) setVerification({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, retryKey]);

  const stats = draft.restore.handoff?.stats;
  const skippedItems = stats?.skippedItems ?? [];
  const warnings = draft.restore.handoff?.warnings ?? [];
  const verified = verification.status === 'ready';
  const views = verification.status === 'ready' ? verification.views : [];
  const primaryLabel = views.length > 1 ? 'Choose a workplace' : actions.primary.label;

  return (
    <Box flex={1} padding="lg" testID="restore-summary-slice">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Stack gap="md">
          {verified ? (
            <AppCard elevation="sm" paddingSize="lg" style={styles.completeCard}>
              <View style={[styles.successMark, { backgroundColor: theme.success + '22' }]}>
                <AppIcon name="check" size={Size.iconMd} color={theme.success} />
              </View>
              <AppText variant="heading" align="center" style={styles.completeTitle}>
                Restore is ready
              </AppText>
              <AppText variant="body" color="secondary" align="center" style={styles.completeText}>
                {views.length === 1
                  ? `${views[0]?.name} was published and is ready for the final setup step.`
                  : `${views.length} workplaces were published and are ready for the final setup step.`}
              </AppText>
              <Stack gap="sm">
                {views.map((item, index) => (
                  <View
                    key={`${item.name}-${item.currency}-${index}`}
                    style={[
                      index > 0 && styles.workplaceDivider,
                      index > 0 && { borderColor: theme.border },
                    ]}
                  >
                    <AppText variant="subheading" weight="bold" style={styles.workplaceName}>
                      {item.name}
                    </AppText>
                    <View style={[styles.statsGrid, { borderColor: theme.border }]}>
                      <RestoreStat label="Currency" value={item.currency} />
                      <RestoreStat label="Accounts" value={item.accounts} />
                      <RestoreStat label="Categories" value={item.categories} />
                      <RestoreStat label="Journals" value={item.journals} />
                    </View>
                  </View>
                ))}
              </Stack>
            </AppCard>
          ) : (
            <>
              <AppText variant="title">Restore is ready</AppText>
              <AppText variant="body" color="secondary">
                {verification.status === 'loading'
                  ? 'Verifying the published workplace...'
                  : 'Restore publication could not be verified. Retry or discard this restore.'}
              </AppText>
            </>
          )}
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
            {primaryLabel}
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
          {verification.status === 'missing' || verification.status === 'error' ? (
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
        </Stack>
      </ScrollView>
    </Box>
  );
}

function RestoreStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <View style={styles.statTile}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <AppText variant="subheading" weight="bold" color="success" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xl },
  completeCard: { marginTop: Spacing.sm },
  successMark: {
    alignSelf: 'center',
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  completeTitle: { marginBottom: Spacing.xs },
  completeText: { marginBottom: Spacing.md },
  workplaceName: { marginBottom: Spacing.xs },
  workplaceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statTile: {
    width: '47%',
    minHeight: Size.xl,
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
});
