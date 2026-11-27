import {
  AppButton,
  AppCard,
  AppIcon,
  AppInputField,
  AppText,
  AppToggle,
  Badge,
  EmptyStateView,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { AccountListRow } from '@/src/components/accounts/AccountListRow';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { safeAdd } from '@/src/domain/money/money';
import { Box, Inline, Stack } from '@/src/design-system';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/enums';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { WeAreSettledPreviewModal } from '../components/WeAreSettledPreviewModal';
import { usePersonDetailsViewModel } from '../hooks/usePersonDetailsViewModel';

const ACCOUNT_TYPE_SUMMARY = [
  { type: AccountType.EXPENSE, label: 'Expenses', tint: 'expense' },
  { type: AccountType.INCOME, label: 'Income', tint: 'income' },
  { type: AccountType.ASSET, label: 'Assets', tint: 'asset' },
  { type: AccountType.LIABILITY, label: 'Liabilities', tint: 'liability' },
] as const;

function PersonDetailsScreenContent() {
  const vm = usePersonDetailsViewModel();
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | null>(null);
  const [addAccountAfterSummaryDismiss, setAddAccountAfterSummaryDismiss] = useState(false);
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  const phase = vm.isLoading ? 'loading' : vm.detail ? 'ready' : 'missing';
  const detail = vm.detail;

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
        leadingActions={[
          {
            name: Icon.Repeat,
            onPress: () => vm.onSettleUp(),
            variant: 'surface',
            iconColor: theme.text,
            accessibilityLabel: 'Record repayment',
            testID: 'person-settle-up-button',
          },
        ]}
        actions={[
          {
            label: 'Match existing',
            icon: Icon.Search,
            onPress: vm.onMatchExisting,
            testID: 'person-match-repayment-button',
          },
          ...(vm.settledPreview?.blockedReason !== 'Nothing open to close'
            ? [
                {
                  label: "We're settled",
                  icon: Icon.CheckCircle,
                  onPress: vm.onStartWeAreSettled,
                  testID: 'person-we-are-settled-button',
                },
              ]
            : []),
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
  const accountSummaries = ACCOUNT_TYPE_SUMMARY.map(group => {
    const accounts = detail.linkedAccounts.filter(
      linked => linked.account.accountType === group.type,
    );
    const totals = new Map<string, number>();
    for (const linked of accounts) {
      const currencyCode = linked.account.currencyCode;
      totals.set(
        currencyCode,
        safeAdd(
          totals.get(currencyCode) ?? 0,
          linked.unassignedState.ledgerBalanceInNormalDirection,
          getCurrencyPrecision(currencyCode),
        ),
      );
    }
    return {
      ...group,
      accounts,
      accountCount: accounts.length,
      totals: [...totals]
        .map(([currencyCode, amount]) => ({ currencyCode, amount }))
        .sort(
          (a, b) =>
            Number(b.currencyCode === vm.workplaceCurrency) -
              Number(a.currencyCode === vm.workplaceCurrency) ||
            a.currencyCode.localeCompare(b.currencyCode),
        ),
    };
  });
  const selectedAccountSummary = accountSummaries.find(group => group.type === selectedAccountType);

  return (
    <ScreenWithChrome chrome={chrome} scrollable>
      <Box padding="lg" paddingBottom="xxxl">
        <Stack gap="xl">
          <AppCard padding="md" elevation="sm" radius="xxl">
            <Stack gap="sm">
              <Inline gap="md" alignItems="center">
                <PersonAvatar name={detail.person.name} size={64} />
                <Stack gap="xs" flex={1}>
                  <Inline gap="sm" alignItems="center" flexWrap="wrap">
                    <AppText variant="title" fontRole="display">
                      {detail.person.name}
                    </AppText>
                    {detail.person.archivedAt ? <Badge size="sm">Archived</Badge> : null}
                  </Inline>
                  <PersonBalanceBadge
                    summary={detail.balanceSummary}
                    personName={detail.person.name}
                    formatAmount={(amount, currencyCode) =>
                      formatMoneyAmount(amount, currencyCode, isPrivacyMode)
                    }
                  />
                </Stack>
              </Inline>
              <View style={[styles.accountSummaryGrid, { borderColor: theme.border }]}>
                {accountSummaries.map((group, index) => {
                  const itemStyle = [
                    styles.accountSummaryItem,
                    index < accountSummaries.length - 1 && styles.accountSummaryItemDivider,
                    { borderColor: theme.border },
                  ];
                  const itemContent = (
                    <>
                      <Inline gap="xs" alignItems="center" justifyContent="space-between">
                        <AppText
                          variant="caption"
                          color={group.tint}
                          weight="medium"
                          numberOfLines={1}
                        >
                          {group.label}
                        </AppText>
                        {group.accountCount > 0 ? (
                          <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={group.tint} />
                        ) : null}
                      </Inline>
                      {group.totals.length > 0 ? (
                        <View style={styles.currencyTotals}>
                          {group.totals.map(total => (
                            <MoneyText
                              key={total.currencyCode}
                              amount={total.amount}
                              currencyCode={total.currencyCode}
                              variant="bodySmall"
                              color={group.tint}
                              weight="semibold"
                            />
                          ))}
                        </View>
                      ) : (
                        <AppText variant="caption" color="secondary">
                          No accounts
                        </AppText>
                      )}
                    </>
                  );
                  const itemProps = {
                    accessibilityLabel: `${group.label}, ${group.accountCount} ${group.accountCount === 1 ? 'account' : 'accounts'}`,
                    accessibilityHint:
                      group.accountCount > 0 ? 'Shows the linked accounts' : undefined,
                    testID: `person-account-summary-${group.type.toLowerCase()}`,
                    style: itemStyle,
                  };
                  return group.accountCount > 0 ? (
                    <PressScaleTouchable
                      key={group.type}
                      {...itemProps}
                      accessibilityRole="button"
                      onPress={() => setSelectedAccountType(group.type)}
                    >
                      {itemContent}
                    </PressScaleTouchable>
                  ) : (
                    <View key={group.type} {...itemProps}>
                      {itemContent}
                    </View>
                  );
                })}
              </View>
            </Stack>
          </AppCard>

          {negativeAccounts.length > 0 ? (
            <NoticeBanner
              tone="warning"
              icon={Icon.Info}
              message={`Unassigned remainder is negative on ${negativeAccounts
                .map(a => a.account.name)
                .join(', ')}. Review entries before closing.`}
            />
          ) : null}

          <ListGroup header="OPEN ITEMS">
            {openItems.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.CheckCircle} tint="income" />}
                title="No open items remaining."
                subtitle="All tracked IOUs are settled."
              />
            ) : (
              openItems.map(entry => {
                const settledRatio =
                  entry.item.originalAmount > 0
                    ? Math.max(
                        0,
                        Math.min(100, (1 - entry.remainder / entry.item.originalAmount) * 100),
                      )
                    : 0;
                const isPartial = entry.remainder < entry.item.originalAmount;
                return (
                  <ListRow
                    key={entry.item.id}
                    leading={<IconTile icon={Icon.Receipt} tint="warning" />}
                    title={
                      <Stack gap="xs">
                        <Inline gap="sm" alignItems="center">
                          <AppText variant="body" weight="semibold" tabular>
                            {formatMoneyAmount(
                              entry.remainder,
                              entry.item.currencyCode,
                              isPrivacyMode,
                            )}{' '}
                            remaining
                          </AppText>
                          <Badge size="sm" variant={isPartial ? 'warning' : 'default'}>
                            {isPartial ? 'Partial' : 'Open'}
                          </Badge>
                        </Inline>
                        <AppText variant="caption" color="secondary" tabular>
                          of{' '}
                          {formatMoneyAmount(
                            entry.item.originalAmount,
                            entry.item.currencyCode,
                            isPrivacyMode,
                          )}{' '}
                          total
                        </AppText>
                      </Stack>
                    }
                    trailing={
                      <AppButton
                        size="sm"
                        variant="outline"
                        onPress={() => vm.onSettleUp(entry.item.id)}
                      >
                        Settle
                      </AppButton>
                    }
                  >
                    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${settledRatio}%`,
                            backgroundColor: theme.income,
                          },
                        ]}
                      />
                    </View>
                  </ListRow>
                );
              })
            )}
          </ListGroup>

          {detail.unallocatedRepayments.length > 0 ? (
            <ListGroup header="UNALLOCATED REPAYMENTS">
              {detail.unallocatedRepayments.map(repayment => (
                <ListRow
                  key={`${repayment.journalId}-${repayment.accountId}`}
                  leading={<IconTile icon={Icon.Wallet} tint="primary" />}
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
            </ListGroup>
          ) : null}

          <ListGroup header="HISTORY">
            {vm.history.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.Document} tint="textSecondary" />}
                title="No posted transactions yet."
                subtitle="Splits and repayments will appear here."
              />
            ) : (
              vm.history.map(item => (
                <ListRow
                  key={item.journalId}
                  leading={<IconTile icon={Icon.Document} tint="primary" />}
                  title={item.description || item.accountName}
                  subtitle={`${formatShortDate(item.journalDate)} · ${item.accountName}`}
                  trailing={
                    <MoneyText
                      amount={item.amount}
                      currencyCode={item.currencyCode}
                      variant="body"
                    />
                  }
                  chevron
                  onPress={() => vm.onOpenJournal(item.journalId)}
                />
              ))
            )}
          </ListGroup>
        </Stack>
      </Box>

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

      <ModalSurface
        visible={vm.renameOpen}
        title="Rename person"
        onClose={() => vm.setRenameOpen(false)}
        position="center"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={() => vm.setRenameOpen(false)}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton onPress={() => void vm.onRename()}>Save</AppButton>
            </Box>
          </Inline>
        }
      >
        <AppInputField
          value={vm.renameDraft}
          onChangeText={vm.setRenameDraft}
          placeholder="Name"
          autoFocus
        />
      </ModalSurface>

      <ModalSurface
        visible={vm.linkModalOpen}
        title="Link existing account"
        onClose={() => vm.setLinkModalOpen(false)}
        position="bottomSheet"
        fixedHeight={false}
      >
        <ListGroup>
          {vm.linkableAccounts.length === 0 ? (
            <ListRow title="No unlinked compatible accounts found." />
          ) : (
            vm.linkableAccounts.map(account => (
              <ListRow
                key={account.id}
                leading={<IconTile icon={Icon.Bank} tint="asset" />}
                title={account.name}
                subtitle={`${account.accountType} · ${account.currencyCode}`}
                chevron
                onPress={() => void vm.onLinkAccount(account.id)}
              />
            ))
          )}
        </ListGroup>
      </ModalSurface>

      <ModalSurface
        visible={selectedAccountSummary != null}
        title={`${selectedAccountSummary?.label ?? 'Linked'} accounts`}
        onClose={() => setSelectedAccountType(null)}
        onDismiss={() => {
          if (!addAccountAfterSummaryDismiss) return;
          setAddAccountAfterSummaryDismiss(false);
          vm.setLinkModalOpen(true);
        }}
        position="bottomSheet"
        fixedHeight={false}
        footer={
          <AppButton
            style={{ width: '100%' }}
            onPress={() => {
              setAddAccountAfterSummaryDismiss(true);
              setSelectedAccountType(null);
            }}
            testID="person-add-linked-account-button"
          >
            Add account
          </AppButton>
        }
      >
        {selectedAccountSummary ? (
          <ListGroup>
            {selectedAccountSummary.accounts.map(linked => (
              <AccountListRow
                key={linked.account.id}
                item={linked.account}
                testID={`person-summary-account-${linked.account.id}`}
                trailingAccessory={
                  <MoneyText
                    amount={linked.unassignedState.ledgerBalanceInNormalDirection}
                    currencyCode={linked.account.currencyCode}
                    variant="bodySmall"
                  />
                }
              />
            ))}
          </ListGroup>
        ) : null}
      </ModalSurface>

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
              <ListRow
                key={entry.item.id}
                leading={<IconTile icon={Icon.Receipt} tint="warning" />}
                title={formatMoneyAmount(entry.remainder, entry.item.currencyCode, isPrivacyMode)}
                subtitle="Tap to apply"
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
  accountSummaryGrid: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountSummaryItem: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
    gap: Spacing.xs,
    minHeight: Size.buttonMd,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  accountSummaryItemDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  currencyTotals: {
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  progressTrack: {
    height: Spacing.xs,
    borderRadius: Shape.radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: Spacing.xs,
  },
});
