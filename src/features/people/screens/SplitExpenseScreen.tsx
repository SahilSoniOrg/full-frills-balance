import {
  AppButton,
  AppCard,
  AppInputField,
  AppSegmentedControl,
  AppText,
  AppToggle,
  Badge,
  ListRow,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { StyleSheet, View } from 'react-native';
import { SplitBreakdownPreview } from '../components/SplitBreakdownPreview';
import { useSplitExpenseViewModel } from '../hooks/useSplitExpenseViewModel';

function SplitExpenseScreenContent() {
  const vm = useSplitExpenseViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();

  const chrome = buildDetailNavChrome({
    phase: vm.isLoading ? 'loading' : 'ready',
    readyTitle: vm.isEditingExisting ? 'Split expense' : 'New split expense',
    loadingTitle: 'Split expense',
    onBack: vm.onBack,
  });

  if (vm.isLoading) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome} scrollable>
      <View style={styles.content}>
        {!vm.isEditingExisting && (
          <AppSegmentedControl
            options={[
              { id: 'you', label: 'You paid' },
              { id: 'friend', label: 'Friend paid' },
            ]}
            value={vm.payerMode}
            onChange={value => vm.setPayerMode(value === 'friend' ? 'friend' : 'you')}
          />
        )}

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Expense Details</AppText>
            <AppInputField
              placeholder="Description"
              value={vm.description}
              onChangeText={vm.setDescription}
              testID="split-description-input"
            />
            {vm.payerMode === 'you' ? (
              <AppInputField
                keyboardType="decimal-pad"
                placeholder={`Total amount (${vm.currencyCode})`}
                value={vm.totalText}
                onChangeText={vm.setTotalText}
                testID="split-total-input"
              />
            ) : (
              <AppInputField
                keyboardType="decimal-pad"
                placeholder={`Your share (${vm.currencyCode})`}
                value={vm.userShareText}
                onChangeText={vm.setUserShareText}
                testID="split-user-share-input"
              />
            )}
          </View>
        </AppCard>

        {vm.payerMode === 'friend' && !vm.isEditingExisting ? (
          <>
            <AppCard>
              <View style={styles.sectionGap}>
                <AppText variant="subheading">Paid By</AppText>
                {vm.people.map(entry => (
                  <ListRow
                    key={entry.person.id}
                    title={entry.person.name}
                    trailing={
                      vm.friendPayerId === entry.person.id ? (
                        <Badge size="sm">Payer</Badge>
                      ) : undefined
                    }
                    onPress={() => vm.setFriendPayerId(entry.person.id)}
                  />
                ))}
              </View>
            </AppCard>
            <AppCard>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <AppText weight="semibold">Repayable?</AppText>
                  <AppText variant="caption" color="secondary">
                    {vm.friendRepayable
                      ? 'Creates an open payable you owe them.'
                      : 'Treated as non-repayable gift/treat.'}
                  </AppText>
                </View>
                <AppToggle value={vm.friendRepayable} onValueChange={vm.setFriendRepayable} />
              </View>
            </AppCard>
          </>
        ) : (
          <>
            {!vm.isEditingExisting && (
              <AppCard>
                <View style={styles.sectionGap}>
                  <AppText variant="subheading">Paid With</AppText>
                  {vm.fundingAccounts.map(account => (
                    <ListRow
                      key={account.id}
                      title={account.name}
                      subtitle={account.currencyCode}
                      trailing={
                        vm.fundingAccountId === account.id ? (
                          <Badge size="sm">Selected</Badge>
                        ) : undefined
                      }
                      onPress={() => vm.handleSelectFundingAccount(account.id)}
                    />
                  ))}
                </View>
              </AppCard>
            )}

            <AppCard>
              <View style={styles.sectionGap}>
                <AppText variant="subheading">Participants</AppText>
                {vm.people.map(entry => (
                  <ListRow
                    key={entry.person.id}
                    title={entry.person.name}
                    trailing={
                      <Badge size="sm">
                        {vm.selectedPersonIds.includes(entry.person.id) ? 'Included' : 'Add'}
                      </Badge>
                    }
                    onPress={() => vm.toggleParticipant(entry.person.id)}
                    testID={`split-participant-toggle-${entry.person.id}`}
                  />
                ))}
                <View style={styles.quickAddRow}>
                  <View style={styles.flexOne}>
                    <AppInputField
                      placeholder="Quick add person"
                      value={vm.newPersonName}
                      onChangeText={vm.setNewPersonName}
                    />
                  </View>
                  <AppButton
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      void vm.onQuickAddPerson();
                    }}
                  >
                    Add
                  </AppButton>
                </View>
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.sectionGap}>
                <AppText variant="subheading">Split Method</AppText>
                <AppSegmentedControl
                  options={[
                    { id: 'equal', label: 'Equal split' },
                    { id: 'custom', label: 'Custom amounts' },
                  ]}
                  value={vm.splitMethod}
                  onChange={value => vm.setSplitMethod(value === 'custom' ? 'custom' : 'equal')}
                />
                {vm.splitMethod === 'custom' && (
                  <View style={styles.sectionGap}>
                    <AppInputField
                      keyboardType="decimal-pad"
                      placeholder="Your share"
                      value={vm.userShareText}
                      onChangeText={vm.setUserShareText}
                    />
                    {vm.people
                      .filter(entry => vm.selectedPersonIds.includes(entry.person.id))
                      .map(entry => (
                        <AppInputField
                          key={entry.person.id}
                          keyboardType="decimal-pad"
                          placeholder={`${entry.person.name} share`}
                          value={vm.customShares[entry.person.id] ?? ''}
                          onChangeText={text =>
                            vm.setCustomShares(prev => ({ ...prev, [entry.person.id]: text }))
                          }
                        />
                      ))}
                  </View>
                )}
              </View>
            </AppCard>

            {vm.splitPreview.valid && (
              <SplitBreakdownPreview
                total={formatMoneyAmount(vm.parsedTotal, vm.currencyCode, isPrivacyMode)}
                userShare={formatMoneyAmount(
                  vm.splitPreview.userShare,
                  vm.currencyCode,
                  isPrivacyMode,
                )}
                participants={vm.splitPreview.shares.map(share => ({
                  id: share.personId,
                  name: share.name,
                  owedAmount: formatMoneyAmount(share.amount, vm.currencyCode, isPrivacyMode),
                }))}
              />
            )}
          </>
        )}

        <AppCard>
          <View style={styles.sectionGap}>
            <AppText variant="subheading">Expense Category</AppText>
            {vm.expenseAccounts.map(account => (
              <ListRow
                key={account.id}
                title={account.name}
                subtitle={account.currencyCode}
                trailing={
                  vm.expenseAccountId === account.id ? <Badge size="sm">Selected</Badge> : undefined
                }
                onPress={() => vm.setExpenseAccountId(account.id)}
              />
            ))}
          </View>
        </AppCard>

        <AppButton
          loading={vm.isSubmitting}
          disabled={vm.isSubmitting}
          onPress={() => {
            void vm.onSubmit();
          }}
          testID="split-expense-submit-button"
        >
          Save split
        </AppButton>
      </View>
    </ScreenWithChrome>
  );
}

export const SplitExpenseScreen = withPrivacyScope(SplitExpenseScreenContent);

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxxxl },
  sectionGap: { gap: Spacing.sm },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  quickAddRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flexOne: { flex: 1 },
});
