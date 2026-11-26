import {
  AppButton,
  AppCard,
  AppInputField,
  AppSegmentedControl,
  AppText,
  Badge,
  EmptyStateView,
  Icon,
  ListRow,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountType } from '@/src/types/enums';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { StyleSheet, View } from 'react-native';
import { useSettleUpViewModel } from '../hooks/useSettleUpViewModel';

function SettleUpScreenContent() {
  const vm = useSettleUpViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const phase = vm.isLoading ? 'loading' : vm.detail ? 'ready' : 'missing';

  const chrome = buildDetailNavChrome({
    phase,
    readyTitle: vm.detail ? `Settle up · ${vm.detail.person.name}` : 'Settle up',
    loadingTitle: 'Settle up',
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
    l =>
      l.account.accountType === AccountType.ASSET ||
      l.account.accountType === AccountType.LIABILITY,
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable>
      <View style={styles.content}>
        <AppSegmentedControl
          options={[
            { id: 'new', label: 'New repayment' },
            { id: 'match', label: 'Match existing' },
          ]}
          value={vm.mode}
          onChange={value => vm.setMode(value === 'match' ? 'match' : 'new')}
        />

        {vm.mode === 'match' && (
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Compatible Existing Journals</AppText>
              {vm.compatibleJournals.length === 0 ? (
                <AppText color="secondary">No compatible posted journals found.</AppText>
              ) : (
                vm.compatibleJournals.map(journal => (
                  <ListRow
                    key={journal.journalId}
                    title={journal.description || journal.cashAccountName}
                    subtitle={`${formatShortDate(journal.journalDate)} · ${journal.cashAccountName}`}
                    trailing={
                      <View style={styles.trailingRow}>
                        {vm.selectedExistingJournalId === journal.journalId && (
                          <Badge size="sm">Selected</Badge>
                        )}
                        <AppText weight="semibold">
                          {formatMoneyAmount(
                            journal.cashAmount,
                            journal.currencyCode,
                            isPrivacyMode,
                          )}
                        </AppText>
                      </View>
                    }
                    onPress={() => vm.selectMatchedJournal(journal)}
                  />
                ))
              )}
            </View>
          </AppCard>
        )}

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Person Account</AppText>
            {debtAccounts.length === 0 ? (
              <AppText color="secondary">
                No receivable or payable account linked yet. Link one on the Person screen.
              </AppText>
            ) : (
              debtAccounts.map(linked => (
                <ListRow
                  key={linked.account.id}
                  title={linked.account.name}
                  subtitle={`${linked.account.currencyCode} · Balance ${formatMoneyAmount(
                    linked.unassignedState.ledgerBalanceInNormalDirection,
                    linked.account.currencyCode,
                    isPrivacyMode,
                  )}`}
                  trailing={
                    vm.targetAccountId === linked.account.id ? (
                      <Badge size="sm">Active</Badge>
                    ) : undefined
                  }
                  onPress={() => vm.setTargetAccountId(linked.account.id)}
                />
              ))
            )}
          </View>
        </AppCard>

        {vm.mode === 'new' && (
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Cash / Bank Account</AppText>
              {vm.cashAccounts.map(account => (
                <ListRow
                  key={account.id}
                  title={account.name}
                  subtitle={account.currencyCode}
                  trailing={
                    vm.cashAccountId === account.id ? <Badge size="sm">Selected</Badge> : undefined
                  }
                  onPress={() => vm.handleSelectCashAccount(account.id)}
                />
              ))}
            </View>
          </AppCard>
        )}

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Repayment Details</AppText>
            <AppInputField
              keyboardType="decimal-pad"
              placeholder={`Amount (${vm.journalCurrency})`}
              value={vm.amountText}
              onChangeText={vm.setAmountText}
              testID="settle-up-amount-input"
            />
            {vm.isCrossCurrency && (
              <View style={styles.sectionGap}>
                <AppText variant="caption" color="secondary">
                  FX rate: 1 {vm.targetAccount?.currencyCode} = ? {vm.journalCurrency}
                </AppText>
                <AppInputField
                  keyboardType="decimal-pad"
                  placeholder="Exchange rate"
                  value={vm.exchangeRateText}
                  onChangeText={vm.setExchangeRateText}
                />
              </View>
            )}
            <AppInputField
              placeholder="Description"
              value={vm.description}
              onChangeText={vm.setDescription}
            />
          </View>
        </AppCard>

        {vm.targetOpenItems.length > 0 && (
          <AppCard>
            <View style={styles.sectionGap}>
              <AppText variant="subheading">Allocate to Open Items</AppText>
              {vm.targetOpenItems.map(entry => (
                <ListRow
                  key={entry.item.id}
                  title={formatMoneyAmount(entry.remainder, entry.item.currencyCode, isPrivacyMode)}
                  subtitle={`Original ${formatMoneyAmount(entry.item.originalAmount, entry.item.currencyCode, isPrivacyMode)}`}
                  trailing={
                    <Badge size="sm">
                      {vm.selectedItemIds[entry.item.id] ? 'Selected' : 'Optional'}
                    </Badge>
                  }
                  onPress={() => vm.toggleOpenItem(entry.item.id)}
                />
              ))}
            </View>
          </AppCard>
        )}

        <AppButton
          loading={vm.isSubmitting}
          disabled={!vm.targetAccountId || !vm.cashAccountId || vm.isSubmitting}
          onPress={() => {
            void vm.onSubmit();
          }}
          testID="settle-up-submit-button"
        >
          Save repayment
        </AppButton>
      </View>
    </ScreenWithChrome>
  );
}

export const SettleUpScreen = withPrivacyScope(SettleUpScreenContent);

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxxxl },
  sectionGap: { gap: Spacing.sm },
  trailingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
