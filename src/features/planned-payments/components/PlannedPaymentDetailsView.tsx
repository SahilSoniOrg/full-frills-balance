import dayjs from 'dayjs';
import { useWindowDimensions } from 'react-native';
import { AppConfig, Size, Spacing } from '@/src/constants';
import {
  AppButton,
  AppIcon,
  AppSurface,
  AppText,
  Badge,
  Icon,
  LoadingView,
} from '@/src/components/core';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { JournalListModals } from '@/src/features/journal';
import { Column, Row, Separator } from '@/src/design-system';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { getNow } from '@/src/utils/dateUtils';
import type { PlannedPaymentDetailsViewModel } from '../hooks/usePlannedPaymentDetailsViewModel';
import { PlannedPaymentActivityOverview } from './PlannedPaymentActivityOverview';
import {
  plannedMoneyDiffers,
  presentPlannedPaymentDetailsHeader,
} from '../hooks/plannedPaymentDetailsPresentation';

const copy = AppConfig.strings.plannedDetailRedesign;

export function PlannedPaymentDetailsView({
  chrome,
  ...vm
}: PlannedPaymentDetailsViewModel & { chrome: ScreenNavChrome }) {
  const { theme, history = [], selectedIds, isSelectionModeActive } = vm;
  const formatMoney = useMoneyFormat();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const pending = !!vm.pendingAction;
  const hasOccurrence = !!vm.onPost;
  const isPaused = vm.status === PlannedPaymentStatus.PAUSED;
  const isEnded = vm.status === PlannedPaymentStatus.COMPLETED;
  const hasOutstanding = !!vm.outstandingJournalId || hasOccurrence;
  const isEndedWithoutOutstanding = isEnded && !hasOutstanding;
  const occurrence = vm.occurrenceAmount;
  const occurrenceDiffers =
    !!occurrence &&
    vm.amount != null &&
    !!vm.currencyCode &&
    plannedMoneyDiffers(occurrence.amount, occurrence.currencyCode, vm.amount, vm.currencyCode);
  const showcasedDate = vm.showcasedOccurrenceDate ?? vm.nextOccurrenceDate;
  const { eyebrow, urgency, daysUntil, scheduleDue } = presentPlannedPaymentDetailsHeader({
    status: vm.status ?? PlannedPaymentStatus.ACTIVE,
    showcasedDate,
    pausedSinceDate: vm.pausedSinceDate,
    isPaused,
    isEndedWithoutOutstanding,
    lastRecordedJournalDate: vm.activitySummary?.lastRecorded?.journalDate,
    now: getNow(),
  });
  const dueDateText = showcasedDate;
  const formattedDueDate = dueDateText
    ? dayjs(dueDateText).format('dddd, MMM D')
    : (vm.nextOccurrenceText ?? '');

  const accountChip = (account: typeof vm.fromAccount, placeholder: string, label: string) => (
    <AppButton
      key={label}
      variant="ghost"
      onPress={account ? () => vm.onOpenAccount(account.id) : undefined}
      disabled={!account}
      accessibilityRole="button"
      accessibilityLabel={account ? copy.openAccount(account.name) : placeholder}
      buttonStyle={{
        minHeight: 44,
        paddingHorizontal: 0,
        paddingVertical: 0,
        backgroundColor: 'transparent',
      }}
    >
      <AccountInlineLabel
        account={account}
        placeholder={placeholder}
        variant="caption"
        weight="medium"
        appearance="transactionFlow"
        showIcon
      />
    </AppButton>
  );

  const actionCard = (
    <AppSurface elevation="sm" padding="md" radius="r2">
      <Column gap="sm">
        <Row align="center" justify="space-between" gap="sm" flexWrap="wrap">
          <AppText
            variant="body"
            weight="semibold"
            color={isPaused || isEndedWithoutOutstanding ? 'secondary' : 'text'}
          >
            {eyebrow}
          </AppText>
          <Badge
            variant={
              isPaused || isEndedWithoutOutstanding
                ? 'default'
                : daysUntil != null && daysUntil < 0
                  ? 'error'
                  : daysUntil != null && daysUntil <= 3
                    ? 'warning'
                    : 'default'
            }
            size="sm"
          >
            {urgency}
          </Badge>
        </Row>

        {isEndedWithoutOutstanding && vm.activitySummary ? (
          <Column gap="xs">
            {vm.activitySummary.recordedTotals.map(total => (
              <MoneyText
                key={total.currencyCode}
                amount={total.amount}
                currencyCode={total.currencyCode}
                variant="title"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.2}
              />
            ))}
            <AppText variant="body" color="secondary">
              {copy.endedPayments(vm.activitySummary.recordedCount)}
            </AppText>
          </Column>
        ) : (
          vm.amount != null &&
          vm.currencyCode && (
            <MoneyText
              amount={
                isPaused || isEndedWithoutOutstanding
                  ? vm.amount
                  : (occurrence?.amount ?? vm.amount)
              }
              currencyCode={
                isPaused || isEndedWithoutOutstanding
                  ? vm.currencyCode
                  : (occurrence?.currencyCode ?? vm.currencyCode)
              }
              variant="title"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.2}
              color={isPaused || isEndedWithoutOutstanding ? 'secondary' : 'text'}
            />
          )
        )}

        {isPaused ? (
          <>
            <AppText variant="body" color="secondary">
              {vm.intervalLabel}
            </AppText>
            <AppText variant="body" color="secondary">
              {copy.resumeExplanation}
            </AppText>
            {vm.onToggleStatus && (
              <AppButton
                variant="secondary"
                onPress={vm.onToggleStatus}
                loading={vm.pendingAction === 'toggle'}
                disabled={pending}
                accessibilityRole="button"
                accessibilityLabel={copy.resumeSchedule}
                buttonStyle={{
                  minHeight: Size.buttonMd,
                  paddingVertical: Spacing.sm,
                  width: '100%',
                }}
              >
                {copy.resumeSchedule}
              </AppButton>
            )}
          </>
        ) : isEndedWithoutOutstanding ? null : (
          <>
            <AppText variant="body" color="secondary">
              {occurrenceDiffers && occurrence && vm.amount != null && vm.currencyCode
                ? copy.dateAndUsualAmount(
                    daysUntil != null && daysUntil < 0
                      ? copy.dueOn(formattedDueDate)
                      : formattedDueDate,
                    // MoneyText below keeps actual amounts privacy-aware; the catalog accepts display copy.
                    formatMoney(vm.amount, vm.currencyCode),
                  )
                : daysUntil != null && daysUntil < 0
                  ? copy.dueOn(formattedDueDate)
                  : formattedDueDate}
            </AppText>
            {vm.fromAccount || vm.toAccount ? (
              <Row align="center" gap="xs" flexWrap="wrap">
                {accountChip(vm.fromAccount, copy.accountUnavailable, copy.from)}
                <AppIcon name={Icon.ArrowRight} size={Size.iconXs} color="textSecondary" />
                {accountChip(vm.toAccount, copy.accountUnavailable, copy.to)}
              </Row>
            ) : null}
            {scheduleDue.helpText && (
              <AppText variant="caption" color="secondary">
                {scheduleDue.helpText}
              </AppText>
            )}
            {hasOccurrence && (
              <Row gap="sm" align="stretch" style={{ flexDirection: largeText ? 'column' : 'row' }}>
                <AppButton
                  variant="primary"
                  onPress={vm.onPost}
                  disabled={pending}
                  loading={vm.pendingAction === 'record'}
                  accessibilityRole="button"
                  accessibilityLabel={copy.recordPayment}
                  buttonStyle={{
                    flex: largeText ? undefined : 2,
                    minHeight: Size.buttonMd,
                    paddingVertical: Spacing.sm,
                  }}
                  style={largeText ? { width: '100%' } : { flex: 2 }}
                >
                  {copy.recordPayment}
                </AppButton>
                <AppButton
                  variant="secondary"
                  onPress={vm.onSkip}
                  disabled={pending}
                  loading={vm.pendingAction === 'skip'}
                  accessibilityRole="button"
                  accessibilityLabel={copy.skip}
                  buttonStyle={{
                    flex: largeText ? undefined : 1,
                    minHeight: Size.buttonMd,
                    paddingVertical: Spacing.sm,
                  }}
                  style={largeText ? { width: '100%' } : { flex: 1 }}
                >
                  {copy.skip}
                </AppButton>
              </Row>
            )}
          </>
        )}
      </Column>
    </AppSurface>
  );

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
          <AppText variant="subheading">{copy.missingTitle}</AppText>
          <AppButton
            variant="ghost"
            onPress={vm.onBack}
            accessibilityRole="button"
            accessibilityLabel={copy.goBack}
          >
            {copy.goBack}
          </AppButton>
        </Column>
      ) : (
        <>
          <Column paddingVertical="sm" gap="md">
            {actionCard}
            {vm.actionError && (
              <AppText color="error" accessibilityRole="alert">
                {vm.actionError}
              </AppText>
            )}

            {!vm.isPreview && (
              <PlannedPaymentActivityOverview
                summary={vm.activitySummary}
                nextOccurrences={vm.nextOccurrences}
                showcasedOccurrenceDate={vm.showcasedOccurrenceDate}
                cadenceLabel={vm.intervalLabel}
                history={history}
                reversalJournalIds={vm.reversalJournalIds}
                historyLoading={vm.isLoadingHistory}
                historyLoadingMore={vm.isLoadingMore}
                hasMore={vm.hasMore}
                startDate={vm.firstRecordedDate}
                ruleAmount={vm.amount ?? 0}
                ruleCurrencyCode={vm.currencyCode ?? ''}
                ruleName={vm.nameText ?? ''}
                isPaused={isPaused}
                isEnded={isEnded}
                isLoading={vm.isLoadingActivity}
                error={vm.activityError}
                onRetry={vm.onRetryActivity}
                onLoadMore={vm.onLoadMore}
                onOpenJournal={vm.onOpenJournal}
                selectedIds={selectedIds}
                isSelectionModeActive={isSelectionModeActive}
                onLongPressItem={vm.onLongPressItem}
                onToggleSelection={vm.toggleSelection}
              />
            )}

            {!vm.isPreview && (
              <Column gap="sm">
                <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
                  <AppText variant="subheading" weight="semibold">
                    {copy.details}
                  </AppText>
                  {vm.headerActions?.onEdit && (
                    <AppButton
                      variant="ghost"
                      onPress={vm.headerActions.onEdit}
                      accessibilityRole="button"
                      accessibilityLabel={copy.edit}
                      buttonStyle={{ minHeight: 44, paddingHorizontal: 8 }}
                    >
                      {copy.edit}
                    </AppButton>
                  )}
                </Row>
                <AppSurface elevation="sm" padding="none" radius="r2" overflow="hidden">
                  <Column>
                    <DetailRow label={copy.repeats} value={vm.intervalLabel ?? ''} />
                    <Separator />
                    <DetailRow
                      label={copy.recording}
                      value={vm.isAutoPost ? copy.autoPost : copy.manual}
                    />
                    <Separator />
                    <DetailRow label={copy.started} value={vm.startDateText ?? ''} />
                    <Separator />
                    <DetailRow
                      label={copy.ends}
                      value={
                        vm.endTimestamp == null
                          ? copy.noEndDate
                          : vm.remainingOccurrenceCount == null
                            ? (vm.endDateText ?? '')
                            : copy.endCount(vm.endDateText ?? '', vm.remainingOccurrenceCount)
                      }
                    />
                    {vm.description?.trim() && (
                      <>
                        <Separator />
                        <Column paddingHorizontal="md" paddingVertical="sm" gap="xs">
                          <AppText variant="caption" color="secondary">
                            {copy.note}
                          </AppText>
                          <AppText variant="body">{vm.description}</AppText>
                        </Column>
                      </>
                    )}
                  </Column>
                </AppSurface>
              </Column>
            )}

            {!vm.isPreview && vm.onToggleStatus && !isPaused && !isEnded && (
              <AppButton
                variant="ghost"
                onPress={vm.onToggleStatus}
                loading={vm.pendingAction === 'toggle'}
                disabled={pending}
                accessibilityRole="button"
                accessibilityLabel={copy.pauseSchedule}
                buttonStyle={{ minHeight: 44, alignSelf: 'center' }}
              >
                <AppText color="secondary">{copy.pauseSchedule}</AppText>
              </AppButton>
            )}
          </Column>
          {vm.modals ? <JournalListModals {...vm.modals} /> : null}
        </>
      )}
    </ScreenWithChrome>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  return (
    <Row
      justify="space-between"
      align="center"
      gap="sm"
      paddingHorizontal="md"
      paddingVertical="sm"
      style={{
        flexDirection: largeText ? 'column' : 'row',
        alignItems: largeText ? 'flex-start' : 'center',
      }}
    >
      <AppText variant="body" color="secondary">
        {label}
      </AppText>
      <AppText
        variant="body"
        weight="medium"
        style={{ flexShrink: 1, textAlign: largeText ? 'left' : 'right' }}
      >
        {value}
      </AppText>
    </Row>
  );
}
