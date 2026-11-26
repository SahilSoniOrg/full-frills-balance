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
              size={16}
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
  const opacity = dimmed ? 0.4 : 1;
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
  const loadingMoreRef = useRef(false);
  const currentEvidenceKey = `${capture.workplaceId}:${capture.changeRevision}:${pattern.key}:${activeCategoryId ?? 'all'}`;
  const [trackedCategoryId, setTrackedCategoryId] = useState(activeCategoryId);
  const [evidence, setEvidence] = useState({
    entriesOpen,
    evidenceKey: currentEvidenceKey,
    requestKey,
    pattern: filteredPattern,
    entries: [] as HistoricalEvidenceEntry[],
    pagesLoaded: 0,
    loading: false,
    loadingMore: false,
    error: false,
    stale: false,
  });
  if (trackedCategoryId !== activeCategoryId) {
    setTrackedCategoryId(activeCategoryId);
    setSelectedDayMs(null);
    setDayEntries([]);
  }
  if (
    evidence.entriesOpen !== entriesOpen ||
    evidence.evidenceKey !== currentEvidenceKey ||
    evidence.requestKey !== requestKey ||
    evidence.pattern !== filteredPattern
  ) {
    setEvidence({
      entriesOpen,
      evidenceKey: currentEvidenceKey,
      requestKey,
      pattern: filteredPattern,
      entries: [],
      pagesLoaded: 0,
      loading: entriesOpen,
      loadingMore: false,
      error: false,
      stale: false,
    });
  }
  const { entries, pagesLoaded, loading, loadingMore, error, stale } = evidence;

  useEffect(() => {
    if (!entriesOpen) return;
    let active = true;
    loadingMoreRef.current = false;
    const evidenceKey = currentEvidenceKey;
    const requestedPattern = filteredPattern;
    const requestedKey = requestKey;
    void listHistoricalPatternEvidenceEntries(
      capture.workplaceId,
      requestedPattern,
      0,
      EVIDENCE_PAGE_SIZE,
    )
      .then(page => {
        if (!active) return;
        setEvidence(current =>
          current.entriesOpen === entriesOpen &&
          current.evidenceKey === evidenceKey &&
          current.requestKey === requestedKey &&
          current.pattern === requestedPattern
            ? {
                ...current,
                entries: page,
                pagesLoaded: 1,
                loading: false,
                stale:
                  page.length < Math.min(EVIDENCE_PAGE_SIZE, requestedPattern.journalIds.length),
              }
            : current,
        );
      })
      .catch(() => {
        if (!active) return;
        setEvidence(current =>
          current.entriesOpen === entriesOpen &&
          current.evidenceKey === evidenceKey &&
          current.requestKey === requestedKey &&
          current.pattern === requestedPattern
            ? { ...current, error: true, loading: false }
            : current,
        );
      });
    return () => {
      active = false;
    };
  }, [
    entriesOpen,
    capture.workplaceId,
    capture.changeRevision,
    currentEvidenceKey,
    filteredPattern,
    requestKey,
  ]);

  const loadMore = async () => {
    if (
      loading ||
      error ||
      loadingMore ||
      loadingMoreRef.current ||
      pagesLoaded * EVIDENCE_PAGE_SIZE >= filteredPattern.journalIds.length
    )
      return;
    const evidenceKey = currentEvidenceKey;
    const requestedPattern = filteredPattern;
    const requestedKey = requestKey;
    const pagesAtStart = pagesLoaded;
    const offset = pagesAtStart * EVIDENCE_PAGE_SIZE;
    const isCurrent = (current: typeof evidence) =>
      current.entriesOpen &&
      current.evidenceKey === evidenceKey &&
      current.requestKey === requestedKey &&
      current.pattern === requestedPattern &&
      current.pagesLoaded === pagesAtStart;
    loadingMoreRef.current = true;
    setEvidence(current => (isCurrent(current) ? { ...current, loadingMore: true } : current));
    try {
      const page = await listHistoricalPatternEvidenceEntries(
        capture.workplaceId,
        requestedPattern,
        offset,
        EVIDENCE_PAGE_SIZE,
      );
      setEvidence(current =>
        isCurrent(current)
          ? {
              ...current,
              entries: [...current.entries, ...page],
              pagesLoaded: pagesAtStart + 1,
              loadingMore: false,
              stale:
                current.stale ||
                page.length <
                  Math.min(EVIDENCE_PAGE_SIZE, requestedPattern.journalIds.length - offset),
            }
          : current,
      );
    } catch {
      setEvidence(current =>
        isCurrent(current) ? { ...current, error: true, loadingMore: false } : current,
      );
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const showEntryCategory = mixed && !activeCategoryId;
  const categoryLabel = selectedCategory ? displayCategoryName(selectedCategory.name) : null;
  const disclosureLabel = categoryLabel
    ? strings.historicalFilteredEntries(filteredPattern.journalIds.length, categoryLabel)
    : strings.historicalAllEntries(pattern.journalCount);
  const openLabel = categoryLabel
    ? strings.historicalOpenFilteredEntries(filteredPattern.journalIds.length, categoryLabel)
    : strings.historicalOpenNEntries(pattern.journalCount);

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
              onSelect={setSelectedCategoryId}
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
                size={16}
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
                  <Pressable
                    onPress={() => setRequestKey(value => value + 1)}
                    accessibilityRole="button"
                    style={styles.textAction}
                  >
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
                    onPress={() => void capture.onRetry()}
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
              {!loading &&
              !error &&
              pagesLoaded * EVIDENCE_PAGE_SIZE < filteredPattern.journalIds.length ? (
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
        highlight ? { backgroundColor: theme.primaryLight, borderRadius: 8 } : null,
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
        <AppIcon name={Icon.ChevronRight} size={12} color={theme.textSecondary} />
      </View>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  detailBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  statusInset: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  statusInsetAction: { marginTop: 4 },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    minHeight: 44,
    position: 'relative',
  },
  legendUnderline: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    height: 2,
    borderRadius: 1,
  },
  legendSep: { width: StyleSheet.hairlineWidth, height: 16, marginHorizontal: 2 },
  markCircle: { width: 9, height: 9, borderRadius: 5 },
  markSquare: { width: 9, height: 9, borderRadius: 2 },
  markDiamondWrap: { width: 9, height: 9, alignItems: 'center', justifyContent: 'center' },
  markDiamond: { width: 7, height: 7, borderRadius: 1, transform: [{ rotate: '45deg' }] },
  entriesSection: { gap: 6 },
  dayBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  dayBoxRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readout: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 0 },
  readoutDate: { letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  disclosureToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
    minWidth: 0,
  },
  disclosureLabel: { flexShrink: 1 },
  disclosureOpen: {
    flexShrink: 0,
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 14 },
  actionWide: { alignSelf: 'stretch', width: '100%', minHeight: 46 },
  link: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  linkCentered: { alignSelf: 'center' },
  linkText: { textDecorationLine: 'underline' },
  textAction: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  scope: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  evidenceList: { gap: 14, paddingBottom: 2 },
  dateGroup: { gap: 6 },
  dateGroupLabel: { paddingHorizontal: 2 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    minHeight: 44,
  },
  entryText: { flexGrow: 1, flexShrink: 1, flexBasis: 120, gap: 1, minWidth: 0 },
  entryAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
});
