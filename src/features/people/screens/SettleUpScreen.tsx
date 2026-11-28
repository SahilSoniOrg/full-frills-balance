import {
  AppButton,
  AppInputField,
  AppText,
  EmptyStateView,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { PersonOpenItemRow } from '../components/PersonOpenItemRow';
import { useSettleUpViewModel } from '../hooks/useSettleUpViewModel';

function SettleUpScreenContent() {
  const vm = useSettleUpViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const phase = vm.isLoading ? 'loading' : vm.detail ? 'ready' : 'missing';
  const chrome = buildDetailNavChrome({
    phase,
    readyTitle: vm.detail ? `Match repayment · ${vm.detail.person.name}` : 'Match repayment',
    loadingTitle: 'Match repayment',
    onBack: vm.onBack,
  });

  if (vm.isLoading) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading />
      </ScreenWithChrome>
    );
  }
  if (!vm.detail) {
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

  return (
    <EntityFormScreen
      chrome={chrome}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
      submitAction={{
        label: 'Match & allocate',
        disabled: vm.isSubmitting || Boolean(vm.disabledReason),
        requirementHint: vm.disabledReason,
        loading: vm.isSubmitting,
        testID: 'settle-up-submit-button',
        onPress: () => void vm.onSubmit(),
      }}
    >
      <Box paddingHorizontal="lg" paddingBottom="xxl">
        <Stack gap="lg">
          <Inline gap="md" alignItems="center">
            <PersonAvatar
              name={vm.detail.person.name}
              icon={vm.detail.person.icon}
              color={vm.detail.person.color}
              size={44}
            />
            <Stack gap="none" flex={1}>
              <AppText variant="subheading" fontRole="display">
                {vm.detail.person.name}
              </AppText>
              <AppText variant="caption" color="secondary">
                Match an existing transaction and allocate open items
              </AppText>
            </Stack>
          </Inline>

          <ListGroup header="COMPATIBLE EXISTING JOURNALS">
            <AppInputField
              accessibilityLabel="Search existing transactions"
              value={vm.query}
              onChangeText={vm.setQuery}
              placeholder="Search amount, account, or description"
            />
            {vm.compatibleJournals.length === 0 ? (
              vm.isLoadingMatches ? (
                <LoadingView loading variant="inline" />
              ) : (
                <Stack gap="sm">
                  <ListRow
                    leading={<IconTile icon={Icon.Search} tint="textSecondary" />}
                    title="No qualifying unlinked transactions matched."
                    subtitle="Record a repayment in Transfer mode, then match it here."
                    wrap
                  />
                  <AppButton variant="outline" onPress={() => vm.recordNewRepayment()}>
                    Record new repayment instead
                  </AppButton>
                </Stack>
              )
            ) : (
              vm.compatibleJournals.map(journal => {
                const selected = vm.selectedJournalCandidateId === journal.id;
                return (
                  <ListRow
                    key={journal.id}
                    leading={<SelectionIndicator selected={selected} />}
                    title={
                      <Stack gap="xs">
                        <MoneyText
                          amount={journal.cashAmount}
                          currencyCode={journal.cashCurrencyCode}
                          variant="body"
                        />
                        {journal.journalAmount != null &&
                        journal.currencyCode !== journal.cashCurrencyCode ? (
                          <AppText variant="caption" color="secondary">
                            Journal{' '}
                            {formatMoneyAmount(
                              journal.journalAmount,
                              journal.currencyCode,
                              isPrivacyMode,
                            )}
                          </AppText>
                        ) : null}
                      </Stack>
                    }
                    subtitle={`${formatShortDate(journal.journalDate)} · ${journal.description || journal.cashAccountName}${journal.counterAccountName ? ` · ${journal.counterAccountName}` : ''}`}
                    trailing={
                      journal.description ? undefined : (
                        <AppText variant="caption" color="secondary">
                          {journal.cashAccountName}
                        </AppText>
                      )
                    }
                    onPress={() => vm.selectMatchedJournal(journal)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  />
                );
              })
            )}
            {vm.hasMoreMatches ? (
              <AppButton
                variant="outline"
                loading={vm.isLoadingMatches}
                onPress={() => void vm.onLoadMore()}
              >
                Load more
              </AppButton>
            ) : null}
          </ListGroup>

          {vm.isCrossCurrency ? (
            <Stack gap="xs">
              <AppText variant="caption" color="secondary">
                {`1 ${vm.targetAccount?.currencyCode} = ? ${vm.selectedJournal?.currencyCode}`}
              </AppText>
              <AppInputField
                accessibilityLabel="Exchange rate"
                value={vm.exchangeRate}
                onChangeText={vm.setExchangeRate}
                keyboardType="decimal-pad"
                placeholder="Journal currency per target currency"
              />
            </Stack>
          ) : null}

          <ListGroup header="PERSON ACCOUNT">
            {vm.debtAccounts.length === 0 ? (
              <ListRow
                leading={<IconTile icon={Icon.Alert} tint="warning" />}
                title="No receivable or payable account linked yet."
                subtitle="Link an account on the Person screen first."
                wrap
              />
            ) : (
              vm.debtAccounts.map(linked => (
                <ListRow
                  key={linked.account.id}
                  leading={<IconTile icon={Icon.Wallet} tint="income" />}
                  title={linked.account.name}
                  subtitle={`${linked.account.currencyCode} · Balance ${formatMoneyAmount(linked.unassignedState.ledgerBalanceInNormalDirection, linked.account.currencyCode, isPrivacyMode)}`}
                  trailing={
                    <SelectionIndicator selected={vm.targetAccountId === linked.account.id} />
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ selected: vm.targetAccountId === linked.account.id }}
                  onPress={() => vm.setTargetAccountId(linked.account.id)}
                />
              ))
            )}
          </ListGroup>

          {vm.targetOpenItems.length > 0 ? (
            <ListGroup header="ALLOCATE TO OPEN ITEMS">
              {vm.targetOpenItems.map(entry => {
                const selected = Boolean(vm.selectedItemIds[entry.item.id]);
                return (
                  <Stack key={entry.item.id} gap="xs">
                    <PersonOpenItemRow
                      remainder={entry.remainder}
                      originalAmount={entry.item.originalAmount}
                      currencyCode={entry.item.currencyCode}
                      isPrivacyMode={isPrivacyMode}
                      selected={selected}
                      trailing={<SelectionIndicator selected={selected} />}
                      onPress={() => vm.toggleOpenItem(entry.item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    />
                    {selected ? (
                      <AppInputField
                        accessibilityLabel="Amount to apply"
                        keyboardType="decimal-pad"
                        value={vm.allocationDrafts[entry.item.id] ?? ''}
                        onChangeText={text =>
                          vm.setAllocationDrafts(current => ({
                            ...current,
                            [entry.item.id]: text,
                          }))
                        }
                        placeholder="Amount to apply (automatic if blank)"
                      />
                    ) : null}
                  </Stack>
                );
              })}
            </ListGroup>
          ) : null}
          {vm.repaymentPreview && vm.targetAccount ? (
            <ListGroup header="REPAYMENT PREVIEW">
              <ListRow
                title="Applied to person account"
                subtitle={formatMoneyAmount(
                  vm.repaymentPreview.amount,
                  vm.targetAccount.currencyCode,
                  isPrivacyMode,
                )}
              />
              <ListRow
                title="Left unassigned"
                subtitle={formatMoneyAmount(
                  vm.repaymentPreview.unassignedAmount,
                  vm.targetAccount.currencyCode,
                  isPrivacyMode,
                )}
              />
              {vm.repaymentPreview.allocations.map(allocation => (
                <ListRow
                  key={allocation.openItemId}
                  title="Open item allocation"
                  subtitle={formatMoneyAmount(
                    allocation.amount,
                    vm.targetAccount!.currencyCode,
                    isPrivacyMode,
                  )}
                />
              ))}
            </ListGroup>
          ) : null}
        </Stack>
      </Box>
    </EntityFormScreen>
  );
}

export const SettleUpScreen = withPrivacyScope(SettleUpScreenContent);
