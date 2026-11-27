import {
  AppButton,
  AppIcon,
  AppInputField,
  AppText,
  Badge,
  EmptyStateView,
  ErrorStateView,
  Icon,
  IconButton,
  IconTile,
  InlineSearchField,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { AccountPickerModal } from '@/src/components/account-selection';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { MetricHeroCard } from '@/src/components/shared/MetricHeroCard';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { Opacity, Size, Spacing } from '@/src/constants/design-tokens';
import {
  flowSignForAmount,
  signColorKey,
  signPrefix,
} from '@/src/domain/accounting/presentationPolicy';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Inline, Stack } from '@/src/design-system';
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
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

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

  if (vm.isLoading && !vm.people.length) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading />
      </ScreenWithChrome>
    );
  }
  if (vm.loadError && !vm.people.length) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <ErrorStateView message={vm.loadError} onRetry={vm.reload} />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Stack gap="lg" style={styles.contentColumn}>
          <MetricHeroCard
            title="Shared Books"
            amount={Math.abs(netBalance)}
            currencyCode={vm.defaultCurrencyCode}
            amountColor={theme[netColor]}
            prefix={signPrefix(netSign)}
            middle={
              <Inline justifyContent="flex-end">
                <Badge size="sm">{`${vm.activePeopleCount} active`}</Badge>
              </Inline>
            }
            left={{
              dotColor: theme.income,
              label: 'Owed to you',
              amount: primaryOwedToYou,
              moneyColor: primaryOwedToYou > 0 ? 'income' : 'secondary',
            }}
            right={{
              dotColor: theme.expense,
              label: 'You owe',
              amount: primaryYouOwe,
              moneyColor: primaryYouOwe > 0 ? 'expense' : 'secondary',
            }}
            footer={
              secondaryCurrencies.length > 0 ? (
                <AppText variant="caption" color="secondary">
                  {secondaryCurrencies.join(' · ')}
                </AppText>
              ) : undefined
            }
          />

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
                hasFilters ? 'Reset filters' : archivedOnlyHidden ? 'Show archived' : 'Link account'
              }
              onPrimaryAction={
                hasFilters
                  ? () => {
                      vm.setQuery('');
                      vm.setIncludeArchived(false);
                    }
                  : archivedOnlyHidden
                    ? () => vm.setIncludeArchived(true)
                    : vm.openLink
              }
            />
          ) : (
            <ListGroup
              header={`PEOPLE (${vm.people.length})`}
              headerAccessory={
                <Inline gap="xs">
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onPress={vm.openLink}
                    testID="people-link-existing-account-button"
                  >
                    Link account
                  </AppButton>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onPress={() => AppNavigation.toPersonCreation()}
                  >
                    New person
                  </AppButton>
                </Inline>
              }
            >
              {vm.people.map(row => (
                <ListRow
                  key={row.person.id}
                  leading={
                    <PersonAvatar
                      name={row.person.name}
                      icon={row.person.icon}
                      color={row.person.color}
                      size={44}
                      style={
                        row.person.color
                          ? undefined
                          : {
                              borderWidth: 1,
                              borderColor: withOpacity(theme.primary, Opacity.medium),
                            }
                      }
                    />
                  }
                  title={
                    <Inline gap="sm" alignItems="center" flexWrap="wrap">
                      <AppText variant="body" weight="semibold">
                        {row.person.name}
                      </AppText>
                      {row.person.isPinned ? (
                        <AppIcon name={Icon.Star} size={Size.iconXs} color="primary" />
                      ) : null}
                      {row.person.defaultCurrencyCode ? (
                        <Badge size="sm">{row.person.defaultCurrencyCode}</Badge>
                      ) : null}
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
          <ModalActions
            actions={[
              { label: 'Cancel', role: 'secondary', onPress: vm.closeModal },
              {
                label: 'Save',
                onPress: () => void handleLinkAccount(),
                disabled: !canSaveLink,
                loading: vm.busy,
              },
            ]}
          />
        }
      >
        <Stack gap="lg">
          <ListGroup header="1. SELECT UNLINKED ACCOUNT">
            {vm.accountsLoading ? (
              <LoadingView loading variant="inline" text="Loading accounts" />
            ) : null}
            {vm.accountsError ? (
              <ErrorStateView
                variant="inline"
                message={vm.accountsError}
                onRetry={vm.retryAccounts}
              />
            ) : null}
            <ListRow
              leading={<IconTile icon={Icon.Bank} tint="asset" />}
              title={
                vm.accounts.find(account => account.id === vm.selectedAccountId)?.name ??
                'Choose account'
              }
              subtitle={
                vm.accounts.find(account => account.id === vm.selectedAccountId)?.currencyCode ??
                'No account selected'
              }
              chevron
              onPress={() => {
                if (!vm.accountsLoading && !vm.accountsError) setAccountPickerOpen(true);
              }}
              testID="people-link-account-picker-button"
            />
          </ListGroup>

          <ListGroup header="2. CHOOSE PERSON OR CREATE NEW">
            {vm.linkablePeople.map(entry => (
              <ListRow
                key={entry.person.id}
                leading={
                  <PersonAvatar
                    name={entry.person.name}
                    icon={entry.person.icon}
                    color={entry.person.color}
                    size={32}
                  />
                }
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
      <AccountPickerModal
        visible={accountPickerOpen}
        accounts={vm.accounts}
        selectedId={vm.selectedAccountId || undefined}
        title="Select unlinked account"
        onClose={() => setAccountPickerOpen(false)}
        onSelect={id => {
          vm.setSelectedAccountId(id);
          setAccountPickerOpen(false);
        }}
      />
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
