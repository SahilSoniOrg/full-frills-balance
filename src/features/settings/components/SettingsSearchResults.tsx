import { ListGroup, Icon, SearchField } from '@/src/components/core';
import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import type { SettingsSearchItem } from '@/src/features/settings/components/settingsSections';
import { filterSettingsSearchItems } from '@/src/features/settings/components/settingsSections';
import { useMemo, type RefObject } from 'react';
import { StyleSheet, TextInput } from 'react-native';

type SettingsSearchResultsProps = {
  query: string;
  onQueryChange: (query: string) => void;
  items: SettingsSearchItem[];
  inputRef?: RefObject<TextInput | null>;
};

export function SettingsSearchResults({
  query,
  onQueryChange,
  items,
  inputRef,
}: SettingsSearchResultsProps) {
  const results = useMemo(() => filterSettingsSearchItems(items, query), [items, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <Stack gap="md">
      <SearchField
        ref={inputRef}
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search settings…"
        accessibilityLabel="Search settings"
        clearAccessibilityLabel="Clear settings search"
        testID="settings-search-input"
        clearTestID="clear-settings-search"
      />

      {!hasQuery ? null : results.length === 0 ? (
        <EmptyStateView
          icon={Icon.Search}
          title="No settings found"
          subtitle="Try a broader term, like “privacy” or “appearance”."
          style={styles.empty}
        />
      ) : (
        <ListGroup
          variant="plain"
          header="Search results"
          items={results}
          toRow={item => ({
            id: item.id,
            icon: item.icon,
            title: item.title,
            subtitle: `${item.section} · ${item.description}`,
            onPress: () => item.navigate(item.focusId),
            testID: `settings-search-result-${item.id}`,
          })}
        />
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 0,
    paddingVertical: Spacing.xl,
  },
});
