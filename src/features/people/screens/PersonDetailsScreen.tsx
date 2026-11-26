import {
  AppButton,
  AppCard,
  AppInputField,
  AppText,
  Badge,
  EmptyStateView,
  Icon,
  ListRow,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { ModalHost } from '@/src/components/overlays/ModalHost';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { StyleSheet, View } from 'react-native';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { WeAreSettledPreviewModal } from '../components/WeAreSettledPreviewModal';
import { usePersonDetailsViewModel } from '../hooks/usePersonDetailsViewModel';

export function PersonDetailsScreen() {
  const vm = usePersonDetailsViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const phase = vm.isLoading ? 'loading' : vm.detail ? 'ready' : 'missing';
  const detail = vm.detail;

  const chrome = buildDetailNavChrome({
    phase,
    readyTitle: detail?.person.name ?? 'Person',
    loadingTitle: 'Person',
    onBack: vm.onBack,
    headerActions: detail ? (
      <DetailHeaderMenuActions
        actions={[
          {
            label: 'Rename',
            icon: Icon.Edit,
            onPress: () => {
              vm.setRenameDraft(detail.person.name);
              vm.setRenameOpen(true);
            },
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
        ]}
      />
    ) : undefined,
  });

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

  const openItems = detail.openItems.filter(entry => entry.remainder > 0);
  const negativeAccounts = detail.linkedAccounts.filter(
    linked => linked.unassignedState.hasNegativeUnassignedRemainder,
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable>
      <View style={styles.content}>
        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Balance Summary</AppText>
            <PersonBalanceBadge
              summary={detail.balanceSummary}
              personName={detail.person.name}
              formatAmount={(amount, currencyCode) =>
                formatMoneyAmount(amount, currencyCode, isPrivacyMode)
              }
            />
            {negativeAccounts.length > 0 && (
              <Badge variant="warning">
                Unassigned remainder is negative on{' '}
                {negativeAccounts.map(a => a.account.name).join(', ')}. Review entries before
                closing.
              </Badge>
            )}
          </View>
        </AppCard>

        <View style={styles.actionsRow}>
          <AppButton onPress={vm.onSplitExpense} testID="person-split-expense-button">
            Split expense
          </AppButton>
          <AppButton
            variant="secondary"
            onPress={() => vm.onSettleUp()}
            testID="person-settle-up-button"
          >
            Record repayment
          </AppButton>
          <AppButton
            variant="outline"
            onPress={vm.onStartWeAreSettled}
            testID="person-we-are-settled-button"
          >
            We&apos;re settled
          </AppButton>
        </View>

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Open Items</AppText>
            {openItems.length === 0 ? (
              <AppText color="secondary">No open items remaining.</AppText>
            ) : (
              openItems.map(entry => (
                <ListRow
                  key={entry.item.id}
                  title={formatMoneyAmount(entry.remainder, entry.item.currencyCode, isPrivacyMode)}
                  subtitle={`Original ${formatMoneyAmount(entry.item.originalAmount, entry.item.currencyCode, isPrivacyMode)}`}
                  trailing={
                    <AppButton
                      size="sm"
                      variant="outline"
                      onPress={() => vm.onSettleUp(entry.item.id)}
                    >
                      Settle
                    </AppButton>
                  }
                />
              ))
            )}
          </View>
        </AppCard>

        {detail.unallocatedRepayments.length > 0 && (
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Unallocated Repayments</AppText>
              {detail.unallocatedRepayments.map(repayment => (
                <ListRow
                  key={`${repayment.journalId}-${repayment.accountId}`}
                  title={formatMoneyAmount(repayment.amount, vm.workplaceCurrency, isPrivacyMode)}
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
            </View>
          </AppCard>
        )}

        <AppCard>
          <View style={styles.sectionGap}>
            <View style={styles.rowBetween}>
              <AppText variant="subheading">Linked Accounts</AppText>
              <AppButton
                size="sm"
                variant="outline"
                onPress={() => vm.setLinkModalOpen(true)}
                testID="person-link-account-button"
              >
                Link existing
              </AppButton>
            </View>
            {detail.linkedAccounts.length === 0 ? (
              <AppText color="secondary">No linked accounts yet.</AppText>
            ) : (
              detail.linkedAccounts.map(linked => (
                <ListRow
                  key={linked.account.id}
                  title={linked.account.name}
                  subtitle={`${linked.account.accountType} · ${linked.account.currencyCode}`}
                  trailing={
                    <AppText variant="caption" color="secondary">
                      {formatMoneyAmount(
                        linked.unassignedState.ledgerBalanceInNormalDirection,
                        linked.account.currencyCode,
                        isPrivacyMode,
                      )}
                    </AppText>
                  }
                />
              ))
            )}
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">History</AppText>
            {vm.history.length === 0 ? (
              <AppText color="secondary">No posted transactions yet.</AppText>
            ) : (
              vm.history.map(item => (
                <ListRow
                  key={item.journalId}
                  title={item.description || item.accountName}
                  subtitle={`${formatShortDate(item.journalDate)} · ${item.accountName}`}
                  trailing={
                    <AppText weight="semibold">
                      {formatMoneyAmount(item.amount, item.currencyCode, isPrivacyMode)}
                    </AppText>
                  }
                  onPress={() => vm.onOpenJournal(item.journalId)}
                />
              ))
            )}
          </View>
        </AppCard>
      </View>

      <ModalHost
        visible={vm.renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => vm.setRenameOpen(false)}
      >
        <View style={styles.modalWrap}>
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Rename person</AppText>
              <AppInputField
                value={vm.renameDraft}
                onChangeText={vm.setRenameDraft}
                placeholder="Name"
              />
              <View style={styles.actionsRow}>
                <AppButton variant="outline" onPress={() => vm.setRenameOpen(false)}>
                  Cancel
                </AppButton>
                <AppButton
                  onPress={() => {
                    void vm.onRename();
                  }}
                >
                  Save
                </AppButton>
              </View>
            </View>
          </AppCard>
        </View>
      </ModalHost>

      <ModalHost
        visible={vm.linkModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => vm.setLinkModalOpen(false)}
      >
        <View style={styles.modalWrap}>
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Link Existing Account</AppText>
              {vm.linkableAccounts.length === 0 ? (
                <AppText color="secondary">No unlinked compatible accounts found.</AppText>
              ) : (
                vm.linkableAccounts.map(account => (
                  <ListRow
                    key={account.id}
                    title={account.name}
                    subtitle={`${account.accountType} · ${account.currencyCode}`}
                    onPress={() => {
                      void vm.onLinkAccount(account.id);
                    }}
                  />
                ))
              )}
              <AppButton variant="outline" onPress={() => vm.setLinkModalOpen(false)}>
                Close
              </AppButton>
            </View>
          </AppCard>
        </View>
      </ModalHost>

      <ModalHost
        visible={Boolean(vm.allocateTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => vm.setAllocateTarget(null)}
      >
        <View style={styles.modalWrap}>
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Apply Repayment to Open Item</AppText>
              {openItems
                .filter(entry => entry.item.accountId === vm.allocateTarget?.accountId)
                .map(entry => (
                  <ListRow
                    key={entry.item.id}
                    title={formatMoneyAmount(
                      entry.remainder,
                      entry.item.currencyCode,
                      isPrivacyMode,
                    )}
                    subtitle="Tap to apply"
                    onPress={() => {
                      void vm.onApplyUnassigned(entry.item.id);
                    }}
                  />
                ))}
              <AppButton variant="outline" onPress={() => vm.setAllocateTarget(null)}>
                Cancel
              </AppButton>
            </View>
          </AppCard>
        </View>
      </ModalHost>

      <ModalHost
        visible={vm.settledFxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => vm.setSettledFxOpen(false)}
      >
        <View style={styles.modalWrap}>
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Exchange Rates for {vm.workplaceCurrency}</AppText>
              {vm.foreignCurrencies.map(currency => (
                <View key={currency} style={styles.fieldGap}>
                  <AppText variant="caption">
                    1 {currency} = ? {vm.workplaceCurrency}
                  </AppText>
                  <AppInputField
                    keyboardType="decimal-pad"
                    value={vm.fxRatesDraft[currency] ?? ''}
                    onChangeText={text =>
                      vm.setFxRatesDraft(prev => ({ ...prev, [currency]: text }))
                    }
                  />
                </View>
              ))}
              <View style={styles.actionsRow}>
                <AppButton variant="outline" onPress={() => vm.setSettledFxOpen(false)}>
                  Cancel
                </AppButton>
                <AppButton
                  onPress={() => {
                    vm.setSettledFxOpen(false);
                    vm.setSettledPreviewOpen(true);
                  }}
                >
                  Preview
                </AppButton>
              </View>
            </View>
          </AppCard>
        </View>
      </ModalHost>

      {vm.settledPreview && (
        <WeAreSettledPreviewModal
          visible={vm.settledPreviewOpen}
          personName={detail.person.name}
          summary={detail.balanceSummary}
          workplaceCurrency={vm.workplaceCurrency}
          closingResidual={vm.settledPreview.closingResidual}
          forgivenAccountName={vm.settledPreview.forgivenAccountName}
          forgivenAccountType={vm.settledPreview.forgivenAccountType}
          blockedReason={vm.settledPreview.blockedReason}
          formatAmount={(amount, currencyCode) =>
            formatMoneyAmount(amount, currencyCode, isPrivacyMode)
          }
          onCancel={() => vm.setSettledPreviewOpen(false)}
          onConfirm={() => {
            void vm.onConfirmWeAreSettled();
          }}
        />
      )}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxxxl },
  sectionGap: { gap: Spacing.sm },
  fieldGap: { gap: Spacing.xs },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalWrap: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
});
