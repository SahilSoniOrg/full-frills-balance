import {
  AppButton,
  AppText,
  Badge,
  EmptyStateView,
  ErrorStateView,
  Icon,
  IconButton,
  InlineSearchField,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { MetricHeroCard } from '@/src/components/shared/MetricHeroCard';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { Size, Spacing } from '@/src/constants/design-tokens';
import {
  flowSignForAmount,
  signColorKey,
  signPrefix,
} from '@/src/domain/accounting/presentationPolicy';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PersonCard } from '../components/PersonCard';
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
            autoFocus={false}
            editable
          />
          {!isSearching ? <PrivacyToggleButton /> : null}
        </View>
      ),
    }),
    [isSearching, setIncludeArchived, setQuery, vm.includeArchived, vm.query],
  );

  const netSign = flowSignForAmount(netBalance);
  const netColor = signColorKey(netSign);
  const hasFilters = Boolean(vm.query.trim()) || vm.includeArchived;
  const archivedOnlyHidden = !hasFilters && vm.people.length === 0 && vm.hasArchivedPeople;

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
                hasFilters ? 'Reset filters' : archivedOnlyHidden ? 'Show archived' : 'Add person'
              }
              onPrimaryAction={
                hasFilters
                  ? () => {
                      vm.setQuery('');
                      vm.setIncludeArchived(false);
                    }
                  : archivedOnlyHidden
                    ? () => vm.setIncludeArchived(true)
                    : () => AppNavigation.toPersonCreation()
              }
            />
          ) : (
            <Stack gap="none">
              <AppText
                variant="caption"
                color="secondary"
                weight="semibold"
                style={styles.sectionLabel}
              >
                {`PEOPLE (${vm.people.length})`}
              </AppText>
              {vm.people.map(row => (
                <PersonCard
                  key={row.person.id}
                  row={row}
                  fallbackCurrencyCode={vm.defaultCurrencyCode}
                  onPress={() => AppNavigation.toPersonDetails(row.person.id)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </ScrollView>
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
  sectionLabel: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
});
