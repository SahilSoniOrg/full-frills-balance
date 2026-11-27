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
import { titleAmountFit } from '@/src/components/shared/FitText';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import {
  flowSignForAmount,
  signColorKey,
  signPrefix,
} from '@/src/domain/accounting/presentationPolicy';
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
        entries.push(`Owed ${formatMoneyAmount(amount, currency, isPrivacyMode)}`);
      }
    }
    for (const [currency, amount] of vm.balanceTotals.youOwe) {
      if (currency !== vm.defaultCurrencyCode && amount > 0) {
        entries.push(`Owe ${formatMoneyAmount(amount, currency, isPrivacyMode)}`);
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

  const handleLinkAccount = async () => {
    try {
      const saved = await vm.linkAccount();
      if (saved) toast.success('Account linked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link account.');
    }
  };

  const netSign = flowSignForAmount(netBalance);
  const netColor = signColorKey(netSign);
  const hasFilters = Boolean(vm.query.trim()) || vm.includeArchived;
  const archivedOnlyHidden = !hasFilters && vm.people.length === 0 && vm.hasArchivedPeople;
  const canSaveLink =
    !vm.busy &&
    Boolean(vm.selectedAccountId) &&
    Boolean(vm.selectedPersonId || vm.personName.trim());

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Stack gap="lg" style={styles.contentColumn}>
          <AppCard
            elevation="sm"
            padding="lg"
            radius="xxl"
            style={{ backgroundColor: theme.surface }}
          >
            <Stack gap="md">
              <Inline justifyContent="space-between" alignItems="center" gap="sm">
                <AppText variant="subheading" color="secondary">
                  Shared Books
                </AppText>
                <Badge size="sm">{`${vm.activePeopleCount} active`}</Badge>
              </Inline>

              <Stack gap="xs">
                <AppText variant="caption" color="secondary">
                  Net balance
                </AppText>
                <MoneyText
                  amount={Math.abs(netBalance)}
                  currencyCode={vm.defaultCurrencyCode}
                  formatStyle="default"
                  variant="title"
                  prefix={signPrefix(netSign)}
                  color={netColor}
                  fit={titleAmountFit}
                  style={styles.heroAmount}
                />
              </Stack>

              <Separator background="divider" />

              <View style={styles.breakdownContainer}>
                <BalanceBreakdown
                  label="Owed to you"
                  amount={primaryOwedToYou}
                  currencyCode={vm.defaultCurrencyCode}
                  moneyColor={primaryOwedToYou > 0 ? 'income' : 'secondary'}
                />
                <Separator vertical background="divider" style={styles.verticalDivider} />
                <BalanceBreakdown
                  label="You owe"
                  amount={primaryYouOwe}
                  currencyCode={vm.defaultCurrencyCode}
                  moneyColor={primaryYouOwe > 0 ? 'expense' : 'secondary'}
                />
              </View>

              {secondaryCurrencies.length > 0 ? (
                <AppText variant="caption" color="secondary">
                  {secondaryCurrencies.join(' · ')}
                </AppText>
              ) : null}
            </Stack>
          </AppCard>

          {hasFilters && vm.people.length > 0 ? (
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
              title={
                hasFilters
                  ? 'No matching people'
                  : archivedOnlyHidden
                    ? 'All people are archived'
                    : 'No people yet'
              }
              subtitle={
                hasFilters
                  ? 'Try a different name or reset active filters.'
                  : archivedOnlyHidden
                    ? 'Turn on archived people to view or restore past ledgers.'
                    : 'Use the Add button in the tab bar to start tracking shared balances.'
              }
              icon={archivedOnlyHidden ? Icon.Archive : Icon.User}
              primaryActionLabel={
                hasFilters ? 'Reset filters' : archivedOnlyHidden ? 'Show archived' : undefined
              }
              onPrimaryAction={
                hasFilters
                  ? () => {
                      vm.setQuery('');
                      vm.setIncludeArchived(false);
                    }
                  : archivedOnlyHidden
                    ? () => vm.setIncludeArchived(true)
                    : undefined
              }
            />
          ) : (
            <ListGroup
              header={`PEOPLE (${vm.people.length})`}
              headerAccessory={
                <AppButton
                  variant="ghost"
                  size="sm"
                  onPress={vm.openLink}
                  testID="people-link-existing-account-button"
                >
                  Link account
                </AppButton>
              }
            >
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
                      fallbackCurrencyCode={vm.defaultCurrencyCode}
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
                disabled={!canSaveLink}
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
                onPress={() => vm.selectPersonForLink(entry.person.id)}
              />
            ))}
          </ListGroup>

          <AppInputField
            placeholder={
              vm.selectedPersonId
                ? 'Selected person above (tap again to enter a new name)'
                : 'Or create new person name'
            }
            value={vm.personName}
            onChangeText={vm.setPersonName}
            editable={!vm.selectedPersonId}
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
    marginTop: Spacing.none,
    marginBottom: Spacing.none,
  },
  breakdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  breakdownItem: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  verticalDivider: {
    alignSelf: 'stretch',
    borderRadius: Shape.radius.full,
  },
  contentColumn: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
});

function BalanceBreakdown({
  label,
  amount,
  currencyCode,
  moneyColor,
}: {
  label: string;
  amount: number;
  currencyCode: string;
  moneyColor: 'income' | 'expense' | 'secondary';
}) {
  return (
    <View style={styles.breakdownItem}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <MoneyText
        amount={amount}
        currencyCode={currencyCode}
        formatStyle="default"
        variant="body"
        weight="semibold"
        color={moneyColor}
      />
    </View>
  );
}
