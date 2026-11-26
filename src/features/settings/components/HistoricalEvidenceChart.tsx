import { AppButton, AppText } from '@/src/components/core';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { BorderWidth, Shape, Size, Spacing, type Theme } from '@/src/constants/design-tokens';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { blendColors, isValidHexColor } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import {
  listHistoricalPatternEvidenceWindow,
  type HistoricalCategoryPattern,
  type HistoricalEvidenceEntry,
} from '@/src/services/transaction-intelligence/captureReviewService';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { formatDate } from '@/src/utils/dateFormatting';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ViewToken } from 'react-native';

const DAYS_PER_PAGE = 30;
const MS_PER_DAY = 86_400_000;
const CHART_HEIGHT = 72;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

function calendarDayNumber(date: Dayjs) {
  return Date.UTC(date.year(), date.month(), date.date()) / MS_PER_DAY;
}

function pageWindow(timelineEndMs: number, page: number) {
  const end = dayjs(timelineEndMs)
    .startOf('day')
    .subtract(page * DAYS_PER_PAGE, 'day')
    .add(1, 'day');
  const start = end.subtract(DAYS_PER_PAGE, 'day');
  return { start, end };
}

function pageOverlapsActivity(
  timelineEndMs: number,
  page: number,
  earliest: Dayjs,
  lastEntry: Dayjs,
) {
  const { start, end } = pageWindow(timelineEndMs, page);
  return earliest.valueOf() < end.valueOf() && lastEntry.valueOf() >= start.valueOf();
}

type Props = {
  workplaceId: WorkplaceId;
  pattern: HistoricalCategoryPattern;
  revision: number;
  selectedCategoryId: AccountId | null;
  selectedDayMs: number | null;
  onSelectDay: (dayMs: number | null, entries: HistoricalEvidenceEntry[]) => void;
};

/** Stable muted series color for a category (legend + chart). Mint stays out of the series. */
export function historicalCategoryColor(
  pattern: HistoricalCategoryPattern,
  accountId: string,
  theme: Theme,
) {
  const index = pattern.categories.findIndex(category => category.accountId === accountId);
  const category = pattern.categories[index];
  if (category?.color && isValidHexColor(category.color)) return category.color;
  const series =
    pattern.kind === 'income'
      ? [
          theme.income,
          theme.asset,
          theme.equity,
          theme.transfer,
          theme.warning,
          blendColors(theme.income, theme.surfaceSecondary, 0.35),
        ]
      : [
          theme.expense,
          theme.warning,
          theme.asset,
          theme.equity,
          theme.transfer,
          blendColors(theme.expense, theme.surfaceSecondary, 0.35),
        ];
  return series[Math.max(0, index) % series.length];
}

/** Chart fill: same hue as the legend, softened so bars don't overpower actions. */
export function historicalCategoryChartFill(
  pattern: HistoricalCategoryPattern,
  accountId: string,
  theme: Theme,
  emphasized: boolean,
) {
  const ink = historicalCategoryColor(pattern, accountId, theme);
  if (emphasized) return ink;
  return blendColors(ink, theme.surfaceSecondary, 0.55);
}

export function historicalCategoryMarkerShape(index: number): 'circle' | 'square' | 'diamond' {
  const shapes = ['circle', 'square', 'diamond'] as const;
  return shapes[((index % shapes.length) + shapes.length) % shapes.length];
}

