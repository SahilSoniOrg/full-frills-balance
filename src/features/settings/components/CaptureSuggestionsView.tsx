import {
  AppButton,
  AppCard,
  AppSegmentedControl,
  AppText,
  DisclosureToggle,
  ListGroup,
  ListRow,
  ErrorStateView,
  LoadingView,
  SearchField,
} from '@/src/components/core';
import { SuggestionAmount, SuggestionItemSurface } from './SuggestionItemSurface';
import { SuggestionAccountLabel } from './SuggestionAccountLabel';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { withPrivacyScope, useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
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
import {
  CAPTURE_SUGGESTION_SORT_OPTIONS,
  filterAndSortCaptureSuggestions,
  type CaptureSuggestionSort,
} from '@/src/features/settings/utils/captureSuggestionSort';
import { formatDate } from '@/src/utils/dateFormatting';
import { useMemo, useState, type ReactNode } from 'react';

const PAGE_SIZE = 20;
type SuggestionsTab = 'review' | 'saved';

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

      <LoadingView
        loading={capture.loading && !capture.hasSnapshot}
        variant="inline"
        text={strings.loading}
      />
      {capture.error ? (
        <ErrorStateView
          variant="inline"
          message={capture.hasSnapshot ? strings.refreshError : strings.loadError}
          onRetry={() => void capture.onRetry()}
          retryLabel={strings.retry}
        />
      ) : null}

      {privateMode ? (
        <AppCard variant="secondary" padding="lg">
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
  const [sort, setSort] = useState<CaptureSuggestionSort>('latest');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const filtered = useMemo(
    () => filterAndSortCaptureSuggestions(capture, search, sort),
    [capture, search, sort],
  );
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
    <Stack gap="md">
      {reviewCount === 0 ? (
        <AppCard variant="secondary" padding="lg">
          <Stack gap="sm">
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
          <Stack gap="sm">
            <SearchField
              value={search}
              onChangeText={value => resetView(value, sort)}
              placeholder={strings.matchingSearchPlaceholder}
              testID="capture-suggestions-search"
              clearTestID="capture-suggestions-clear-search"
              clearAccessibilityLabel={strings.clearSearch}
            />
            <Box gap="sm">
              <AppText variant="caption" color="secondary">
                {strings.historicalSortBy}
              </AppText>
              <AppSegmentedControl
                options={CAPTURE_SUGGESTION_SORT_OPTIONS}
                value={sort}
                onChange={value => resetView(search, value)}
                flex
                size="sm"
                testID="capture-suggestions-sort"
              />
            </Box>
          </Stack>

          {visibleTotal === 0 ? (
            <AppCard variant="secondary" padding="lg">
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
                const title =
                  item.merchantName ||
                  item.merchantKey ||
                  item.description ||
                  strings.privateDescription;
                const categoryLabel =
                  item.currentCategoryNames?.join(', ') || strings.defaultedReview;
                const accountLabel = item.financialAccountName ?? strings.unavailableAccount;
                const dateLabel = formatDate(item.journalDate);
                return (
                  <ExpandableReviewRow
                    key={id}
                    id={id}
                    title={title}
                    subtitle={
                      <Inline wrap align="center">
                        <AppText variant="caption" color="secondary" weight="medium">
                          {`${item.description || strings.privateDescription} · ${categoryLabel} · `}
                        </AppText>
                        <SuggestionAccountLabel
                          account={item.financialAccount}
                          name={item.financialAccountName}
                          placeholder={strings.unavailableAccount}
                        />
                        <AppText variant="caption" color="secondary" weight="medium">
                          {` · ${dateLabel}`}
                        </AppText>
                      </Inline>
                    }
                    accessibilityLabel={`${title}, ${item.description || strings.privateDescription} · ${categoryLabel} · ${accountLabel} · ${dateLabel}`}
                    amount={item.totalAmount}
                    currencyCode={item.currencyCode}
                    expanded={expandedRows.has(id)}
                    onToggle={() => toggleRow(id)}
                    detail={<DefaultedDetail capture={capture} item={item} />}
                  />
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
                const title =
                  item.merchantName ||
                  item.merchantKey ||
                  item.description ||
                  strings.privateDescription;
                const categoryLabel = item.suggestedCategoryName ?? strings.reviewAction;
                const accountLabel = item.suggestedDefaultAccountName ?? strings.unavailableAccount;
                const dateLabel = formatDate(item.journalDate);
                return (
                  <ExpandableReviewRow
                    key={id}
                    id={id}
                    title={title}
                    subtitle={
                      <Inline wrap align="center">
                        <AppText variant="caption" color="secondary" weight="medium">
                          {`${categoryLabel} · `}
                        </AppText>
                        <SuggestionAccountLabel
                          account={item.suggestedDefaultAccount}
                          name={item.suggestedDefaultAccountName}
                          placeholder={strings.unavailableAccount}
                        />
                        <AppText variant="caption" color="secondary" weight="medium">
                          {` · ${dateLabel}`}
                        </AppText>
                      </Inline>
                    }
                    accessibilityLabel={`${title}, ${categoryLabel} · ${accountLabel} · ${dateLabel}`}
                    amount={item.totalAmount}
                    currencyCode={item.currencyCode}
                    expanded={expandedRows.has(id)}
                    onToggle={() => toggleRow(id)}
                    detail={<CategoryCandidateDetail capture={capture} item={item} />}
                  />
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
                  <ExpandableReviewRow
                    key={id}
                    id={id}
                    title={item.description || strings.privateDescription}
                    subtitle={`${item.merchantName ?? item.merchantKey ?? strings.unknownMerchant} · ${[scope.currencyCode, scope.amount].filter(value => value != null).join(' ')} · ${scope.kind}`}
                    amount={item.totalAmount}
                    currencyCode={item.currencyCode}
                    expanded={expandedRows.has(id)}
                    onToggle={() => toggleRow(id)}
                    detail={<NameCandidateDetail capture={capture} item={item} />}
                  />
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

function ExpandableReviewRow({
  id,
  title,
  subtitle,
  accessibilityLabel,
  amount,
  currencyCode,
  expanded,
  onToggle,
  detail,
}: {
  id: string;
  title: string;
  subtitle: ReactNode;
  accessibilityLabel?: string;
  amount: number;
  currencyCode: string;
  expanded: boolean;
  onToggle: () => void;
  detail: ReactNode;
}) {
  return (
    <SuggestionItemSurface expanded={expanded}>
      <ListRow
        title={title}
        subtitle={subtitle}
        accessibilityLabel={accessibilityLabel}
        trailing={
          <SuggestionAmount amount={amount} currencyCode={currencyCode} expanded={expanded} />
        }
        onPress={onToggle}
        accessibilityState={{ expanded }}
        chevron={false}
        wrap
        testID={`matching-row-${id}`}
      />
      {expanded ? detail : null}
    </SuggestionItemSurface>
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
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Stack gap="sm">
      <DisclosureToggle
        label={title}
        meta={count}
        expanded={expanded}
        onToggle={onToggle}
        accessibilityLabel={`${title}, ${count}`}
        testID={`matching-group-toggle-${id}`}
      />
      {expanded ? (
        <>
          <AppText variant="caption" color="secondary">
            {description}
          </AppText>
          <Box background="surface" borderRadius="lg" overflow="hidden">
            {children}
          </Box>
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

function CaptureSuggestionsScreen() {
  const capture = useTransactionCaptureViewModel({
    loadReviewItems: true,
    loadCategoryDefaults: true,
    loadHistoricalSuggestions: true,
  });
  return <CaptureSuggestionsView key={capture.workplaceId} capture={capture} />;
}

export default withPrivacyScope(CaptureSuggestionsScreen);
