import {
  AppButton,
  AppIcon,
  AppInputField,
  AppText,
  AppToggle,
  EmptyStateView,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
} from '@/src/components/core';
import { AccountPickerModal } from '@/src/components/account-selection';
import { JournalEntryListView } from '@/src/components/journal/JournalEntryListView';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { Layout, Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PersonLinkedAccountsSection } from '../components/PersonLinkedAccountsSection';
import { PersonOpenItemRow } from '../components/PersonOpenItemRow';
import { PersonSettleSheet } from '../components/PersonSettleSheet';
import { PersonSummaryHeader } from '../components/PersonSummaryHeader';
import { WeAreSettledPreviewModal } from '../components/WeAreSettledPreviewModal';
import { usePersonDetailsViewModel } from '../hooks/usePersonDetailsViewModel';

function PersonDetailsScreenContent() {
  const vm = usePersonDetailsViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const phase = vm.isLoading ? 'loading' : vm.detail ? 'ready' : 'missing';
  const detail = vm.detail;

  const openItems = useMemo(
    () => detail?.openItems.filter(entry => entry.remainder > 0) ?? [],
    [detail],
  );
  const openItemsMirrorHero = useMemo(() => {
    if (!detail || openItems.length !== 1) return false;
    const entry = openItems[0]!;
    const active = detail.balanceSummary.currencies.filter(
      balance => balance.owedToYou !== 0 || balance.youOwe !== 0 || balance.net !== 0,
    );
    if (active.length !== 1) return false;
    const balance = active[0]!;
    const heroAmount =
      balance.owedToYou !== 0 && balance.youOwe === 0
        ? balance.owedToYou
        : balance.youOwe !== 0 && balance.owedToYou === 0
          ? balance.youOwe
          : Math.abs(balance.net);
    return entry.item.currencyCode === balance.currencyCode && entry.remainder === heroAmount;
  }, [detail, openItems]);
  const showOpenItems = openItems.length > 1 || (openItems.length === 1 && !openItemsMirrorHero);

  const chrome = buildDetailNavChrome({
    phase,
    // The person's name is shown in the summary, like the account details page.
    readyTitle: '',
    loadingTitle: 'Person',
    onBack: vm.onBack,
    fab: {
      onPress: vm.onSplitExpense,
      label: 'Split expense',
      icon: Icon.Handshake,
      placement: 'end',
      accessibilityLabel: 'Split an expense with this person',
      testID: 'person-split-expense-button',
    },
    headerActions: detail ? (
      <DetailHeaderMenuActions
        actions={[
          {
            label: 'Match existing',
            icon: Icon.Search,
            onPress: vm.onMatchExisting,
            testID: 'person-match-repayment-button',
          },
          {
            label: 'Edit details',
            icon: Icon.Edit,
            onPress: vm.onEditProfile,
            testID: 'person-edit-profile-button',
          },
          {
            label: detail.person.isPinned ? 'Unpin' : 'Pin to top',
            icon: Icon.Star,
            onPress: () => {
              void vm.onTogglePin();
            },
            testID: 'person-toggle-pin-button',
          },
          {
            label: detail.person.archivedAt ? 'Unarchive' : 'Archive',
            icon: Icon.Archive,
            onPress: () => {
              void vm.onToggleArchive();
            },
          },
          {
            label: 'Share summary',
            icon: Icon.Share,
            onPress: () => {
              void vm.onShare();
            },
          },
          {
            label: 'Link existing account',
            icon: Icon.Plus,
            onPress: () => vm.setLinkModalOpen(true),
            testID: 'person-link-account-button',
          },
        ]}
      />
    ) : undefined,
  });
  const negativeAccounts = useMemo(
    () =>
      detail?.linkedAccounts.filter(
        linked => linked.unassignedState.hasNegativeUnassignedRemainder,
      ) ?? [],
    [detail],
  );
  if (vm.isLoading) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading />
      </ScreenWithChrome>
    );
  }

  if (!detail) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <EmptyStateView
          title="Person not found"
          icon={Icon.Error}
          primaryActionLabel="Go back"
          onPrimaryAction={vm.onBack}
        />
      </ScreenWithChrome>
    );
  }

  const listHeader = (
    <Stack gap="md" marginBottom="xs">
      <PersonSummaryHeader
        person={detail.person}
        summary={detail.balanceSummary}
        formatAmount={(amount, currencyCode) =>
          formatMoneyAmount(amount, currencyCode, isPrivacyMode)
        }
        onSettle={() => vm.setSettleSheetOpen(true)}
      />

      {negativeAccounts.length > 0 ? (
        <NoticeBanner
          tone="warning"
          icon={Icon.Info}
          message={`Unassigned remainder is negative on ${negativeAccounts
            .map(a => a.account.name)
            .join(', ')}. Review entries before closing.`}
        />
      ) : null}

      {showOpenItems ? (
        <ListGroup header="OPEN ITEMS">
          {openItems.map(entry => (
            <PersonOpenItemRow
              key={entry.item.id}
              remainder={entry.remainder}
              originalAmount={entry.item.originalAmount}
              currencyCode={entry.item.currencyCode}
              isPrivacyMode={isPrivacyMode}
              showProgress
            />
          ))}
        </ListGroup>
      ) : null}

      {detail.unallocatedRepayments.length > 0 ? (
        <ListGroup header="UNALLOCATED REPAYMENTS">
          {detail.unallocatedRepayments.map(repayment => (
            <ListRow
              key={`${repayment.journalId}-${repayment.accountId}`}
              leading={<IconTile icon={Icon.Wallet} tint="primary" />}
              title={formatMoneyAmount(repayment.amount, repayment.currencyCode, isPrivacyMode)}
              subtitle="Not yet applied to an open item"
              trailing={
                openItems.length > 0 ? (
                  <AppButton
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      vm.setAllocateTarget({
                        accountId: repayment.accountId,
                        settlementJournalId: repayment.journalId,
                        amount: repayment.amount,
                      })
                    }
                  >
                    Apply
                  </AppButton>
                ) : undefined
              }
            />
          ))}
        </ListGroup>
      ) : null}

      <PersonLinkedAccountsSection
        personName={detail.person.name}
        linkedAccounts={detail.linkedAccounts}
        onLink={() => vm.setLinkModalOpen(true)}
        onOpenAccount={vm.onOpenAccount}
        onUnlinkAccount={vm.onUnlinkAccount}
        formatAmount={(amount, currencyCode) =>
          formatMoneyAmount(amount, currencyCode, isPrivacyMode)
        }
      />

      {detail.person.paymentHandle ||
      detail.person.phone ||
      detail.person.email ||
      detail.person.notes ? (
        <ListGroup header="PROFILE">
          {detail.person.paymentHandle ? (
            <ListRow
              leading={<IconTile icon={Icon.Wallet} tint="primary" />}
              title={detail.person.paymentHandle}
              subtitle="Payment handle · Tap to copy"
              trailing={<AppIcon name={Icon.Copy} size={Size.iconSm} color="primary" />}
              onPress={() => void vm.onCopyPaymentHandle()}
              testID="person-copy-payment-handle-button"
            />
          ) : null}
          {detail.person.phone ? (
            <ListRow
              leading={<IconTile icon={Icon.MessageCircle} tint="textSecondary" />}
              title={detail.person.phone}
              subtitle="Phone"
            />
          ) : null}
          {detail.person.email ? (
            <ListRow
              leading={<IconTile icon={Icon.Mail} tint="textSecondary" />}
              title={detail.person.email}
              subtitle="Email"
            />
          ) : null}
          {detail.person.notes ? (
            <ListRow
              leading={<IconTile icon={Icon.Document} tint="textSecondary" />}
              title="Notes"
              subtitle={detail.person.notes}
              wrap
            />
          ) : null}
        </ListGroup>
      ) : null}

      <ScreenSectionHeader title="History" />
    </Stack>
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <JournalEntryListView
          items={vm.journalItems}
          isLoading={vm.isLoadingActivity}
          isLoadingMore={vm.isLoadingMoreActivity}
          error={vm.activityError}
          retry={vm.retryActivity}
          onEndReached={vm.onEndReachedActivity}
          emptyTitle="No posted transactions yet"
          emptySubtitle="Splits and repayments will appear here."
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      </View>

      <ModalSurface
        visible={vm.sharePreviewOpen}
        title="Share summary"
        onClose={() => vm.setSharePreviewOpen(false)}
        position="bottomSheet"
        fixedHeight={false}
        footer={
          <AppButton
            onPress={() => {
              vm.setSharePreviewOpen(false);
              void vm.onConfirmShare();
            }}
          >
            Share
          </AppButton>
        }
      >
        <Stack gap="md">
          {(
            [
              ['includeOpenItems', 'Open items'],
              ['includeRepayments', 'Repayments'],
              ['includeBalances', 'Balances'],
              ...(detail.person.paymentHandle
                ? ([['includePaymentHandle', 'Payment handle']] as const)
                : []),
            ] as const
          ).map(([key, label]) => (
            <Inline key={key} justifyContent="space-between" alignItems="center">
              <AppText>{label}</AppText>
              <AppToggle
                accessibilityLabel={label}
                value={vm.shareFields[key]}
                onValueChange={value => vm.setShareFields(fields => ({ ...fields, [key]: value }))}
              />
            </Inline>
          ))}
          <AppText>
            {isPrivacyMode ? 'Turn off privacy mode to preview the summary.' : vm.sharePreview}
          </AppText>
        </Stack>
      </ModalSurface>

      <AccountPickerModal
        visible={vm.linkModalOpen}
        accounts={vm.linkableAccounts}
        title="Link existing account"
        onClose={() => vm.setLinkModalOpen(false)}
        onSelect={id => {
          vm.setLinkModalOpen(false);
          void vm.onLinkAccount(id);
        }}
      />

      <PersonSettleSheet
        visible={vm.settleSheetOpen}
        personName={detail.person.name}
        hasReceivable={detail.balanceSummary.currencies.some(balance => balance.owedToYou > 0)}
        hasPayable={detail.balanceSummary.currencies.some(balance => balance.youOwe > 0)}
        onClose={() => vm.setSettleSheetOpen(false)}
        onMoneyReceived={() =>
          vm.onSettleUp(openItems.length === 1 ? openItems[0]!.item.id : undefined)
        }
        onClearOpenBalances={() => {
          void vm.onStartWeAreSettled();
        }}
        onPartialForgive={() => vm.onSettleUp()}
      />

      <ModalSurface
        visible={Boolean(vm.allocateTarget)}
        title="Apply Repayment to Open Item"
        onClose={() => vm.setAllocateTarget(null)}
        position="bottomSheet"
        fixedHeight={false}
      >
        <ListGroup>
          {openItems
            .filter(entry => entry.item.accountId === vm.allocateTarget?.accountId)
            .map(entry => (
              <PersonOpenItemRow
                key={entry.item.id}
                remainder={entry.remainder}
                originalAmount={entry.item.originalAmount}
                currencyCode={entry.item.currencyCode}
                isPrivacyMode={isPrivacyMode}
                chevron
                onPress={() => void vm.onApplyUnassigned(entry.item.id)}
              />
            ))}
        </ListGroup>
      </ModalSurface>

      <ModalSurface
        visible={vm.settledFxOpen}
        title={`Exchange Rates for ${vm.workplaceCurrency}`}
        onClose={() => vm.setSettledFxOpen(false)}
        position="center"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={() => vm.setSettledFxOpen(false)}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton
                onPress={() => {
                  vm.setSettledFxOpen(false);
                  vm.setSettledPreviewOpen(true);
                }}
              >
                Preview
              </AppButton>
            </Box>
          </Inline>
        }
      >
        <Stack gap="md">
          {vm.foreignCurrencies.map(currency => (
            <View key={currency} style={{ gap: Spacing.xs }}>
              <AppText variant="caption" color="secondary">
                1 {currency} = ? {vm.workplaceCurrency}
              </AppText>
              <AppInputField
                keyboardType="decimal-pad"
                value={vm.fxRatesDraft[currency] ?? ''}
                onChangeText={text => vm.setFxRatesDraft(prev => ({ ...prev, [currency]: text }))}
              />
            </View>
          ))}
        </Stack>
      </ModalSurface>

      {vm.settledPreview ? (
        <WeAreSettledPreviewModal
          visible={vm.settledPreviewOpen}
          isConfirming={vm.isConfirmingSettlement}
          personName={detail.person.name}
          summary={detail.balanceSummary}
          workplaceCurrency={vm.workplaceCurrency}
          closingResidual={vm.settledPreview.closingResidual}
          closingLines={vm.settledPreview.plan?.lines.map(line => ({
            accountName:
              detail.linkedAccounts.find(link => link.account.id === line.accountId)?.account
                .name ?? vm.settledPreview!.forgivenAccountName,
            amount: line.amount,
            currencyCode: line.currencyCode ?? vm.workplaceCurrency,
            exchangeRate: line.exchangeRate,
          }))}
          forgivenAccountName={vm.settledPreview.forgivenAccountName}
          forgivenAccountType={vm.settledPreview.forgivenAccountType}
          blockedReason={vm.settledPreview.blockedReason}
          formatAmount={(amount, currencyCode) =>
            formatMoneyAmount(amount, currencyCode, isPrivacyMode)
          }
          onCancel={() => vm.setSettledPreviewOpen(false)}
          onConfirm={() => void vm.onConfirmWeAreSettled()}
        />
      ) : null}
    </ScreenWithChrome>
  );
}

export const PersonDetailsScreen = withPrivacyScope(PersonDetailsScreenContent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Layout.listBottomInset.fab,
  },
});
