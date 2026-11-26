import {
  AppButton,
  AppInputField,
  AppText,
  Badge,
  EmptyStateView,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { ActionButtonPair } from '@/src/components/shared/ActionButtonPair';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
import { AccountType } from '@/src/types/enums';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { WeAreSettledPreviewModal } from '../components/WeAreSettledPreviewModal';
import { usePersonDetailsViewModel } from '../hooks/usePersonDetailsViewModel';

function PersonDetailsScreenContent() {
  const vm = usePersonDetailsViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
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
      <Box padding="lg" paddingBottom="xxxl">
        <Stack gap="xl">
          <Stack gap="md">
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

            {negativeAccounts.length > 0 ? (
              <Badge variant="warning" size="md">
                Unassigned remainder is negative on{' '}
                {negativeAccounts.map(a => a.account.name).join(', ')}. Review entries before
                closing.
              </Badge>
            ) : null}

            <ActionButtonPair
              primary={{
                label: 'Split expense',
                onPress: vm.onSplitExpense,
                testID: 'person-split-expense-button',
              }}
              secondary={{
                label: 'Record repayment',
                onPress: () => vm.onSettleUp(),
                testID: 'person-settle-up-button',
              }}
            />
            <AppButton
              variant="outline"
              onPress={vm.onMatchExisting}
              testID="person-match-repayment-button"
            >
              Match existing
            </AppButton>

            <AppButton
              variant="outline"
              onPress={vm.onStartWeAreSettled}
              testID="person-we-are-settled-button"
            >
              We&apos;re settled
            </AppButton>
          </Stack>

          <ListGroup header="OPEN ITEMS">
            {openItems.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.CheckCircle} tint="income" />}
                title="No open items remaining."
                subtitle="All tracked IOUs are settled."
              />
            ) : (
              openItems.map(entry => (
                <ListRow
                  key={entry.item.id}
                  leading={<IconTile icon={Icon.Receipt} tint="warning" />}
                  title={
                    <Stack gap="xs">
                      <Inline gap="sm" alignItems="center">
                        <AppText variant="body">
                          {formatMoneyAmount(
                            entry.remainder,
                            entry.item.currencyCode,
                            isPrivacyMode,
                          )}{' '}
                          left of{' '}
                          {formatMoneyAmount(
                            entry.item.originalAmount,
                            entry.item.currencyCode,
                            isPrivacyMode,
                          )}
                        </AppText>
                        <Badge
                          size="sm"
                          variant={
                            entry.remainder < entry.item.originalAmount ? 'warning' : 'default'
                          }
                        >
                          {entry.remainder < entry.item.originalAmount ? 'Partial' : 'Open'}
                        </Badge>
                      </Inline>
                      <View
                        style={{
                          height: 4,
                          backgroundColor: theme.border,
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: 4,
                            width: `${Math.max(0, Math.min(100, (1 - entry.remainder / entry.item.originalAmount) * 100))}%`,
                            backgroundColor: theme.income,
                          }}
                        />
                      </View>
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
                />
              ))
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

          <ListGroup
            header="LINKED ACCOUNTS"
            headerAccessory={
              <AppButton
                size="sm"
                variant="ghost"
                onPress={() => vm.setLinkModalOpen(true)}
                testID="person-link-account-button"
              >
                Link existing
              </AppButton>
            }
          >
            {detail.linkedAccounts.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.Bank} tint="textSecondary" />}
                title="No linked accounts yet."
                subtitle="Split an expense or link a legacy account."
              />
            ) : (
              detail.linkedAccounts.map(linked => (
                <ListRow
                  key={linked.account.id}
                  leading={
                    <IconTile
                      icon={Icon.Bank}
                      tint={
                        linked.account.accountType === AccountType.ASSET
                          ? 'income'
                          : 'textSecondary'
                      }
                    />
                  }
                  title={linked.account.name}
                  subtitle={`${linked.account.accountType} · ${linked.account.currencyCode}`}
                  trailing={
                    <MoneyText
                      amount={linked.unassignedState.ledgerBalanceInNormalDirection}
                      currencyCode={linked.account.currencyCode}
                      variant="body"
                    />
                  }
                />
              ))
            )}
          </ListGroup>

          <ListGroup header="HISTORY">
            {vm.history.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.Document} tint="textSecondary" />}
                title="No posted transactions yet."
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
        title="Link Existing Account"
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
