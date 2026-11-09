import {
  AppButton,
  AppCard,
  AppInput,
  AppSegmentedControl,
  AppText,
  Badge,
  ListGroup,
  ListRow,
} from '@/src/components/core';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Stack, Box } from '@/src/design-system';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { useTransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { Icon } from '@/src/types/domainIcons';
import { AppNavigation } from '@/src/utils/navigation';
import { formatDate } from '@/src/utils/dateUtils';
import { Fragment, useMemo, useState } from 'react';

const PAGE_SIZE = 20;
type HistoricalSuggestionSort = 'latest' | 'alphabetical' | 'repeats';
type HistoricalSuggestionsKind = 'categories' | 'mixed';

const SORT_OPTIONS = [
  { id: 'latest', label: strings.historicalSortLatest },
  { id: 'alphabetical', label: strings.historicalSortAlphabetical },
  { id: 'repeats', label: strings.historicalSortRepeats },
] as const;

function openMatchingJournalEntries(journalIds: string[]) {
  if (journalIds.length === 0) return;
  AppNavigation.toJournalSearch({ journalIds });
}

export function HistoricalCaptureSuggestionsView({
  capture,
  kind,
}: {
  capture: TransactionCaptureViewModel;
  kind: HistoricalSuggestionsKind;
}) {
  const privateMode = useEffectivePrivacyMode();
  const title =
    kind === 'categories' ? strings.historicalCategoryHeader : strings.historicalMixedHeader;
  const sourcePatterns =
    kind === 'categories'
      ? capture.historicalCategorySuggestions
      : capture.mixedHistoricalCategoryPatterns;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HistoricalSuggestionSort>('latest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const patterns = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = sourcePatterns.filter(pattern => {
      if (!query) return true;
      return [
        pattern.merchant,
        pattern.financialAccountName,
        pattern.currencyCode,
        pattern.kind,
        ...pattern.categories.map(category => category.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    return filtered.sort((left, right) => {
      if (sort === 'alphabetical') {
        return (
          left.merchant.localeCompare(right.merchant) ||
          right.latestJournalDate - left.latestJournalDate ||
          right.journalCount - left.journalCount
        );
      }
      if (sort === 'repeats') {
        return (
          right.journalCount - left.journalCount ||
          right.latestJournalDate - left.latestJournalDate ||
          left.merchant.localeCompare(right.merchant)
        );
      }
      return (
        right.latestJournalDate - left.latestJournalDate ||
        right.journalCount - left.journalCount ||
        left.merchant.localeCompare(right.merchant)
      );
    });
  }, [search, sort, sourcePatterns]);

  return (
    <SettingsLayout title={title}>
      <Stack space="lg">
        {capture.loading && !capture.hasSnapshot ? (
          <AppText color="secondary">{strings.loading}</AppText>
        ) : null}
        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">
              {capture.hasSnapshot ? strings.refreshError : strings.loadError}
            </AppText>
            <AppButton variant="secondary" onPress={() => void capture.onRetry()}>
              {strings.retry}
            </AppButton>
          </Stack>
        ) : null}

        {privateMode ? (
          <AppCard variant="secondary" paddingSize="md">
            <AppText variant="bodySmall" color="secondary">
              {strings.suggestionsHiddenInPrivateMode}
            </AppText>
          </AppCard>
        ) : capture.hasSnapshot ? (
          <>
            {sourcePatterns.length > 0 ? (
              <Stack space="sm">
                <AppInput
                  value={search}
                  onChangeText={value => {
                    setSearch(value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  placeholder={strings.historicalSearchPlaceholder}
                  leftIcon={Icon.Search}
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel={strings.historicalSearchPlaceholder}
                  testID={`${kind}-historical-suggestions-search`}
                />
                <Box gap="sm">
                  <AppText variant="caption" color="secondary">
                    {strings.historicalSortBy}
                  </AppText>
                  <AppSegmentedControl
                    options={SORT_OPTIONS}
                    value={sort}
                    onChange={value => {
                      setSort(value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    flex
                    size="sm"
                    testID={`${kind}-historical-suggestions-sort`}
                  />
                </Box>
              </Stack>
            ) : null}

            {patterns.length === 0 ? (
              <AppCard variant="secondary" paddingSize="md">
                <AppText variant="bodySmall" color="secondary">
                  {search.trim() ? strings.historicalSearchNoResults : strings.historicalPageEmpty}
                </AppText>
              </AppCard>
            ) : (
              <ListGroup variant="card" header={title} dividerInset={Spacing.lg}>
                <ListRow
                  title={
                    kind === 'categories'
                      ? strings.historicalCategoryHint
                      : strings.historicalMixedHint(patterns.length)
                  }
                  tone="utility"
                  wrap
                />
                {patterns.slice(0, visibleCount).map(pattern => (
                  <HistoricalSuggestionRow key={pattern.key} capture={capture} pattern={pattern} />
                ))}
                {patterns.length > visibleCount ? (
                  <AppButton
                    variant="ghost"
                    onPress={() => setVisibleCount(count => count + PAGE_SIZE)}
                  >
                    {strings.showMore}
                  </AppButton>
                ) : null}
              </ListGroup>
            )}
          </>
        ) : null}
      </Stack>
    </SettingsLayout>
  );
}

function HistoricalSuggestionRow({
  capture,
  pattern,
}: {
  capture: TransactionCaptureViewModel;
  pattern: HistoricalCategoryPattern;
}) {
  const category = pattern.categories.length === 1 ? pattern.categories[0] : undefined;

  return (
    <Fragment>
      <ListRow
        title={pattern.merchant}
        subtitle={`${strings.historicalOpenEntries} · ${strings.historicalCategoryDetails(
          pattern.journalCount,
          pattern.sourceCount,
          pattern.financialAccountName,
          pattern.currencyCode,
          pattern.kind,
        )} · ${strings.historicalLatestEntry(formatDate(pattern.latestJournalDate))}`}
        trailing={
          category ? (
            <Badge variant="default" size="sm">
              {category.name}
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              {strings.historicalMixedBadge}
            </Badge>
          )
        }
        chevron
        onPress={() => openMatchingJournalEntries(pattern.journalIds)}
        wrap
      />
      {category ? (
        <Box flexDirection="row" gap="sm" paddingHorizontal="md" paddingVertical="sm">
          <AppButton
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            buttonStyle={{ minHeight: 48 }}
            accessibilityLabel={strings.historicalCategoryAction(category.name)}
            disabled={capture.busy || capture.loading}
            onPress={() => capture.onRememberHistoricalCategory(pattern)}
          >
            {strings.historicalCategoryCompactAction}
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            buttonStyle={{ minHeight: 48 }}
            accessibilityLabel={strings.keepMerchantOpen}
            disabled={capture.busy || capture.loading}
            onPress={() => void capture.onSetHistoricalMerchantsOpen(pattern, true)}
          >
            {strings.historicalKeepReviewAction}
          </AppButton>
        </Box>
      ) : (
        <>
          <ListRow
            title={strings.historicalCategoryBreakdown}
            subtitle={pattern.categories
              .map(value => `${value.name} (${value.journalCount})`)
              .join(' · ')}
            tone="utility"
            wrap
          />
          <Box
            flexDirection="row"
            paddingHorizontal="md"
            paddingVertical="sm"
            justifyContent="flex-start"
          >
            <AppButton
              variant="outline"
              size="sm"
              buttonStyle={{ minHeight: 48 }}
              accessibilityLabel={strings.keepMerchantOpen}
              disabled={capture.busy || capture.loading}
              onPress={() => void capture.onSetHistoricalMerchantsOpen(pattern, true)}
            >
              {strings.historicalKeepReviewAction}
            </AppButton>
          </Box>
        </>
      )}
    </Fragment>
  );
}

function SmsHistorySuggestionsScreen() {
  const capture = useTransactionCaptureViewModel({
    loadReviewItems: true,
    loadHistoricalSuggestions: true,
  });
  return (
    <HistoricalCaptureSuggestionsView
      key={capture.workplaceId}
      capture={capture}
      kind="categories"
    />
  );
}

function MixedHistorySuggestionsScreen() {
  const capture = useTransactionCaptureViewModel({
    loadReviewItems: true,
    loadHistoricalSuggestions: true,
  });
  return (
    <HistoricalCaptureSuggestionsView key={capture.workplaceId} capture={capture} kind="mixed" />
  );
}

export const CaptureHistorySuggestionsScreen = withPrivacyScope(SmsHistorySuggestionsScreen);
export const CaptureMixedSuggestionsScreen = withPrivacyScope(MixedHistorySuggestionsScreen);
