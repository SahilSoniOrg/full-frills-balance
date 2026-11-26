import {
  AppButton,
  AppIcon,
  AppText,
  Badge,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { MoneyText } from '@/src/components/shared/MoneyText';
import {
  HistoricalEvidenceChart,
  historicalCategoryColor,
  historicalCategoryMarkerShape,
} from './HistoricalEvidenceChart';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  BorderWidth,
  Opacity,
  Shape,
  Size,
  Spacing,
  Typography,
} from '@/src/constants/design-tokens';
import { Inline, Stack } from '@/src/design-system';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import {
  listHistoricalPatternEvidenceEntries,
  type HistoricalCategoryPattern,
  type HistoricalEvidenceEntry,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { formatDate } from '@/src/utils/dateFormatting';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccountId } from '@/src/types/ids';
import { SuggestionItemSurface } from './SuggestionItemSurface';
import { SuggestionAccountLabel } from './SuggestionAccountLabel';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';

const EVIDENCE_PAGE_SIZE = 8;
const MARKER_DOT_SIZE = 9;
const MARKER_DIAMOND_SIZE = 7;
const LEGEND_UNDERLINE_OFFSET = 7;
const LEGEND_DOT_RADIUS = 5;
const LEGEND_SQUARE_RADIUS = 2;
const DAY_BOX_ITEM_BASIS = 120;

function smsCount(count: number) {
  return `${count} ${count === 1 ? strings.smsSingular : strings.smsPlural}`;
}

function openMatchingJournalEntries(journalIds: string[], categoryId?: AccountId | null) {
  if (journalIds.length > 0)
    AppNavigation.toJournalSearch({
      journalIds,
      accountIds: categoryId ? [categoryId] : undefined,
    });
}