export function HistoricalEvidenceChart({
  workplaceId,
  pattern,
  revision,
  selectedCategoryId,
  selectedDayMs,
  onSelectDay,
}: Props) {
  const { theme } = useTheme();
  const listRef = useRef<FlatList<number>>(null);
  const [width, setWidth] = useState(0);
  const today = dayjs().startOf('day');
  const lastEntry = dayjs(pattern.latestJournalDate).startOf('day');
  // Right edge is today so the first page always starts from now; keep future-dated entries visible.
  const latest = lastEntry.isAfter(today) ? lastEntry : today;
  const earliest = dayjs(pattern.earliestJournalDate ?? pattern.latestJournalDate).startOf('day');
  const calendarDaySpan = Math.max(0, calendarDayNumber(latest) - calendarDayNumber(earliest));
  const pageCount = Math.max(1, Math.floor(calendarDaySpan / DAYS_PER_PAGE) + 1);
  const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index), [pageCount]);
  const timelineEndMs = latest.valueOf();
  const pagesWithActivity = useMemo(
    () => pages.filter(page => pageOverlapsActivity(timelineEndMs, page, earliest, lastEntry)),
    [pages, timelineEndMs, earliest, lastEntry],
  );
  const timelineIdentity = `${pattern.key}:${timelineEndMs}:${pageCount}`;
  const timelineIdentityRef = useRef(timelineIdentity);
  useEffect(() => {
    timelineIdentityRef.current = timelineIdentity;
  }, [timelineIdentity]);
  const [pageState, setPageState] = useState<{ identity: string; page: number }>({
    identity: timelineIdentity,
    page: 0,
  });
  const page = pageState.identity === timelineIdentity ? pageState.page : 0;
  const activeHasActivity = pageOverlapsActivity(timelineEndMs, page, earliest, lastEntry);
  // inverted FlatList breaks contentOffset→page math; track the visible item instead.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const index = viewableItems.find(token => token.isViewable && token.index != null)?.index;
      if (index == null) return;
      setPageState({ identity: timelineIdentityRef.current, page: index });
    },
    [],
  );
  const goToPage = (targetPage: number) => {
    if (width <= 0) return;
    // pageState updates from onViewableItemsChanged once the page is actually visible.
    listRef.current?.scrollToIndex({ index: targetPage, animated: true });
  };
  const onScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    listRef.current?.scrollToOffset({ offset: width * info.index, animated: false });
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: true });
    });
  };
  const timelineAccessibilitySummary = `Daily amount in ${pattern.currencyCode}. Timeline page ${page + 1} of ${pageCount}.${
    pagesWithActivity.length
      ? ` Activity on ${pagesWithActivity.length} ${pagesWithActivity.length === 1 ? 'page' : 'pages'}.`
      : ''
  }`;
  return (
    <View
      testID="historical-evidence-chart"
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.chartHeader}>
        <AppText
          variant="caption"
          color="secondary"
          accessibilityLabel={pageCount > 1 ? timelineAccessibilitySummary : undefined}
        >
          Daily amount · {pattern.currencyCode}
        </AppText>
        {pageCount > 1 ? (
          <View style={styles.dots}>
            {pages.map(dotPage => {
              const active = dotPage === page;
              const hasActivity = pagesWithActivity.includes(dotPage);
              return (
                <Pressable
                  key={dotPage}
                  onPress={() => goToPage(dotPage)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={
                    hasActivity
                      ? `Go to timeline page ${dotPage + 1}, has activity`
                      : `Go to timeline page ${dotPage + 1}, no activity`
                  }
                  hitSlop={{ left: Spacing.sm, right: Spacing.sm }}
                  style={styles.dotHit}
                >
                  <View
                    style={[
                      styles.dot,
                      hasActivity ? styles.dotWithActivity : styles.dotEmpty,
                      active ? styles.dotCurrent : null,
                      {
                        backgroundColor: active
                          ? theme.primary
                          : hasActivity
                            ? theme.primary
                            : theme.border,
                        opacity: active ? 1 : hasActivity ? 0.45 : 0.35,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {!activeHasActivity && pagesWithActivity.length > 0 ? (
        <AppText variant="caption" color="primary" style={styles.swipeHint}>
          {strings.historicalSwipeEarlierActivity}
        </AppText>
      ) : null}
      {width > 0 ? (
        <FlatList
          key={timelineIdentity}
          ref={listRef}
          horizontal
          inverted
          pagingEnabled
          nestedScrollEnabled
          data={pages}
          extraData={`${selectedCategoryId ?? 'all'}:${selectedDayMs ?? 'none'}:${page}`}
          keyExtractor={item => String(item)}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          onScrollToIndexFailed={onScrollToIndexFailed}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item }) => (
            <ChartPage
              workplaceId={workplaceId}
              pattern={pattern}
              revision={revision}
              selectedCategoryId={selectedCategoryId}
              selectedDayMs={selectedDayMs}
              onSelectDay={onSelectDay}
              page={item}
              width={width}
              timelineEndMs={timelineEndMs}
              showEarlierHint={!pageOverlapsActivity(timelineEndMs, item, earliest, lastEntry)}
            />
          )}
        />
      ) : null}
    </View>
  );
}

function ChartPage({
  workplaceId,
  pattern,
  revision,
  page,
  width,
  selectedCategoryId,
  selectedDayMs,
  onSelectDay,
  timelineEndMs,
  showEarlierHint,
}: Props & { page: number; width: number; timelineEndMs: number; showEarlierHint: boolean }) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const { start, end } = pageWindow(timelineEndMs, page);
  const [retry, setRetry] = useState(0);
  const startMs = start.valueOf();
  const endMs = end.valueOf();
  const requestKey = `${workplaceId}:${revision}:${startMs}:${endMs}:${retry}`;
  const [loaded, setLoaded] = useState<{
    requestKey: string;
    pattern: HistoricalCategoryPattern;
    entries: HistoricalEvidenceEntry[];
    status: 'ready' | 'error';
  } | null>(null);
  const current = loaded?.requestKey === requestKey && loaded.pattern === pattern ? loaded : null;
  const entries = current?.entries ?? [];
  const state = current?.status ?? 'loading';
  useEffect(() => {
    let active = true;
    void listHistoricalPatternEvidenceWindow(workplaceId, pattern, startMs, endMs)
      .then(result => {
        if (active) setLoaded({ requestKey, pattern, entries: result, status: 'ready' });
      })
      .catch(() => {
        if (active) setLoaded({ requestKey, pattern, entries: [], status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [workplaceId, pattern, revision, startMs, endMs, retry, requestKey]);
  const categoryOrder = useMemo(
    () =>
      new Map<string, number>(
        pattern.categories.map((category, index) => [category.accountId, index]),
      ),
    [pattern.categories],
  );
  const days = Array.from({ length: DAYS_PER_PAGE }, (_, index) => {
    const date = start.add(index, 'day');
    const next = date.add(1, 'day');
    const dayEntries = entries.filter(
      entry => entry.journalDate >= date.valueOf() && entry.journalDate < next.valueOf(),
    );
    const amounts = new Map<string, number>();
    for (const entry of dayEntries) {
      const id = entry.categoryAccount?.id ?? pattern.categoryByJournalId[entry.journalId];
      if (!id) continue;
      amounts.set(id, (amounts.get(id) ?? 0) + Math.abs(entry.totalAmount));
    }
    const total = [...amounts.values()].reduce((sum, value) => sum + value, 0);
    const filteredTotal = selectedCategoryId ? (amounts.get(selectedCategoryId) ?? 0) : total;
    return { date, amounts, total, filteredTotal, dayEntries };
  });
  // When filtering, scale to the selected category so bar heights match “Largest day”.
  const scale = Math.max(0, ...days.map(day => day.filteredTotal));
  const largest = Math.max(0, ...days.map(day => day.filteredTotal));
  const description = days
    .filter(day => day.filteredTotal > 0)
    .map(
      day =>
        `${formatDate(day.date.valueOf())}: ${[...day.amounts]
          .filter(([id]) => !selectedCategoryId || selectedCategoryId === id)
          .map(
            ([id, amount]) =>
              `${pattern.categories.find(category => category.accountId === id)?.name ?? 'Category'}, ${formatMoney(amount, pattern.currencyCode)}`,
          )
          .join(', ')}`,
    )
    .join('; ');
  const selectDay = (dayMs: number, dayEntries: HistoricalEvidenceEntry[]) => {
    const visible = selectedCategoryId
      ? dayEntries.filter(entry => {
          const id = entry.categoryAccount?.id ?? pattern.categoryByJournalId[entry.journalId];
          return id === selectedCategoryId;
        })
      : dayEntries;
    if (selectedDayMs === dayMs) {
      onSelectDay(null, []);
      return;
    }
    onSelectDay(dayMs, visible);
  };
  return (
    <View style={{ width }}>
      {state === 'loading' ? (
        <View style={styles.message}>
          <AppText variant="caption" color="secondary">
            Loading timeline…
          </AppText>
        </View>
      ) : null}
      {state === 'error' ? (
        <View style={styles.message}>
          <AppText variant="caption" color="error">
            Could not load timeline.
          </AppText>
          <AppButton size="sm" variant="ghost" onPress={() => setRetry(value => value + 1)}>
            Retry
          </AppButton>
        </View>
      ) : null}
      {state === 'ready' ? (
        <View>
          <View
            accessibilityLabel={`${formatDate(startMs)} to ${formatDate(end.subtract(1, 'day').valueOf())}. ${description || 'No entries in this period.'}`}
            style={[
              styles.chart,
              { borderBottomColor: theme.border, borderBottomWidth: BorderWidth.thin },
            ]}
          >
            {days.map(day => {
              const dayMs = day.date.valueOf();
              const selected = selectedDayMs === dayMs;
              const visibleAmounts = [...day.amounts]
                .filter(([id]) => !selectedCategoryId || selectedCategoryId === id)
                .sort((a, b) => {
                  const orderA = categoryOrder.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
                  const orderB = categoryOrder.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
                  return orderA !== orderB ? orderA - orderB : b[1] - a[1];
                });
              const rawHeights = visibleAmounts.map(([, amount]) =>
                scale > 0 ? Math.max(2, (CHART_HEIGHT * amount) / scale) : 0,
              );
              const rawSum = rawHeights.reduce((sum, height) => sum + height, 0);
              const heightScale = rawSum > CHART_HEIGHT ? CHART_HEIGHT / rawSum : 1;
              return (
                <Pressable
                  key={dayMs}
                  onPress={() => selectDay(dayMs, day.dayEntries)}
                  disabled={day.filteredTotal <= 0}
                  accessible={day.filteredTotal > 0}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    day.filteredTotal > 0
                      ? `${formatDate(dayMs)}. Tap to see that day’s entries.`
                      : undefined
                  }
                  style={[styles.day, selected ? { backgroundColor: theme.primaryLight } : null]}
                >
                  {visibleAmounts.map(([id], segmentIndex) => (
                    <View
                      key={id}
                      style={[
                        styles.barSegment,
                        {
                          height: rawHeights[segmentIndex] * heightScale,
                          backgroundColor: historicalCategoryChartFill(pattern, id, theme, true),
                          opacity: selectedCategoryId === id ? 1 : 0.92,
                        },
                      ]}
                    />
                  ))}
                </Pressable>
              );
            })}
          </View>
          <View
            style={styles.ticks}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {days.map(day => (
              <View
                key={`tick-${day.date.valueOf()}`}
                style={[
                  styles.tick,
                  selectedDayMs === day.date.valueOf() ? { backgroundColor: theme.primary } : null,
                ]}
              />
            ))}
          </View>
          <View
            style={styles.axis}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <AppText variant="caption" color="secondary">
              {formatDate(startMs)}
            </AppText>
            <AppText variant="caption" color={showEarlierHint ? 'primary' : 'secondary'}>
              {largest > 0
                ? `Largest day ${formatMoney(largest, pattern.currencyCode)}`
                : showEarlierHint
                  ? strings.historicalSwipeEarlierActivity
                  : strings.historicalNoEntriesThisPeriod}
            </AppText>
            <AppText variant="caption" color="secondary">
              {formatDate(end.subtract(1, 'day').valueOf())}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const DOT_ACTIVITY_SIZE = 7;
const DOT_EMPTY_SIZE = 5;
const DOT_CURRENT_SIZE = 8;

const styles = StyleSheet.create({
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dotHit: {
    minWidth: Size.sm,
    minHeight: Size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { borderRadius: Shape.radius.full },
  dotWithActivity: { width: DOT_ACTIVITY_SIZE, height: DOT_ACTIVITY_SIZE },
  dotEmpty: { width: DOT_EMPTY_SIZE, height: DOT_EMPTY_SIZE },
  dotCurrent: { width: DOT_CURRENT_SIZE, height: DOT_CURRENT_SIZE },
  swipeHint: { marginBottom: Spacing.xs / 2 },
  chart: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs / 2,
    marginTop: Spacing.xs / 2,
  },
  day: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: Shape.radius.xs / 2,
    minHeight: Spacing.sm,
  },
  barSegment: {
    width: '100%',
    borderTopLeftRadius: Shape.radius.xs / 2,
    borderTopRightRadius: Shape.radius.xs / 2,
  },
  ticks: {
    flexDirection: 'row',
    gap: Spacing.xs / 2,
    height: DOT_ACTIVITY_SIZE,
    marginTop: Spacing.xs / 2,
    alignItems: 'flex-start',
  },
  tick: { flex: 1, height: Spacing.xs, borderRadius: Shape.radius.xs / 2 },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs / 2,
  },
  message: { minHeight: CHART_HEIGHT, justifyContent: 'center', alignItems: 'flex-start' },
});
