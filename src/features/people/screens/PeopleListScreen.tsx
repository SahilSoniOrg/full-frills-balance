import {
  AppButton,
  AppText,
  EmptyStateView,
  ErrorStateView,
  Icon,
  IconButton,
  InlineSearchField,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { Inline, Stack } from '@/src/design-system';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  PeopleBalanceOverview,
  PeopleBalanceOverviewSecondary,
} from '../components/PeopleBalanceOverview';
import { PersonCard } from '../components/PersonCard';
import { usePeopleListViewModel } from '../hooks/usePeopleListViewModel';

export function PeopleListScreen() {
  const vm = usePeopleListViewModel();
  const [isSearching, setIsSearching] = useState(false);

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
          {!isSearching && !vm.query.trim() && vm.activePeopleCount > 0 ? (
            <PeopleBalanceOverview
              currencyCode={vm.balanceOverview.currencyCode}
              owedToYou={vm.balanceOverview.owedToYou}
              youOwe={vm.balanceOverview.youOwe}
            >
              {vm.balanceOverview.secondaryCurrencyLines.length > 0 ? (
                <PeopleBalanceOverviewSecondary
                  entries={vm.balanceOverview.secondaryCurrencyLines}
                />
              ) : null}
            </PeopleBalanceOverview>
          ) : null}

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
              <SectionLabel
                label={`People (${vm.people.length})`}
                marginTop="none"
                style={styles.sectionLabel}
              />
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
    paddingHorizontal: Spacing.xs,
  },
});
