import { MoneyText } from '@/src/components/shared/MoneyText';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import {
  Icon,
  AppButton,
  AppIcon,
  IconButton,
  AppSurface,
  Badge,
  IvyIcon,
  AppText,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Size } from '@/src/constants';
import { Column, Row, Separator } from '@/src/design-system';
import { PlannedPaymentHistoryCard } from './PlannedPaymentHistoryCard';
import { PlannedPaymentActivityOverview } from './PlannedPaymentActivityOverview';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import {
  getPlannedPaymentHistoryPresentation,
  groupPlannedPaymentEntries,
} from '../hooks/plannedPaymentDetailsPresentation';
import { PlannedPaymentDetailsViewModel } from '../hooks/usePlannedPaymentDetailsViewModel';
import { JournalListModals } from '@/src/features/journal';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getNow } from '@/src/utils/dateUtils';
import { getVariantMainColor } from '@/src/utils/style-helpers';
import { PlannedPaymentStatus } from '@/src/types/enums';
import type { EnrichedJournal } from '@/src/types/domainReadModels';

export function PlannedPaymentDetailsView({
  chrome,
  ...vm
}: PlannedPaymentDetailsViewModel & { chrome: ScreenNavChrome }) {
  const { theme, history = [], selectedIds, isSelectionModeActive } = vm;
  const { scheduled, recorded } = groupPlannedPaymentEntries(history);
  const hasOccurrence = !!vm.onPost;
  const occurrenceDiffers =
    vm.occurrenceAmount &&
    (vm.occurrenceAmount.amount !== vm.amount ||
      vm.occurrenceAmount.currencyCode !== vm.currencyCode);
  const headlineOccurrence =
    vm.status !== PlannedPaymentStatus.PAUSED && (hasOccurrence || vm.outstandingJournalId)
      ? vm.occurrenceAmount
      : undefined;
  const entriesSummary = (entries: EnrichedJournal[]) =>
    vm.isLoadingHistory
      ? 'Loading activity…'
      : `${entries.length} loaded ${entries.length === 1 ? 'entry' : 'entries'}${vm.hasMore ? ' · earlier entries available' : ''}`;
  const renderEntries = (entries: EnrichedJournal[]) =>
    entries.map(journal => {
      const presentation = getPlannedPaymentHistoryPresentation(journal, getNow());
      return (
        <PlannedPaymentHistoryCard
          key={journal.id}
          journalId={journal.id}
          journalTitle={journal.description || 'Transaction'}
          journalAmount={journal.totalAmount}
          currencyCode={journal.currencyCode}
          journalDate={journal.journalDate}
          plannedAmount={vm.rawAmount ?? 0}
          plannedCurrencyCode={vm.currencyCode}
          plannedTitle={vm.rawName ?? ''}
          presentation={presentation}
          isOverdue={presentation.isOverdue}
          isSelected={selectedIds.has(journal.id)}
          isSelectionModeActive={isSelectionModeActive}
          onLongPress={() => vm.onLongPressItem(journal.id)}
          onPress={() =>
            isSelectionModeActive ? vm.toggleSelection(journal.id) : vm.onOpenJournal(journal.id)
          }
        />
      );
    });

  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable={!vm.isLoading && !vm.isMissing}
      withPadding={!vm.isLoading && !vm.isMissing}
      footer={
        <SelectionActionBar
          isVisible={isSelectionModeActive}
          selectedCount={selectedIds.size}
          totalCount={history.length}
          onSelectAll={vm.selectAll}
          onDeselectAll={vm.clearItems}
          onClear={vm.exitSelectionMode}
          onShare={vm.onShareSelected}
          actions={vm.actions}
        />
      }
    >
      {vm.isLoading ? (
        <LoadingView loading text={AppConfig.strings.common.loading} />
      ) : vm.isMissing ? (
        <Column flex={1} align="center" justify="center" gap="md">
          <AppIcon name={Icon.Error} size={Size.xxl} color={theme.textSecondary} />
          <AppText variant="subheading">Planned payment not found</AppText>
          <AppButton variant="ghost" onPress={vm.onBack}>
            Go back
          </AppButton>
        </Column>
      ) : (
        <>
          <Column paddingVertical="md" gap="lg">
            <AppSurface elevation="sm" padding="lg" radius="r2">
              <Column gap="md">
                <Row align="center" gap="md">
                  <IvyIcon
                    name={vm.iconName}
                    label={vm.nameText}
                    color={theme[vm.typeColorKey ?? 'primary'] as string}
                    size={Size.avatarMd}
                    shape="circle"
                  />
                  <Column flex={1} gap="xs">
                    <AppText variant="heading">{vm.nameText}</AppText>
                    <AppText variant="caption" color="secondary">
                      {vm.typeLabel}
                      {vm.typeLabel && vm.currencyCode ? ' · ' : ''}
                      {headlineOccurrence?.currencyCode ?? vm.currencyCode}
                    </AppText>
                  </Column>
                </Row>
                <Column gap="xs">
                  <AppText variant="caption" color="secondary">
                    {headlineOccurrence ? 'Next occurrence amount' : 'Amount per occurrence'}
                  </AppText>
                  {vm.amount != null && vm.currencyCode ? (
                    <MoneyText
                      amount={headlineOccurrence?.amount ?? vm.amount}
                      currencyCode={headlineOccurrence?.currencyCode ?? vm.currencyCode}
                      variant="title"
                    />
                  ) : (
                    <AppText variant="xl">…</AppText>
                  )}
                </Column>
                {vm.isPreview ? (
                  <AppText color="secondary">Loading schedule and activity…</AppText>
                ) : (
                  <>
                    <Separator />
                    <Column gap="sm">
                      <Row gap="sm" align="center" flexWrap="wrap">
                        <AppIcon
                          name={Icon.Calendar}
                          size={Size.iconSm}
                          color={getVariantMainColor(theme, vm.dueColor ?? 'secondary')}
                        />
                        <AppText
                          variant="body"
                          weight="semibold"
                          color={vm.dueColor ?? 'secondary'}
                        >
                          {vm.dueLabel}
                        </AppText>
                        {vm.status === PlannedPaymentStatus.COMPLETED && hasOccurrence && (
                          <Badge variant="default" size="sm">
                            Schedule completed
                          </Badge>
                        )}
                        {vm.outstandingJournalId && (
                          <IconButton
                            name={Icon.Receipt}
                            variant="clear"
                            iconColor="textSecondary"
                            style={{ marginLeft: 'auto' }}
                            accessibilityLabel="Review this occurrence"
                            onPress={() => vm.onOpenJournal(vm.outstandingJournalId!)}
                            disabled={!!vm.pendingAction}
                          />
                        )}
                      </Row>
                      <AppText variant="body" weight="medium">
                        {vm.nextOccurrenceText}
                      </AppText>
                      {occurrenceDiffers &&
                        headlineOccurrence &&
                        vm.amount != null &&
                        vm.currencyCode && (
                          <Column gap="xs">
                            <Row gap="xs" align="baseline" flexWrap="wrap">
                              <AppText variant="caption" color="secondary">
                                Default per occurrence
                              </AppText>
                              <MoneyText
                                amount={vm.amount}
                                currencyCode={vm.currencyCode}
                                variant="body"
                              />
                            </Row>
                            <AppText variant="caption" color="secondary">
                              This saved occurrence has a different amount.
                            </AppText>
                          </Column>
                        )}
                      {vm.isLoadingActivity && (
                        <AppText variant="caption" color="secondary">
                          Checking the next occurrence…
                        </AppText>
                      )}
                      {vm.scheduleHelpText && (
                        <AppText variant="caption" color="secondary">
                          {vm.scheduleHelpText}
                        </AppText>
                      )}
                    </Column>
                    {hasOccurrence && (
                      <Column gap="sm">
                        <AppButton
                          variant="primary"
                          accessibilityLabel="Record occurrence"
                          onPress={vm.onPost}
                          disabled={!!vm.pendingAction}
                          loading={vm.pendingAction === 'record'}
                        >
                          Record occurrence
                        </AppButton>
                        <AppButton
                          variant="ghost"
                          accessibilityLabel="Skip this occurrence"
                          onPress={vm.onSkip}
                          disabled={!!vm.pendingAction}
                          loading={vm.pendingAction === 'skip'}
                        >
                          Skip this occurrence
                        </AppButton>
                      </Column>
                    )}
                  </>
                )}
              </Column>
            </AppSurface>
            {vm.actionError && (
              <AppText color="error" accessibilityRole="alert">
                {vm.actionError}
              </AppText>
            )}

            {!vm.isPreview && (
              <>
                <PlannedPaymentActivityOverview
                  summary={vm.activitySummary}
                  nextOccurrences={vm.nextOccurrences}
                  isLoading={vm.isLoadingActivity}
                  error={vm.activityError}
                  onRetry={vm.onRetryActivity}
                  onOpenJournal={vm.onOpenJournal}
                />
                <DetailDisclosure
                  title="Account flow"
                  icon={Icon.SwapHorizontal}
                  summary={`${vm.fromAccount?.name ?? 'Unavailable account'} → ${vm.toAccount?.name ?? 'Unavailable account'}`}
                >
                  <Column gap="md">
                    {[
                      { label: 'From', account: vm.fromAccount, color: vm.fromAccountColorKey },
                      { label: 'To', account: vm.toAccount, color: vm.toAccountColorKey },
                    ].map(({ label, account, color }) => (
                      <Column key={label} gap="xs">
                        <AppText variant="caption" color="secondary">
                          {label}
                        </AppText>
                        {account ? (
                          <AppButton
                            variant="ghost"
                            onPress={() => vm.onOpenAccount(account.id)}
                            accessibilityLabel={`Open ${account.name}`}
                            buttonStyle={{ paddingHorizontal: 0, alignItems: 'stretch' }}
                          >
                            <Row align="center" gap="sm" flex={1}>
                              <IvyIcon
                                name={account.icon}
                                fallbackIcon={getAccountFallbackIcon(account.accountType)}
                                label={account.name}
                                color={theme[(color ?? 'primary') as keyof typeof theme] as string}
                                size={Size.avatarSm}
                                shape="circle"
                              />
                              <Column flex={1} gap="xs">
                                <AppText variant="body" weight="semibold">
                                  {account.name}
                                </AppText>
                                <AppText variant="caption" color="secondary">
                                  {account.currencyCode}
                                </AppText>
                              </Column>
                              <AppIcon
                                name={Icon.ChevronRight}
                                size={Size.iconSm}
                                color="textSecondary"
                              />
                            </Row>
                          </AppButton>
                        ) : (
                          <AppText color="secondary">Account unavailable</AppText>
                        )}
                      </Column>
                    ))}
                  </Column>
                </DetailDisclosure>

                <DetailDisclosure
                  title="Schedule"
                  icon={Icon.Repeat}
                  summary={`${vm.intervalLabel ?? ''} · ${vm.isAutoPost ? 'Automatic' : 'Manual'} · ${vm.statusText ?? ''}`}
                >
                  <Column gap="md">
                    {vm.statusText && (
                      <Row>
                        <Badge variant={vm.statusVariant} size="sm">
                          {vm.statusText}
                        </Badge>
                      </Row>
                    )}
                    <Column gap="xs">
                      <AppText variant="caption" color="secondary">
                        Repeats
                      </AppText>
                      <AppText variant="body" weight="semibold">
                        {vm.intervalLabel}
                      </AppText>
                    </Column>
                    <Row gap="md" flexWrap="wrap">
                      <Column gap="xs" flexGrow={1} flexBasis={120}>
                        <AppText variant="caption" color="secondary">
                          Starts
                        </AppText>
                        <AppText variant="body">{vm.startDateText}</AppText>
                      </Column>
                      <Column gap="xs" flexGrow={1} flexBasis={120}>
                        <AppText variant="caption" color="secondary">
                          Ends
                        </AppText>
                        <AppText variant="body">{vm.endDateText}</AppText>
                      </Column>
                    </Row>
                    <Separator />
                    <Column gap="xs">
                      <AppText variant="caption" color="secondary">
                        Recording
                      </AppText>
                      <AppText variant="body" weight="semibold">
                        {vm.isAutoPost ? 'Automatic' : 'Manual'}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {vm.isAutoPost
                          ? 'Due occurrences are recorded automatically when the app processes this schedule.'
                          : 'Record each occurrence after the payment happens.'}
                      </AppText>
                    </Column>
                    {vm.onToggleStatus && (
                      <>
                        {vm.status === PlannedPaymentStatus.PAUSED && (
                          <AppText variant="caption" color="secondary">
                            Resuming restores upcoming paused occurrences and skips those whose
                            dates have passed.
                          </AppText>
                        )}
                        <AppButton
                          variant="secondary"
                          accessibilityLabel={
                            vm.status === PlannedPaymentStatus.ACTIVE
                              ? 'Pause schedule'
                              : 'Resume schedule'
                          }
                          onPress={vm.onToggleStatus}
                          loading={vm.pendingAction === 'toggle'}
                          disabled={!!vm.pendingAction}
                        >
                          {vm.status === PlannedPaymentStatus.ACTIVE
                            ? 'Pause schedule'
                            : 'Resume schedule'}
                        </AppButton>
                      </>
                    )}
                  </Column>
                </DetailDisclosure>

                {vm.description?.trim() && (
                  <DetailDisclosure
                    title="Notes"
                    icon={Icon.Document}
                    summary={
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {vm.description}
                      </AppText>
                    }
                  >
                    <AppText variant="body">{vm.description}</AppText>
                  </DetailDisclosure>
                )}

                {scheduled.length > 0 && (
                  <DetailDisclosure
                    title="Scheduled occurrences"
                    icon={Icon.Calendar}
                    summary={entriesSummary(scheduled)}
                  >
                    <Column gap="sm">
                      {vm.isLoadingHistory ? (
                        <AppText color="secondary">Loading activity…</AppText>
                      ) : (
                        renderEntries(scheduled)
                      )}
                    </Column>
                  </DetailDisclosure>
                )}
                <DetailDisclosure
                  title="History"
                  icon={Icon.History}
                  summary={entriesSummary(recorded)}
                >
                  <Column gap="sm">
                    {vm.isLoadingHistory ? (
                      <AppText color="secondary">Loading activity…</AppText>
                    ) : recorded.length === 0 ? (
                      <AppText color="secondary">
                        {vm.hasMore
                          ? 'No recorded entries in the loaded activity. Load earlier entries below.'
                          : 'No recorded or skipped occurrences yet.'}
                      </AppText>
                    ) : (
                      renderEntries(recorded)
                    )}
                    {vm.hasMore && (
                      <AppButton
                        variant="secondary"
                        accessibilityLabel="Load earlier entries"
                        onPress={vm.onLoadMore}
                        loading={vm.isLoadingMore}
                        disabled={vm.isLoadingMore}
                      >
                        Load earlier entries
                      </AppButton>
                    )}
                  </Column>
                </DetailDisclosure>
              </>
            )}
          </Column>
          {vm.modals ? <JournalListModals {...vm.modals} /> : null}
        </>
      )}
    </ScreenWithChrome>
  );
}
