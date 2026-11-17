import {
  AppButton,
  AppCard,
  AppSegmentedControl,
  Badge,
  AppText,
  AppIcon,
  PressScaleTouchable,
  ListGroup,
  ListRow,
} from '@/src/components/core';
import { CaptureSearchField } from './CaptureSearchField';
import { SuggestionAmount, SuggestionItemSurface } from './SuggestionItemSurface';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { withPrivacyScope, useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { useTransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import {
  CategoryCandidateDetail,
  DefaultedDetail,
  descriptionScope,
  HistoricalPatternRow,
  NameCandidateDetail,
} from '@/src/features/settings/components/CaptureSuggestionDetails';
import {
  countUnrepresentedPausedMerchants,
  SavedCaptureDefaults,
} from '@/src/features/settings/components/SavedCaptureDefaults';
import type { CaptureReviewItem } from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { Icon } from '@/src/types/domainIcons';
import { formatDate } from '@/src/utils/dateFormatting';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 20;
type SuggestionsTab = 'review' | 'saved';
type SuggestionSort = 'latest' | 'alphabetical' | 'repeats';

const SORT_OPTIONS = [
  { id: 'latest', label: strings.historicalSortLatest },
  { id: 'alphabetical', label: strings.historicalSortAlphabetical },
  { id: 'repeats', label: strings.historicalSortRepeats },
] as const;

interface CaptureSuggestionsViewProps {
  capture: TransactionCaptureViewModel;
}

export function CaptureSuggestionsView({ capture }: CaptureSuggestionsViewProps) {
  const [tab, setTab] = useState<SuggestionsTab>('review');
  const privateMode = useEffectivePrivacyMode();
  const reviewCount =
    capture.defaulted.length +
    capture.categoryCandidates.length +
    capture.historicalCategorySuggestions.length +
    capture.mixedHistoricalCategoryPatterns.length +
    capture.descriptionCandidates.length;
  const savedCount =
    capture.categoryDefaults.length +
    capture.descriptionDefaults.length +
    countUnrepresentedPausedMerchants(capture).length;

  return (
    <SettingsLayout title={strings.suggestionsTitle}>
      <Stack space="lg">
        <AppSegmentedControl
          options={[
            {
              id: 'review',
              label: strings.suggestionsReviewTab(
                capture.hasSnapshot && !privateMode ? reviewCount : undefined,
              ),
            },
            {
              id: 'saved',
              label: strings.suggestionsSavedTab(
                capture.hasSnapshot && !privateMode ? savedCount : undefined,
              ),
            },
          ]}
          value={tab}
          onChange={setTab}
          flex
          testID="capture-suggestions-tabs"
        />
        <AppText variant="bodySmall" color="secondary">
          {tab === 'review'
            ? strings.suggestionsReviewCardDescription
            : strings.suggestionsSavedCardDescription}
        </AppText>
        {capture.busy ? (
          <AppText variant="bodySmall" color="secondary" accessibilityRole="alert">
            {strings.matchingMutationBusy}
          </AppText>
        ) : null}

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
          tab === 'review' ? (
            <ReviewSuggestions capture={capture} reviewCount={reviewCount} />
          ) : (
            <SavedCaptureDefaults capture={capture} savedCount={savedCount} />
          )
        ) : null}
      </Stack>
    </SettingsLayout>
  );
}

