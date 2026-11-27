import {
  AppButton,
  AppIcon,
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
import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Inline, Stack } from '@/src/design-system';
import { AccountType } from '@/src/types/enums';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { ScrollView, StyleSheet, View } from 'react-native';
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

  const debtAccounts = vm.detail.linkedAccounts.filter(
    linked =>
      linked.account.accountType === AccountType.ASSET ||
      linked.account.accountType === AccountType.LIABILITY,
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Stack gap="lg">
            <Inline gap="md" alignItems="center">
              <PersonAvatar name={vm.detail.person.name} color={vm.detail.person.color} size={44} />
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
              {vm.compatibleJournals.length === 0 ? (
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
              ) : (
                vm.compatibleJournals.map(journal => {
                  const selected = vm.selectedExistingJournalId === journal.journalId;
                  return (
                    <ListRow
                      key={journal.journalId}
                      leading={
                        <AppIcon
                          name={selected ? Icon.CheckCircle : Icon.Circle}
                          size={20}
                          color={selected ? 'primary' : 'textSecondary'}
                        />
                      }
                      title={
                        <MoneyText
                          amount={journal.cashAmount}
                          currencyCode={journal.currencyCode}
                          variant="body"
                        />
                      }
                      subtitle={`${formatShortDate(journal.journalDate)} · ${journal.description || journal.cashAccountName}`}
                      trailing={
                        journal.description ? undefined : (
                          <AppText variant="caption" color="secondary">
                            {journal.cashAccountName}
                          </AppText>
                        )
                      }
                      onPress={() => vm.selectMatchedJournal(journal)}
                    />
                  );
                })
              )}
            </ListGroup>

            {vm.isCrossCurrency ? (
              <AppInputField
                accessibilityLabel="Exchange rate"
                value={vm.exchangeRate}
                onChangeText={vm.setExchangeRate}
                keyboardType="decimal-pad"
                placeholder="Payment currency per target currency"
              />
            ) : null}

            <ListGroup header="PERSON ACCOUNT">
              {debtAccounts.length === 0 ? (
                <ListRow
                  leading={<IconTile icon={Icon.Alert} tint="warning" />}
                  title="No receivable or payable account linked yet."
                  subtitle="Link an account on the Person screen first."
                  wrap
                />
              ) : (
                debtAccounts.map(linked => (
                  <ListRow
                    key={linked.account.id}
                    leading={<IconTile icon={Icon.Wallet} tint="income" />}
                    title={linked.account.name}
                    subtitle={`${linked.account.currencyCode} · Balance ${formatMoneyAmount(linked.unassignedState.ledgerBalanceInNormalDirection, linked.account.currencyCode, isPrivacyMode)}`}
                    trailing={
                      vm.targetAccountId === linked.account.id ? (
                        <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                      ) : undefined
                    }
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
                      <ListRow
                        leading={
                          <IconTile icon={Icon.Receipt} tint={selected ? 'income' : 'warning'} />
                        }
                        title={formatMoneyAmount(
                          entry.remainder,
                          entry.item.currencyCode,
                          isPrivacyMode,
                        )}
                        subtitle={`Original ${formatMoneyAmount(entry.item.originalAmount, entry.item.currencyCode, isPrivacyMode)}`}
                        trailing={
                          <AppIcon
                            name={selected ? Icon.CheckCircle : Icon.Circle}
                            size={20}
                            color={selected ? 'primary' : 'textSecondary'}
                          />
                        }
                        onPress={() => vm.toggleOpenItem(entry.item.id)}
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
        </ScrollView>
        <SubmitFooter
          label="Match & allocate"
          disabled={!vm.selectedExistingJournalId || !vm.targetAccountId || vm.isSubmitting}
          loading={vm.isSubmitting}
          onPress={() => void vm.onSubmit()}
          testID="settle-up-submit-button"
        />
      </View>
    </ScreenWithChrome>
  );
}

export const SettleUpScreen = withPrivacyScope(SettleUpScreenContent);

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
});
