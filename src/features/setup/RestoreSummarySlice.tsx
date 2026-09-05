import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { RestoreSummaryActions } from './setupRecipes';
import { restoreSources, type RestoreSetupDraft, type RestoreSummaryIntent } from './setupTypes';

type RestorePreview = {
  readonly name: string;
  readonly currency: string;
  readonly accounts: number;
  readonly categories: number;
  readonly journals: number;
};

function restorePreviews(draft: RestoreSetupDraft): readonly RestorePreview[] {
  const sources = restoreSources(draft);
  const workplace = draft.workplace;
  if (sources.length === 0 || !workplace) return [];
  return sources.map((source, index) => ({
    name:
      index === 0
        ? workplace.name.value
        : (source.facts.workplace.name ?? `Workplace ${index + 1}`),
    currency:
      index === 0
        ? workplace.baseCurrency.value
        : (source.facts.workplace.defaultCurrencyCode ?? ''),
    accounts: source.stats?.accounts ?? 0,
    categories: source.stats?.categories ?? 0,
    journals: source.stats?.journals ?? 0,
  }));
}

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
  const sources = restoreSources(draft);
  const skippedItems = sources.flatMap(source => source.stats?.skippedItems ?? []);
  const warnings = sources.flatMap(source => source.warnings ?? []);
  const views = restorePreviews(draft);
  const ready = views.length > 0;

  return (
    <Box flex={1} padding="lg" testID="restore-summary-slice">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Stack gap="md">
          {ready ? (
            <AppCard elevation="sm" paddingSize="lg" style={styles.completeCard}>
              <View style={[styles.successMark, { backgroundColor: theme.success + '22' }]}>
                <AppIcon name="check" size={Size.iconMd} color={theme.success} />
              </View>
              <AppText variant="heading" align="center" style={styles.completeTitle}>
                Restore is ready
              </AppText>
              <AppText variant="body" color="secondary" align="center" style={styles.completeText}>
                {views.length === 1
                  ? `${views[0]?.name} is validated and ready to restore.`
                  : `${views.length} workplaces are validated and ready to restore.`}
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
          ) : null}
          {ready && skippedItems.length > 0 ? (
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
          {ready && warnings.length > 0 ? (
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
            disabled={!ready}
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
              disabled={!ready || isCompleting}
            >
              {actions.secondary.label}
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