export function HistoricalPatternRow({
  capture,
  pattern,
  mixed = false,
  expanded,
  onToggle,
}: {
  capture: TransactionCaptureViewModel;
  pattern: HistoricalCategoryPattern;
  mixed?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const breakdown = pattern.categories
    .map(
      category =>
        `${displayCategoryName(category.name)}${mixed ? `, ${category.journalCount}` : ''}`,
    )
    .join('; ');
  const metaText = mixed
    ? strings.historicalCollapsedMixedMeta(pattern.journalCount, pattern.categories.length)
    : strings.historicalCollapsedMeta(
        pattern.journalCount,
        pattern.financialAccountName,
        pattern.currencyCode,
        pattern.kind,
      );

  return (
    <SuggestionItemSurface expanded={expanded}>
      <ListRow
        title={pattern.merchant}
        subtitle={
          mixed ? (
            metaText
          ) : (
            <Inline wrap align="center">
              <AppText variant="caption" color="secondary">
                {strings.historicalCollapsedMetaPrefix(pattern.journalCount)}
              </AppText>
              <SuggestionAccountLabel
                account={pattern.financialAccount}
                name={pattern.financialAccountName}
                placeholder={strings.unavailableAccount}
              />
              <AppText variant="caption" color="secondary">
                {strings.historicalCollapsedMetaSuffix(pattern.currencyCode, pattern.kind)}
              </AppText>
            </Inline>
          )
        }
        trailing={
          <Inline align="center" gap="xs">
            {mixed ? (
              <Badge variant="warning" size="sm">
                {strings.historicalNoDefaultBadge}
              </Badge>
            ) : null}
            <AppIcon
              name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
              size={Size.iconXs}
              color={theme.textSecondary}
            />
          </Inline>
        }
        accessibilityLabel={`${pattern.merchant}. ${mixed ? 'No default. ' : 'Suggested category: '}${breakdown}. ${metaText}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        chevron={false}
        wrap
        testID={`matching-row-history-${pattern.key}`}
      />
      {expanded ? (
        <HistoricalPatternDetail capture={capture} pattern={pattern} mixed={mixed} />
      ) : null}
    </SuggestionItemSurface>
  );
}

/** Strip trailing currency tags like " (INR)" from category display names. */
function displayCategoryName(name: string) {
  return name.replace(/\s*\([A-Z]{3}\)\s*$/u, '').trim() || name;
}

function HistoricalStatusInset({
  pattern,
  action,
}: {
  pattern: HistoricalCategoryPattern;
  action?: ReactNode;
}) {
  const { theme } = useTheme();
  const category = displayCategoryName(pattern.categories[0]?.name ?? strings.unavailableCategory);
  return (
    <View
      style={[
        styles.statusInset,
        { backgroundColor: theme.primaryLight, borderColor: theme.primary },
      ]}
    >
      <AppText variant="bodySmall" weight="semibold" style={{ color: theme.primary }}>
        {`${strings.historicalVerdictSuggested} · ${category}`}
      </AppText>
      <Inline wrap align="center">
        <AppText variant="caption" color="secondary">
          {strings.historicalCategoryScopeBeforeAccount(
            pattern.merchant,
            pattern.currencyCode,
            pattern.kind,
            pattern.journalCount,
          )}
        </AppText>
        <SuggestionAccountLabel
          account={pattern.financialAccount}
          name={pattern.financialAccountName}
          placeholder={strings.unavailableAccount}
        />
        <AppText variant="caption" color="secondary">
          {'.'}
        </AppText>
      </Inline>
      {action ? <View style={styles.statusInsetAction}>{action}</View> : null}
    </View>
  );
}

function CategoryLegend({
  pattern,
  selectedCategoryId,
  onSelect,
}: {
  pattern: HistoricalCategoryPattern;
  selectedCategoryId: AccountId | null;
  onSelect: (id: AccountId | null) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.legendRow} accessibilityLabel="Filter by past category">
      {pattern.categories.map((category, index) => {
        const selected = selectedCategoryId === category.accountId;
        const dimmed = !!selectedCategoryId && !selected;
        const color = historicalCategoryColor(pattern, category.accountId, theme);
        const name = displayCategoryName(category.name);
        return (
          <PressScaleTouchable
            key={category.accountId}
            onPress={() => onSelect(selected ? null : category.accountId)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={
              selected
                ? `${name}. Show all categories for ${pattern.merchant}`
                : `Show ${name} entries for ${pattern.merchant}`
            }
            testID={`historical-category-badge-${pattern.key}-${category.accountId}`}
            pressScale="subtle"
            style={styles.legendItem}
          >
            <CategoryShapeMark
              shape={historicalCategoryMarkerShape(index)}
              color={color}
              dimmed={dimmed}
            />
            <AppText
              variant="caption"
              weight={selected ? 'semibold' : 'medium'}
              color={dimmed ? 'secondary' : undefined}
            >
              {name}
            </AppText>
            <AppText variant="caption" color="secondary" weight={selected ? 'semibold' : 'regular'}>
              {category.journalCount}
            </AppText>
            {selected ? (
              <View style={[styles.legendUnderline, { backgroundColor: theme.primary }]} />
            ) : null}
          </PressScaleTouchable>
        );
      })}
      {selectedCategoryId ? (
        <>
          <View style={[styles.legendSep, { backgroundColor: theme.border }]} />
          <PressScaleTouchable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            accessibilityLabel={`Show all categories for ${pattern.merchant}`}
            testID={`historical-category-clear-${pattern.key}`}
            pressScale="subtle"
            style={styles.legendItem}
          >
            <AppText variant="caption" color="secondary">
              {strings.historicalShowAll(pattern.journalCount)}
            </AppText>
          </PressScaleTouchable>
        </>
      ) : null}
    </View>
  );
}

function CategoryShapeMark({
  shape,
  color,
  dimmed,
}: {
  shape: ReturnType<typeof historicalCategoryMarkerShape>;
  color: string;
  dimmed: boolean;
}) {
  const opacity = dimmed ? Opacity.muted : Opacity.solid;
  if (shape === 'square') {
    return <View style={[styles.markSquare, { backgroundColor: color, opacity }]} />;
  }
  if (shape === 'diamond') {
    return (
      <View style={[styles.markDiamondWrap, { opacity }]}>
        <View style={[styles.markDiamond, { backgroundColor: color }]} />
      </View>
    );
  }
  return <View style={[styles.markCircle, { backgroundColor: color, opacity }]} />;
}

function HistoricalEvidenceList({
  workplaceId,
  pattern,
  showEntryCategory,
  selectedDayMs,
  onRetryRequest,
  onRefreshSuggestions,
}: {
  workplaceId: TransactionCaptureViewModel['workplaceId'];
  pattern: HistoricalCategoryPattern;
  showEntryCategory: boolean;
  selectedDayMs: number | null;
  onRetryRequest: () => void;
  onRefreshSuggestions: () => Promise<void>;
}) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const [entries, setEntries] = useState<HistoricalEvidenceEntry[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const activeRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    loadingMoreRef.current = false;
    void listHistoricalPatternEvidenceEntries(workplaceId, pattern, 0, EVIDENCE_PAGE_SIZE)
      .then(page => {
        if (!activeRef.current) return;
        setEntries(page);
        setPagesLoaded(1);
        setLoading(false);
        setStale(page.length < Math.min(EVIDENCE_PAGE_SIZE, pattern.journalIds.length));
      })
      .catch(() => {
        if (!activeRef.current) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      activeRef.current = false;
    };
  }, [workplaceId, pattern]);

  const loadMore = async () => {
    if (
      loading ||
      error ||
      loadingMore ||
      loadingMoreRef.current ||
      pagesLoaded * EVIDENCE_PAGE_SIZE >= pattern.journalIds.length
    ) {
      return;
    }
    const pagesAtStart = pagesLoaded;
    const offset = pagesAtStart * EVIDENCE_PAGE_SIZE;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await listHistoricalPatternEvidenceEntries(
        workplaceId,
        pattern,
        offset,
        EVIDENCE_PAGE_SIZE,
      );
      if (!activeRef.current) return;
      setEntries(current => [...current, ...page]);
      setPagesLoaded(pagesAtStart + 1);
      setLoadingMore(false);
      setStale(
        current =>
          current || page.length < Math.min(EVIDENCE_PAGE_SIZE, pattern.journalIds.length - offset),
      );
    } catch {
      if (!activeRef.current) return;
      setError(true);
      setLoadingMore(false);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const entryGroups = useMemo(() => {
    const groups: { dayMs: number; label: string; entries: HistoricalEvidenceEntry[] }[] = [];
    for (const entry of entries) {
      const dayMs = dayjsStart(entry.journalDate);
      const last = groups[groups.length - 1];
      if (last && last.dayMs === dayMs) last.entries.push(entry);
      else
        groups.push({
          dayMs,
          label: formatDate(entry.journalDate),
          entries: [entry],
        });
    }
    return groups;
  }, [entries]);

  return (
    <Stack gap="xs">
      {loading ? (
        <AppText variant="caption" color="secondary">
          {strings.historicalEvidenceLoading}
        </AppText>
      ) : null}
      {error ? (
        <Stack gap="xs">
          <AppText variant="caption" color="error">
            {strings.historicalEvidenceError}
          </AppText>
          <Pressable onPress={onRetryRequest} accessibilityRole="button" style={styles.textAction}>
            <AppText variant="bodySmall" color="primary">
              {strings.retry}
            </AppText>
          </Pressable>
        </Stack>
      ) : null}
      {!loading && !error && stale ? (
        <Stack gap="xs">
          <AppText variant="caption" color="secondary">
            {strings.historicalEvidenceStale}
          </AppText>
          <Pressable
            onPress={() => void onRefreshSuggestions()}
            accessibilityRole="button"
            style={styles.textAction}
          >
            <AppText variant="bodySmall" color="primary">
              {strings.refreshSuggestions}
            </AppText>
          </Pressable>
        </Stack>
      ) : null}
      <View style={styles.evidenceList}>
        {entryGroups.map(group => (
          <View key={group.dayMs} style={styles.dateGroup}>
            <AppText
              variant="caption"
              color="secondary"
              weight="semibold"
              style={styles.dateGroupLabel}
            >
              {group.label}
            </AppText>
            <View
              style={[
                styles.dayBox,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}
            >
              {group.entries.map((entry, index) => (
                <View
                  key={entry.journalId}
                  style={
                    index < group.entries.length - 1
                      ? [styles.dayBoxRow, { borderBottomColor: theme.border }]
                      : null
                  }
                >
                  <HistoricalEvidenceRow
                    entry={entry}
                    hourCycle={resolvedHourCycle}
                    showCategory={showEntryCategory}
                    highlight={
                      selectedDayMs != null &&
                      dayjsStart(entry.journalDate) === dayjsStart(selectedDayMs)
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
      {!loading && !error && pagesLoaded * EVIDENCE_PAGE_SIZE < pattern.journalIds.length ? (
        <Pressable
          disabled={loadingMore}
          onPress={() => void loadMore()}
          accessibilityRole="button"
          style={styles.textAction}
        >
          <AppText variant="bodySmall" color="secondary" style={styles.linkText}>
            {loadingMore ? strings.historicalEvidenceLoading : strings.showMore}
          </AppText>
        </Pressable>
      ) : null}
    </Stack>
  );
}

function HistoricalPatternDetail({
  capture,
  pattern,
  mixed,
}: {
  capture: TransactionCaptureViewModel;
  pattern: HistoricalCategoryPattern;
  mixed: boolean;
}) {
  const { theme } = useTheme();
  const [selectedCategoryId, setSelectedCategoryId] = useState<AccountId | null>(null);
  const activeCategoryId = pattern.categories.some(
    category => category.accountId === selectedCategoryId,
  )
    ? selectedCategoryId
    : null;
  const selectedCategory = pattern.categories.find(
    category => category.accountId === activeCategoryId,
  );
  const filteredPattern = useMemo(
    () =>
      activeCategoryId
        ? {
            ...pattern,
            journalIds: pattern.journalIds.filter(
              id => pattern.categoryByJournalId[id] === activeCategoryId,
            ),
          }
        : pattern,
    [pattern, activeCategoryId],
  );
  const { resolvedHourCycle } = useHourCyclePrefs();
  const [selectedDayMs, setSelectedDayMs] = useState<number | null>(null);
  const [dayEntries, setDayEntries] = useState<HistoricalEvidenceEntry[]>([]);
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const existing = capture.categoryDefaults?.find(value => value.key === pattern.key);
  const hasDifferentDefault =
    !!existing &&
    (existing.conflicted || existing.categoryAccountId !== pattern.categories[0]?.accountId);
  const currentEvidenceKey = `${capture.workplaceId}:${capture.changeRevision}:${pattern.key}:${activeCategoryId ?? 'all'}`;

  const handleSelectCategory = (categoryId: AccountId | null) => {
    setSelectedCategoryId(categoryId);
    setSelectedDayMs(null);
    setDayEntries([]);
  };

  const showEntryCategory = mixed && !activeCategoryId;
  const categoryLabel = selectedCategory ? displayCategoryName(selectedCategory.name) : null;
  const disclosureLabel = categoryLabel
    ? strings.historicalFilteredEntries(filteredPattern.journalIds.length, categoryLabel)
    : strings.historicalAllEntries(pattern.journalCount);
  const openLabel = categoryLabel
    ? strings.historicalOpenFilteredEntries(filteredPattern.journalIds.length, categoryLabel)
    : strings.historicalOpenNEntries(pattern.journalCount);

  return (
    <View style={styles.detailBody}>
      <Stack gap="sm">
        {!mixed ? (
          <HistoricalStatusInset
            pattern={pattern}
            action={
              hasDifferentDefault ? (
                <AppText variant="caption" color="secondary">
                  {existing?.conflicted
                    ? strings.conflictedCategoryDefaultHint
                    : strings.existingCategoryDefaultHint}
                </AppText>
              ) : (
                <AppButton
                  size="sm"
                  style={styles.actionWide}
                  variant="primary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => capture.onRememberHistoricalCategory(pattern)}
                >
                  {strings.historicalCategoryCompactAction}
                </AppButton>
              )
            }
          />
        ) : null}
        <View>
          <HistoricalEvidenceChart
            key={`${capture.workplaceId}:${capture.changeRevision}:${pattern.key}`}
            workplaceId={capture.workplaceId}
            pattern={pattern}
            revision={capture.changeRevision}
            selectedCategoryId={activeCategoryId}
            selectedDayMs={selectedDayMs}
            onSelectDay={(dayMs, nextEntries) => {
              setSelectedDayMs(dayMs);
              setDayEntries(nextEntries);
            }}
          />
          {mixed ? (
            <CategoryLegend
              pattern={pattern}
              selectedCategoryId={activeCategoryId}
              onSelect={handleSelectCategory}
            />
          ) : null}
        </View>
        {selectedDayMs == null || dayEntries.length === 0 ? (
          <AppText variant="caption" color="secondary">
            {strings.historicalTapBarHint}
          </AppText>
        ) : (
          <View style={[styles.readout, { borderTopColor: theme.border }]}>
            <AppText variant="caption" color="secondary" style={styles.readoutDate}>
              {formatDate(selectedDayMs)}
            </AppText>
            {dayEntries.map(entry => (
              <HistoricalEvidenceRow
                key={entry.journalId}
                entry={entry}
                hourCycle={resolvedHourCycle}
                showCategory={showEntryCategory}
                compact
              />
            ))}
          </View>
        )}

        <View style={styles.entriesSection}>
          <View style={styles.disclosure}>
            <PressScaleTouchable
              onPress={() => setEntriesOpen(open => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: entriesOpen }}
              testID={`historical-entries-disclosure-${pattern.key}`}
              pressScale="subtle"
              style={styles.disclosureToggle}
            >
              <AppText variant="bodySmall" weight="semibold" style={styles.disclosureLabel}>
                {disclosureLabel}
              </AppText>
              <AppIcon
                name={entriesOpen ? Icon.ChevronUp : Icon.ChevronDown}
                size={Size.iconXs}
                color={theme.textSecondary}
              />
            </PressScaleTouchable>
            <PressScaleTouchable
              onPress={() =>
                openMatchingJournalEntries(filteredPattern.journalIds, activeCategoryId)
              }
              disabled={capture.busy}
              accessibilityRole="button"
              accessibilityLabel={openLabel}
              testID={`historical-open-entries-${pattern.key}`}
              pressScale="subtle"
              style={styles.disclosureOpen}
            >
              <AppText variant="bodySmall" weight="semibold" color="primary">
                {strings.historicalOpenInline}
              </AppText>
            </PressScaleTouchable>
          </View>
          {entriesOpen ? (
            <HistoricalEvidenceList
              key={`${currentEvidenceKey}:${requestKey}`}
              workplaceId={capture.workplaceId}
              pattern={filteredPattern}
              showEntryCategory={showEntryCategory}
              selectedDayMs={selectedDayMs}
              onRetryRequest={() => setRequestKey(value => value + 1)}
              onRefreshSuggestions={capture.onRetry}
            />
          ) : null}
        </View>

        {mixed ? (
          <AppButton
            size="sm"
            style={styles.actionWide}
            variant="outline"
            disabled={capture.busy || capture.loading}
            onPress={() => void capture.onSetMerchantOpen(pattern.merchant, true)}
          >
            {strings.historicalAlwaysReviewAllAccounts}
          </AppButton>
        ) : (
          <PressScaleTouchable
            onPress={() => void capture.onSetMerchantOpen(pattern.merchant, true)}
            disabled={capture.busy || capture.loading}
            accessibilityRole="button"
            pressScale="subtle"
            style={[styles.link, styles.linkCentered]}
          >
            <AppText variant="bodySmall" color="secondary" style={styles.linkText}>
              {strings.historicalAlwaysReviewAllAccounts}
            </AppText>
          </PressScaleTouchable>
        )}
      </Stack>
    </View>
  );
}

function dayjsStart(ms: number) {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function HistoricalEvidenceRow({
  entry,
  hourCycle,
  showCategory,
  compact = false,
  highlight = false,
}: {
  entry: HistoricalEvidenceEntry;
  hourCycle: ReturnType<typeof useHourCyclePrefs>['resolvedHourCycle'];
  showCategory: boolean;
  compact?: boolean;
  highlight?: boolean;
}) {
  const formatMoney = useMoneyFormat();
  const { theme } = useTheme();
  const time = formatDate(entry.journalDate, { includeTime: true, hourCycle });
  const description = entry.description?.trim() || strings.privateDescription;
  const categoryName = entry.categoryName ? displayCategoryName(entry.categoryName) : null;
  const metaParts = [
    compact ? time : null,
    entry.sourceCount > 1 ? smsCount(entry.sourceCount) : null,
    showCategory ? categoryName : null,
  ].filter(Boolean);
  const meta = metaParts.join(' · ');
  return (
    <PressScaleTouchable
      onPress={() => AppNavigation.toJournalDetails(entry.journalId)}
      accessibilityRole="button"
      accessibilityLabel={`${description}, ${time}${meta ? `, ${meta}` : ''}, ${formatMoney(entry.totalAmount, entry.currencyCode)}`}
      accessibilityHint={strings.historicalEntryOpen}
      testID={`historical-evidence-${entry.journalId}`}
      style={[
        styles.timelineRow,
        highlight ? [styles.timelineRowHighlighted, { backgroundColor: theme.primaryLight }] : null,
      ]}
      pressScale="subtle"
    >
      <View style={styles.entryText}>
        <AppText variant="caption" weight="medium" numberOfLines={1}>
          {description}
        </AppText>
        {meta ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <View style={styles.entryAmount}>
        <MoneyText amount={entry.totalAmount} currencyCode={entry.currencyCode} variant="caption" />
        <AppIcon name={Icon.ChevronRight} size={Size.xxs} color={theme.textSecondary} />
      </View>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  detailBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg },
  statusInset: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Shape.radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  statusInsetAction: { marginTop: Spacing.xs },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    minHeight: Size.touchTarget,
    position: 'relative',
  },
  legendUnderline: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: LEGEND_UNDERLINE_OFFSET,
    height: BorderWidth.medium,
    borderRadius: BorderWidth.thin,
  },
  legendSep: { width: StyleSheet.hairlineWidth, height: Size.xs, marginHorizontal: Spacing.xs },
  markCircle: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    borderRadius: LEGEND_DOT_RADIUS,
  },
  markSquare: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    borderRadius: LEGEND_SQUARE_RADIUS,
  },
  markDiamondWrap: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDiamond: {
    width: MARKER_DIAMOND_SIZE,
    height: MARKER_DIAMOND_SIZE,
    borderRadius: BorderWidth.thin,
    transform: [{ rotate: '45deg' }],
  },
  entriesSection: { gap: Spacing.xs },
  dayBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Shape.radius.md,
    overflow: 'hidden',
    paddingHorizontal: Spacing.md,
  },
  dayBoxRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readout: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md, gap: Spacing.none },
  readoutDate: {
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.touchTarget,
  },
  disclosureToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    minHeight: Size.touchTarget,
    minWidth: 0,
  },
  disclosureLabel: { flexShrink: 1 },
  disclosureOpen: {
    flexShrink: 0,
    minHeight: Size.touchTarget,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  actionWide: { alignSelf: 'stretch', width: '100%', minHeight: Size.buttonMd },
  link: { minHeight: Size.touchTarget, paddingHorizontal: Spacing.md, justifyContent: 'center' },
  linkCentered: { alignSelf: 'center' },
  linkText: { textDecorationLine: 'underline' },
  textAction: { minHeight: Size.rowMin, justifyContent: 'center', alignSelf: 'flex-start' },
  evidenceList: { gap: Spacing.md, paddingBottom: Spacing.xs },
  dateGroup: { gap: Spacing.xs },
  dateGroupLabel: { paddingHorizontal: Spacing.xs },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: Size.touchTarget,
  },
  timelineRowHighlighted: {
    borderRadius: Shape.radius.sm,
  },
  entryText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: DAY_BOX_ITEM_BASIS,
    gap: Spacing.none,
    minWidth: 0,
  },
  entryAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
});
