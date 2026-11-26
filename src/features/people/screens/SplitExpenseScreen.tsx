import {
  AppButton,
  AppIcon,
  AppInputField,
  AppSegmentedControl,
  AppText,
  AppToggle,
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
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SplitBreakdownPreview } from '../components/SplitBreakdownPreview';
import { useSplitExpenseViewModel } from '../hooks/useSplitExpenseViewModel';

function SplitExpenseScreenContent() {
  const vm = useSplitExpenseViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();

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
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Stack gap="lg">
            {!vm.isEditingExisting ? (
              <AppSegmentedControl
                options={[
                  { id: 'you', label: 'You paid' },
                  { id: 'friend', label: 'Friend paid' },
                ]}
                value={vm.payerMode}
                onChange={value => vm.setPayerMode(value === 'friend' ? 'friend' : 'you')}
                flex
              />
            ) : null}

            <Stack gap="sm">
              <CalculatorAmountInput
                variant="hero"
                currencyCode={vm.currencyCode}
                currencySymbol={CURRENCY_SYMBOLS[vm.currencyCode] ?? vm.currencyCode}
                value={
                  vm.payerMode === 'you' || vm.isEditingExisting ? vm.totalText : vm.userShareText
                }
                onChangeText={
                  vm.payerMode === 'you' || vm.isEditingExisting
                    ? vm.setTotalText
                    : vm.setUserShareText
                }
                placeholder="0"
                testID={
                  vm.payerMode === 'friend' && !vm.isEditingExisting
                    ? 'split-user-share-input'
                    : 'split-total-input'
                }
              />
              <AppInputField
                leftIcon={Icon.Document}
                placeholder="What is this split for?"
                value={vm.description}
                onChangeText={vm.setDescription}
                testID="split-description-input"
              />
            </Stack>

            {vm.payerMode === 'friend' && !vm.isEditingExisting ? (
              <Stack gap="lg">
                <ListGroup header="PAID BY">
                  {vm.people.map(entry => (
                    <ListRow
                      key={entry.person.id}
                      leading={<PersonAvatar name={entry.person.name} size={32} />}
                      title={entry.person.name}
                      trailing={
                        vm.friendPayerId === entry.person.id ? (
                          <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                        ) : undefined
                      }
                      onPress={() => vm.setFriendPayerId(entry.person.id)}
                    />
                  ))}
                </ListGroup>
                <ListGroup header="REPAYMENT TREATMENT">
                  <ListRow
                    leading={
                      <IconTile
                        icon={vm.friendRepayable ? Icon.SwapHorizontal : Icon.Heart}
                        tint={vm.friendRepayable ? 'primary' : 'income'}
                      />
                    }
                    title="Repayable?"
                    subtitle={
                      vm.friendRepayable
                        ? 'Creates an open payable you owe them.'
                        : 'Treated as non-repayable gift/treat.'
                    }
                    trailing={
                      <AppToggle value={vm.friendRepayable} onValueChange={vm.setFriendRepayable} />
                    }
                    wrap
                  />
                </ListGroup>
              </Stack>
            ) : (
              <Stack gap="lg">
                <Stack gap="sm">
                  <AppText variant="overline" color="secondary" style={styles.sectionOverline}>
                    PARTICIPANTS
                  </AppText>
                  <Inline gap="sm" flexWrap="wrap">
                    {vm.people.map(entry => {
                      const selected = vm.selectedPersonIds.includes(entry.person.id);
                      return (
                        <Pressable
                          key={entry.person.id}
                          onPress={() => vm.toggleParticipant(entry.person.id)}
                          testID={`split-participant-toggle-${entry.person.id}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[
                            styles.personChip,
                            {
                              backgroundColor: selected
                                ? withOpacity(theme.primary, Opacity.soft)
                                : theme.surface,
                              borderColor: selected ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <PersonAvatar name={entry.person.name} size={26} />
                          <AppText
                            variant="body"
                            weight={selected ? 'semibold' : 'medium'}
                            color={selected ? 'primary' : 'text'}
                          >
                            {entry.person.name}
                          </AppText>
                          {selected ? (
                            <AppIcon name={Icon.Check} size={Size.iconXs} color={theme.primary} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </Inline>
                  <Inline gap="sm" alignItems="center">
                    <Box flex={1}>
                      <AppInputField
                        placeholder="Quick add person"
                        value={vm.newPersonName}
                        onChangeText={vm.setNewPersonName}
                      />
                    </Box>
                    <AppButton
                      size="sm"
                      variant="outline"
                      onPress={() => void vm.onQuickAddPerson()}
                    >
                      Add
                    </AppButton>
                  </Inline>
                </Stack>

                <Stack gap="sm">
                  <AppSegmentedControl
                    options={[
                      { id: 'equal', label: 'Equal split' },
                      { id: 'custom', label: 'Custom amounts' },
                    ]}
                    value={vm.splitMethod}
                    onChange={value => vm.setSplitMethod(value === 'custom' ? 'custom' : 'equal')}
                    flex
                  />
                  {vm.splitMethod === 'custom' ? (
                    <Stack gap="sm">
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
                    </Stack>
                  ) : null}
                </Stack>

                {vm.splitPreview.valid ? (
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
                ) : null}

                {!vm.isEditingExisting ? (
                  <ListGroup header="PAID WITH">
                    {vm.fundingAccounts.map(account => (
                      <ListRow
                        key={account.id}
                        leading={<IconTile icon={Icon.Wallet} tint="primary" />}
                        title={account.name}
                        subtitle={account.currencyCode}
                        trailing={
                          vm.fundingAccountId === account.id ? (
                            <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                          ) : undefined
                        }
                        onPress={() => vm.handleSelectFundingAccount(account.id)}
                      />
                    ))}
                  </ListGroup>
                ) : null}
              </Stack>
            )}

            <ListGroup header="EXPENSE CATEGORY">
              {vm.expenseAccounts.map(account => (
                <ListRow
                  key={account.id}
                  leading={<IconTile icon={Icon.Tag} tint="expense" />}
                  title={account.name}
                  subtitle={account.currencyCode}
                  trailing={
                    vm.expenseAccountId === account.id ? (
                      <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                    ) : undefined
                  }
                  onPress={() => vm.setExpenseAccountId(account.id)}
                />
              ))}
            </ListGroup>
          </Stack>
        </ScrollView>

        <SubmitFooter
          label="Save split"
          disabled={vm.isSubmitting}
          loading={vm.isSubmitting}
          onPress={() => void vm.onSubmit()}
          testID="split-expense-submit-button"
        />
      </View>
    </ScreenWithChrome>
  );
}

export const SplitExpenseScreen = withPrivacyScope(SplitExpenseScreenContent);

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionOverline: {
    paddingHorizontal: Spacing.xs,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    minHeight: Size.touchTarget,
  },
});