function ReviewSuggestions({
  capture,
  reviewCount,
}: {
  capture: TransactionCaptureViewModel;
  reviewCount: number;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SuggestionSort>('latest');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const filtered = useMemo(() => filterAndSort(capture, search, sort), [capture, search, sort]);
  const visibleTotal = Object.values(filtered).reduce((total, rows) => total + rows.length, 0);

  const toggleRow = (id: string) => {
    setExpandedRows(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetView = (nextSearch = search, nextSort = sort) => {
    setVisibleCounts({});
    setExpandedRows(new Set());
    setSearch(nextSearch);
    setSort(nextSort);
  };

  return (
    <Stack space="md">
      {reviewCount === 0 ? (
        <AppCard variant="secondary" paddingSize="md">
          <Stack space="sm">
            <AppText variant="body" weight="semibold">
              {strings.suggestionsEmptyTitle}
            </AppText>
            <AppText variant="bodySmall" color="secondary">
              {strings.suggestionsEmptyDescription}
            </AppText>
          </Stack>
        </AppCard>
      ) : (
        <>
          <Stack space="sm">
            <CaptureSearchField
              value={search}
              onChangeText={value => resetView(value, sort)}
              placeholder={strings.matchingSearchPlaceholder}
              accessibilityLabel={strings.matchingSearchPlaceholder}
              testID="capture-suggestions-search"
              clearTestID="capture-suggestions-clear-search"
              clearAccessibilityLabel={strings.clearSearch}
            />
            <Box gap="sm">
              <AppText variant="caption" color="secondary">
                {strings.historicalSortBy}
              </AppText>
              <AppSegmentedControl
                options={SORT_OPTIONS}
                value={sort}
                onChange={value => resetView(search, value)}
                flex
                size="sm"
                testID="capture-suggestions-sort"
              />
            </Box>
          </Stack>

          {visibleTotal === 0 ? (
            <AppCard variant="secondary" paddingSize="md">
              <AppText variant="bodySmall" color="secondary">
                {strings.matchingSearchNoResults}
              </AppText>
            </AppCard>
          ) : null}

          <SuggestionGroup
            id="defaulted"
            title={strings.defaultedHeader}
            count={filtered.defaulted.length}
            description={strings.defaultedGroupDescription}
            expanded={expandedGroups.defaulted ?? true}
            onToggle={() =>
              setExpandedGroups(current => ({
                ...current,
                defaulted: !(current.defaulted ?? true),
              }))
            }
          >
            <ListGroup variant="plain" testID="matching-group-defaulted">
              {filtered.defaulted.slice(0, visibleCounts.defaulted ?? PAGE_SIZE).map(item => {
                const id = `defaulted:${item.journalId}`;
                return (
                  <SuggestionItemSurface key={id} expanded={expandedRows.has(id)}>
                    <ListRow
                      title={
                        item.merchantName ||
                        item.merchantKey ||
                        item.description ||
                        strings.privateDescription
                      }
                      subtitle={`${item.description || strings.privateDescription} · ${item.currentCategoryNames?.join(', ') || strings.defaultedReview} · ${item.financialAccountName ?? strings.unavailableAccount} · ${formatDate(item.journalDate)}`}
                      trailing={
                        <SuggestionAmount
                          amount={item.totalAmount}
                          currencyCode={item.currencyCode}
                          expanded={expandedRows.has(id)}
                        />
                      }
                      onPress={() => toggleRow(id)}
                      accessibilityState={{ expanded: expandedRows.has(id) }}
                      chevron={false}
                      wrap
                      testID={`matching-row-${id}`}
                    />
                    {expandedRows.has(id) ? (
                      <DefaultedDetail capture={capture} item={item} />
                    ) : null}
                  </SuggestionItemSurface>
                );
              })}
              <ShowMore
                rows={filtered.defaulted}
                visible={visibleCounts.defaulted ?? PAGE_SIZE}
                onPress={() =>
                  setVisibleCounts(current => ({
                    ...current,
                    defaulted: (current.defaulted ?? PAGE_SIZE) + PAGE_SIZE,
                  }))
                }
              />
            </ListGroup>
          </SuggestionGroup>

          <SuggestionGroup
            id="category"
            title={strings.categoryCandidatesHeader}
            count={filtered.category.length}
            description={strings.categoryCandidatesGroupDescription}
            expanded={expandedGroups.category ?? true}
            onToggle={() =>
              setExpandedGroups(current => ({ ...current, category: !(current.category ?? true) }))
            }
          >
            <ListGroup variant="plain" testID="matching-group-category">
              {filtered.category.slice(0, visibleCounts.category ?? PAGE_SIZE).map(item => {
                const id = `category:${item.journalId}`;
                return (
                  <SuggestionItemSurface key={id} expanded={expandedRows.has(id)}>
                    <ListRow
                      title={
                        item.merchantName ||
                        item.merchantKey ||
                        item.description ||
                        strings.privateDescription
                      }
                      subtitle={`${item.suggestedCategoryName ?? strings.reviewAction} · ${item.suggestedDefaultAccountName ?? strings.unavailableAccount} · ${formatDate(item.journalDate)}`}
                      trailing={
                        <SuggestionAmount
                          amount={item.totalAmount}
                          currencyCode={item.currencyCode}
                          expanded={expandedRows.has(id)}
                        />
                      }
                      onPress={() => toggleRow(id)}
                      accessibilityState={{ expanded: expandedRows.has(id) }}
                      chevron={false}
                      wrap
                      testID={`matching-row-${id}`}
                    />
                    {expandedRows.has(id) ? (
                      <CategoryCandidateDetail capture={capture} item={item} />
                    ) : null}
                  </SuggestionItemSurface>
                );
              })}
              <ShowMore
                rows={filtered.category}
                visible={visibleCounts.category ?? PAGE_SIZE}
                onPress={() =>
                  setVisibleCounts(current => ({
                    ...current,
                    category: (current.category ?? PAGE_SIZE) + PAGE_SIZE,
                  }))
                }
              />
            </ListGroup>
          </SuggestionGroup>

          <SuggestionGroup
            id="historical"
            title={strings.historicalCategoryHeader}
            count={filtered.historical.length}
            description={strings.historicalCategoryGroupDescription}
            expanded={expandedGroups.historical ?? true}
            onToggle={() =>
              setExpandedGroups(current => ({
                ...current,
                historical: !(current.historical ?? true),
              }))
            }
          >
            <ListGroup variant="plain" testID="matching-group-historical">
              {filtered.historical.slice(0, visibleCounts.historical ?? PAGE_SIZE).map(pattern => (
                <HistoricalPatternRow
                  key={`historical:${pattern.key}`}
                  capture={capture}
                  pattern={pattern}
                  expanded={expandedRows.has(`historical:${pattern.key}`)}
                  onToggle={() => toggleRow(`historical:${pattern.key}`)}
                />
              ))}
              <ShowMore
                rows={filtered.historical}
                visible={visibleCounts.historical ?? PAGE_SIZE}
                onPress={() =>
                  setVisibleCounts(current => ({
                    ...current,
                    historical: (current.historical ?? PAGE_SIZE) + PAGE_SIZE,
                  }))
                }
              />
            </ListGroup>
          </SuggestionGroup>

          <SuggestionGroup
            id="mixed"
            title={strings.historicalMixedHeader}
            count={filtered.mixed.length}
            description={strings.historicalMixedGroupDescription}
            expanded={expandedGroups.mixed ?? true}
            onToggle={() =>
              setExpandedGroups(current => ({ ...current, mixed: !(current.mixed ?? true) }))
            }
          >
            <ListGroup variant="plain" testID="matching-group-mixed">
              {filtered.mixed.slice(0, visibleCounts.mixed ?? PAGE_SIZE).map(pattern => (
                <HistoricalPatternRow
                  key={`mixed:${pattern.key}`}
                  capture={capture}
                  pattern={pattern}
                  mixed
                  expanded={expandedRows.has(`mixed:${pattern.key}`)}
                  onToggle={() => toggleRow(`mixed:${pattern.key}`)}
                />
              ))}
              <ShowMore
                rows={filtered.mixed}
                visible={visibleCounts.mixed ?? PAGE_SIZE}
                onPress={() =>
                  setVisibleCounts(current => ({
                    ...current,
                    mixed: (current.mixed ?? PAGE_SIZE) + PAGE_SIZE,
                  }))
                }
              />
            </ListGroup>
          </SuggestionGroup>

          <SuggestionGroup
            id="names"
            title={strings.descriptionCandidatesHeader}
            count={filtered.names.length}
            description={strings.descriptionCandidatesGroupDescription}
            expanded={expandedGroups.names ?? true}
            onToggle={() =>
              setExpandedGroups(current => ({ ...current, names: !(current.names ?? true) }))
            }
          >
            <ListGroup variant="plain" testID="matching-group-names">
              {filtered.names.slice(0, visibleCounts.names ?? PAGE_SIZE).map(item => {
                const id = `name:${item.journalId}`;
                const scope = descriptionScope(item);
                return (
                  <SuggestionItemSurface key={id} expanded={expandedRows.has(id)}>
                    <ListRow
                      title={item.description || strings.privateDescription}
                      subtitle={`${item.merchantName ?? item.merchantKey ?? strings.unknownMerchant} · ${[scope.currencyCode, scope.amount].filter(value => value != null).join(' ')} · ${scope.kind}`}
                      trailing={
                        <SuggestionAmount
                          amount={item.totalAmount}
                          currencyCode={item.currencyCode}
                          expanded={expandedRows.has(id)}
                        />
                      }
                      onPress={() => toggleRow(id)}
                      accessibilityState={{ expanded: expandedRows.has(id) }}
                      chevron={false}
                      wrap
                      testID={`matching-row-${id}`}
                    />
                    {expandedRows.has(id) ? (
                      <NameCandidateDetail capture={capture} item={item} />
                    ) : null}
                  </SuggestionItemSurface>
                );
              })}
              <ShowMore
                rows={filtered.names}
                visible={visibleCounts.names ?? PAGE_SIZE}
                onPress={() =>
                  setVisibleCounts(current => ({
                    ...current,
                    names: (current.names ?? PAGE_SIZE) + PAGE_SIZE,
                  }))
                }
              />
            </ListGroup>
          </SuggestionGroup>
        </>
      )}
    </Stack>
  );
}

function SuggestionGroup({
  id,
  title,
  count,
  description,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  if (count === 0) return null;
  return (
    <Stack space="sm">
      <PressScaleTouchable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${count}`}
        accessibilityState={{ expanded }}
        testID={`matching-group-toggle-${id}`}
        style={styles.groupHeader}
        pressScale="subtle"
      >
        <View style={styles.groupTitleRow}>
          <AppText variant="body" weight="semibold" style={styles.groupTitle}>
            {title}
          </AppText>
          <Badge variant="primary" size="sm">
            {count}
          </Badge>
        </View>
        <AppIcon
          name={expanded ? Icon.ChevronDown : Icon.ChevronRight}
          size={16}
          color={theme.textSecondary}
        />
      </PressScaleTouchable>
      {expanded ? (
        <>
          <AppText variant="caption" color="secondary" style={styles.groupDescription}>
            {description}
          </AppText>
          <View style={[styles.groupCard, { backgroundColor: theme.surface }]}>{children}</View>
        </>
      ) : null}
    </Stack>
  );
}

function ShowMore<T>({
  rows,
  visible,
  onPress,
}: {
  rows: readonly T[];
  visible: number;
  onPress: () => void;
}) {
  return rows.length > visible ? (
    <AppButton variant="ghost" onPress={onPress}>
      {strings.showMore}
    </AppButton>
  ) : null;
}

function filterAndSort(capture: TransactionCaptureViewModel, search: string, sort: SuggestionSort) {
  const query = search.trim().toLocaleLowerCase();
  const includes = (fields: (string | number | undefined)[]) =>
    !query ||
    fields
      .filter(value => value != null)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  const reviewItems = (
    values: CaptureReviewItem[],
    fields: (item: CaptureReviewItem) => (string | number | undefined)[],
    title: (item: CaptureReviewItem) => string = item => item.merchantKey || item.description || '',
  ) =>
    values
      .filter(item => includes(fields(item)))
      .sort((left, right) => sortReviewRows(left, right, sort, title));
  const historical = (values: HistoricalCategoryPattern[]) =>
    values
      .filter(pattern =>
        includes([
          pattern.merchant,
          pattern.financialAccountName,
          pattern.currencyCode,
          pattern.kind,
          ...pattern.categories.map(category => category.name),
        ]),
      )
      .sort((left, right) => sortHistoricalRows(left, right, sort));

  return {
    defaulted: reviewItems(
      capture.defaulted,
      item => [
        item.merchantKey,
        item.description,
        item.currencyCode,
        item.financialAccountName,
        item.totalAmount,
        ...(item.currentCategoryNames ?? []),
      ],
      item => item.merchantKey || item.description || '',
    ),
    category: reviewItems(
      capture.categoryCandidates,
      item => [
        item.merchantKey,
        item.description,
        item.suggestedCategoryName,
        item.suggestedDefaultAccountName,
        item.currencyCode,
        item.suggestedDefault?.kind,
        item.totalAmount,
      ],
      item => item.merchantKey || item.description || '',
    ),
    historical: historical(capture.historicalCategorySuggestions),
    mixed: historical(capture.mixedHistoricalCategoryPatterns),
    names: reviewItems(
      capture.descriptionCandidates,
      item => {
        const scope = descriptionScope(item);
        return [item.description, item.merchantKey, scope.amount, scope.currencyCode, scope.kind];
      },
      item => item.description || item.merchantKey || '',
    ),
  };
}

function sortReviewRows(
  left: CaptureReviewItem,
  right: CaptureReviewItem,
  sort: SuggestionSort,
  title: (item: CaptureReviewItem) => string,
) {
  const nameOrder = title(left).localeCompare(title(right));
  if (sort === 'alphabetical')
    return (
      nameOrder ||
      right.journalDate - left.journalDate ||
      left.journalId.localeCompare(right.journalId)
    );
  return (
    right.journalDate - left.journalDate ||
    nameOrder ||
    left.journalId.localeCompare(right.journalId)
  );
}

function sortHistoricalRows(
  left: HistoricalCategoryPattern,
  right: HistoricalCategoryPattern,
  sort: SuggestionSort,
) {
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
}

function CaptureSuggestionsScreen() {
  const capture = useTransactionCaptureViewModel({
    loadReviewItems: true,
    loadCategoryDefaults: true,
    loadHistoricalSuggestions: true,
  });
  return <CaptureSuggestionsView key={capture.workplaceId} capture={capture} />;
}

export default withPrivacyScope(CaptureSuggestionsScreen);

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  groupTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  groupTitle: { flexShrink: 1 },
  groupDescription: { paddingHorizontal: 4 },
  groupCard: { borderRadius: 16, overflow: 'hidden' },
});
