import {
  AppButton,
  AppCard,
  AppIcon,
  AppInputField,
  AppText,
  Badge,
  EmptyStateView,
  Icon,
  IconButton,
  IconTile,
  InlineSearchField,
  ListGroup,
  ListRow,
  PersonAvatar,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { MetricBreakdownRow } from '@/src/components/shared/MetricBreakdownRow';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { usePeopleListViewModel } from '../hooks/usePeopleListViewModel';

export function PeopleListScreen() {
  const vm = usePeopleListViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  const [isSearching, setIsSearching] = useState(false);

  const primaryOwedToYou = useMemo(
    () =>
      vm.balanceTotals.owedToYou.find(([currency]) => currency === vm.defaultCurrencyCode)?.[1] ??
      0,
    [vm.balanceTotals.owedToYou, vm.defaultCurrencyCode],
  );
  const primaryYouOwe = useMemo(
    () =>
      vm.balanceTotals.youOwe.find(([currency]) => currency === vm.defaultCurrencyCode)?.[1] ?? 0,
    [vm.balanceTotals.youOwe, vm.defaultCurrencyCode],
  );
  const netBalance = primaryOwedToYou - primaryYouOwe;
  const secondaryCurrencies = useMemo(() => {
    const entries: string[] = [];
    for (const [currency, amount] of vm.balanceTotals.owedToYou) {
      if (currency !== vm.defaultCurrencyCode && amount > 0) {
        entries.push(`+${formatMoneyAmount(amount, currency, isPrivacyMode)} owed`);
      }
    }
    for (const [currency, amount] of vm.balanceTotals.youOwe) {
      if (currency !== vm.defaultCurrencyCode && amount > 0) {
        entries.push(`-${formatMoneyAmount(amount, currency, isPrivacyMode)} owing`);
      }
    }
    return entries;
  }, [vm.balanceTotals, vm.defaultCurrencyCode, isPrivacyMode]);

  const { setQuery, setIncludeArchived } = vm;
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      kind: 'tab',
      screenTitle: 'People',
      isSearchActive: isSearching,
      headerActions: (
        <View style={[styles.headerActions, isSearching && styles.headerActionsSearchActive]}>
          {!isSearching ? (
            <IconButton
              name={Icon.Archive}
              size={Size.iconSm}
              variant={vm.includeArchived ? 'primary' : 'surface'}
              onPress={() => setIncludeArchived(current => !current)}
              testID="people-show-archived-button"
              accessibilityLabel={vm.includeArchived ? 'Hide archived' : 'Show archived'}
              accessibilityState={{ selected: vm.includeArchived }}
            />
          ) : null}
          <InlineSearchField
            value={vm.query}
            onChangeText={setQuery}
            onExpandChange={setIsSearching}
            placeholder="Search people..."
            autoFocus={!vm.modal}
            editable={!vm.modal}
          />
          {!isSearching ? <PrivacyToggleButton /> : null}
        </View>
      ),
    }),
    [isSearching, setIncludeArchived, setQuery, vm.includeArchived, vm.modal, vm.query],
  );

  const handleAddPerson = async () => {
    try {
      await vm.addPerson();
      toast.success('Person added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add person.');
    }
  };

  const handleLinkAccount = async () => {
    try {
      await vm.linkAccount();
      toast.success('Account linked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link account.');
    }
  };

  const netColor = netBalance > 0 ? 'income' : netBalance < 0 ? 'expense' : 'primary';
  const hasFilters = Boolean(vm.query.trim()) || vm.includeArchived;

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Stack gap="lg">
          <AppCard
            elevation="md"
            padding="xl"
            radius="xxxl"
            style={{ backgroundColor: theme.surface }}
          >
            <Stack gap="md">
              <Inline justifyContent="space-between" alignItems="center" gap="sm">
                <AppText variant="subheading" color="secondary">
                  Shared Books
                </AppText>
                <Badge size="sm">{`${vm.activePeopleCount} active`}</Badge>
              </Inline>

              <MoneyText
                amount={netBalance}
                currencyCode={vm.defaultCurrencyCode}
                formatStyle="compact"
                variant="title"
                prefix={netBalance > 0 ? '+' : undefined}
                color={netColor}
                style={styles.heroAmount}
              />

              <View style={styles.breakdownContainer}>
                <MetricBreakdownRow
                  dotColor={theme.income}
                  label="Owed to you"
                  amount={primaryOwedToYou}
                  currencyCode={vm.defaultCurrencyCode}
                  moneyColor="income"
                />
                <Separator vertical background="divider" style={styles.verticalDivider} />
                <MetricBreakdownRow
                  dotColor={theme.expense}
                  label="You owe"
                  amount={primaryYouOwe}
                  currencyCode={vm.defaultCurrencyCode}
                  moneyColor="expense"
                />
              </View>

              {secondaryCurrencies.length > 0 ? (
                <AppText variant="caption" color="secondary">
                  {secondaryCurrencies.join(' · ')}
                </AppText>
              ) : null}

              <Separator background="divider" />

              <Inline gap="sm" alignItems="center">
                <Box flex={1}>
                  <AppButton variant="primary" size="md" onPress={vm.openCreate}>
                    Add person
                  </AppButton>
                </Box>
                <Box flex={1}>
                  <AppButton variant="outline" size="md" onPress={vm.openLink}>
                    Link existing account
                  </AppButton>
                </Box>
              </Inline>
            </Stack>
          </AppCard>

          {hasFilters ? (
            <Inline justifyContent="space-between" alignItems="center" paddingHorizontal="xs">
              <AppText variant="caption" color="secondary">
                {[
                  vm.query.trim() ? `Filtered by "${vm.query.trim()}"` : null,
                  vm.includeArchived ? 'Including archived' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              <AppButton
                variant="ghost"
                size="sm"
                onPress={() => {
                  vm.setQuery('');
                  vm.setIncludeArchived(false);
                }}
              >
                Reset
              </AppButton>
            </Inline>
          ) : null}

          {vm.people.length === 0 ? (
            <EmptyStateView
              title={vm.query.trim() ? 'No matching people' : 'No people yet'}
              subtitle={
                vm.query.trim()
                  ? 'Try a different name or reset filters.'
                  : 'Add a person to track shared balances.'
              }
              icon={Icon.User}
              primaryActionLabel={vm.query.trim() ? 'Clear search' : 'Add person'}
              onPrimaryAction={vm.query.trim() ? () => vm.setQuery('') : vm.openCreate}
            />
          ) : (
            <ListGroup header={`PEOPLE (${vm.people.length})`}>
              {vm.people.map(row => (
                <ListRow
                  key={row.person.id}
                  leading={
                    <PersonAvatar
                      name={row.person.name}
                      size={44}
                      style={{
                        borderWidth: 1,
                        borderColor: withOpacity(theme.primary, Opacity.medium),
                      }}
                    />
                  }
                  title={
                    <Inline gap="sm" alignItems="center" flexWrap="wrap">
                      <AppText variant="body" weight="semibold">
                        {row.person.name}
                      </AppText>
                      {row.person.archivedAt ? <Badge size="sm">Archived</Badge> : null}
                      {row.hasNegativeUnassignedRemainder ? (
                        <Badge size="sm" variant="warning">
                          Negative remainder
                        </Badge>
                      ) : null}
                    </Inline>
                  }
                  subtitle={
                    <PersonBalanceBadge
                      summary={row.balanceSummary}
                      personName={row.person.name}
                      compact
                      formatAmount={(amount, currencyCode) =>
                        formatMoneyAmount(amount, currencyCode, isPrivacyMode)
                      }
                    />
                  }
                  chevron
                  wrap
                  onPress={() => AppNavigation.toPersonDetails(row.person.id)}
                />
              ))}
            </ListGroup>
          )}
        </Stack>
      </ScrollView>

      <ModalSurface
        visible={vm.modal === 'create'}
        title="Add person"
        onClose={vm.closeModal}
        position="center"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={vm.closeModal}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton
                loading={vm.busy}
                disabled={vm.busy}
                onPress={() => void handleAddPerson()}
              >
                Save
              </AppButton>
            </Box>
          </Inline>
        }
      >
        <Stack gap="sm">
          <AppText variant="caption" color="secondary">
            Create an offline ledger profile to split bills, lend, or record repayments.
          </AppText>
          <AppInputField
            placeholder="Person name"
            value={vm.personName}
            onChangeText={vm.setPersonName}
            autoFocus
          />
        </Stack>
      </ModalSurface>

      <ModalSurface
        visible={vm.modal === 'link'}
        title="Link existing account"
        onClose={vm.closeModal}
        position="bottomSheet"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={vm.closeModal}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton
                loading={vm.busy}
                disabled={vm.busy}
                onPress={() => void handleLinkAccount()}
              >
                Save
              </AppButton>
            </Box>
          </Inline>
        }
      >
        <Stack gap="lg">
          <ListGroup header="1. SELECT UNLINKED ACCOUNT">
            {vm.accounts.length === 0 ? (
              <ListRow title="No unlinked compatible accounts" />
            ) : (
              vm.accounts.map(account => (
                <ListRow
                  key={account.id}
                  leading={<IconTile icon={Icon.Bank} tint="asset" />}
                  title={account.name}
                  subtitle={`${account.accountType} · ${account.currencyCode}`}
                  trailing={
                    vm.selectedAccountId === account.id ? (
                      <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                    ) : undefined
                  }
                  onPress={() => vm.setSelectedAccountId(account.id)}
                />
              ))
            )}
          </ListGroup>

          <ListGroup header="2. CHOOSE PERSON OR CREATE NEW">
            {vm.people.map(entry => (
              <ListRow
                key={entry.person.id}
                leading={<PersonAvatar name={entry.person.name} size={32} />}
                title={entry.person.name}
                trailing={
                  vm.selectedPersonId === entry.person.id ? (
                    <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                  ) : undefined
                }
                onPress={() => vm.setSelectedPersonId(entry.person.id)}
              />
            ))}
          </ListGroup>

          <AppInputField
            placeholder="Or create new person name"
            value={vm.personName}
            onChangeText={vm.setPersonName}
          />
        </Stack>
      </ModalSurface>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerActionsSearchActive: {
    flex: 1,
    minWidth: 0,
  },
  heroAmount: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  breakdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  verticalDivider: {
    alignSelf: 'stretch',
    borderRadius: Shape.radius.full,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
});
