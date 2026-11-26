import {
  AppIcon,
  AppInputField,
  AppSegmentedControl,
  AppText,
  EmptyStateView,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
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
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Stack gap="lg">
            <Inline gap="md" alignItems="center">
              <PersonAvatar name={vm.detail.person.name} size={44} />
              <Stack gap="none" flex={1}>
                <AppText variant="subheading" fontRole="display">
                  {vm.detail.person.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Record a new payment or match an existing transaction
                </AppText>
              </Stack>
            </Inline>

            <AppSegmentedControl
              options={[
                { id: 'new', label: 'New repayment' },
                { id: 'match', label: 'Match existing' },
              ]}
              value={vm.mode}
              onChange={value => vm.setMode(value === 'match' ? 'match' : 'new')}
              flex
            />

            <Stack gap="sm">
              <CalculatorAmountInput
                variant="hero"
                currencyCode={vm.journalCurrency}
                currencySymbol={CURRENCY_SYMBOLS[vm.journalCurrency] ?? vm.journalCurrency}
                value={vm.amountText}
                onChangeText={vm.setAmountText}
                placeholder="0"
                testID="settle-up-amount-input"
              />
              {vm.isCrossCurrency ? (
                <Stack gap="xs">
                  <AppText variant="caption" color="secondary">
                    FX rate: 1 {vm.targetAccount?.currencyCode} = ? {vm.journalCurrency}
                  </AppText>
                  <AppInputField
                    leftIcon={Icon.SwapHorizontal}
                    keyboardType="decimal-pad"
                    placeholder="Exchange rate"
                    value={vm.exchangeRateText}
                    onChangeText={vm.setExchangeRateText}
                  />
                </Stack>
              ) : null}
              <AppInputField
                leftIcon={Icon.Document}
                placeholder="Description"
                value={vm.description}
                onChangeText={vm.setDescription}
              />
            </Stack>

            {vm.mode === 'match' ? (
              <ListGroup header="COMPATIBLE EXISTING JOURNALS">
                {vm.compatibleJournals.length === 0 ? (
                  <ListRow
                    leading={<IconTile icon={Icon.Search} tint="textSecondary" />}
                    title="No compatible posted journals found."
                  />
                ) : (
                  vm.compatibleJournals.map(journal => (
                    <ListRow
                      key={journal.journalId}
                      leading={<IconTile icon={Icon.Document} tint="primary" />}
                      title={journal.description || journal.cashAccountName}
                      subtitle={`${formatShortDate(journal.journalDate)} · ${journal.cashAccountName}`}
                      trailing={
                        <Inline gap="sm" alignItems="center">
                          <MoneyText
                            amount={journal.cashAmount}
                            currencyCode={journal.currencyCode}
                            variant="body"
                          />
                          {vm.selectedExistingJournalId === journal.journalId ? (
                            <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                          ) : null}
                        </Inline>
                      }
                      onPress={() => vm.selectMatchedJournal(journal)}
                    />
                  ))
                )}
              </ListGroup>
            ) : (
              <ListGroup header="CASH / BANK ACCOUNT">
                {vm.cashAccounts.map(account => (
                  <ListRow
                    key={account.id}
                    leading={<IconTile icon={Icon.Bank} tint="primary" />}
                    title={account.name}
                    subtitle={account.currencyCode}
                    trailing={
                      vm.cashAccountId === account.id ? (
                        <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                      ) : undefined
                    }
                    onPress={() => vm.handleSelectCashAccount(account.id)}
                  />
                ))}
              </ListGroup>
            )}

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
                    subtitle={`${linked.account.currencyCode} · Balance ${formatMoneyAmount(
                      linked.unassignedState.ledgerBalanceInNormalDirection,
                      linked.account.currencyCode,
                      isPrivacyMode,
                    )}`}
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
                    <ListRow
                      key={entry.item.id}
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
                  );
                })}
              </ListGroup>
            ) : null}
          </Stack>
        </ScrollView>

        <SubmitFooter
          label="Save repayment"
          disabled={!vm.targetAccountId || !vm.cashAccountId || vm.isSubmitting}
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
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
});
