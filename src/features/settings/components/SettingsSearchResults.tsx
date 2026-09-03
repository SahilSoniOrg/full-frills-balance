import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/components/settings/SettingsMenuItem';
import type { SettingsSearchItem } from '@/src/features/settings/components/settingsSearchCatalog';
import { useTheme } from '@/src/hooks/use-theme';
import { filterSettingsSearchItems } from '@/src/features/settings/components/settingsSearchCatalog';
import { useMemo, type RefObject } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
  const { theme } = useTheme();
  const results = useMemo(() => filterSettingsSearchItems(items, query), [items, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <Stack space="md">
      <View style={styles.searchField}>
        <AppInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search settings…"
          leftIcon="search"
          inputStyle={hasQuery ? styles.inputWithClear : undefined}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search settings"
          testID="settings-search-input"
          ref={inputRef}
        />
        {hasQuery && (
          <TouchableOpacity
            onPress={() => {
              onQueryChange('');
              inputRef?.current?.focus();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear settings search"
            testID="clear-settings-search"
            style={styles.clearButton}
            hitSlop={8}
          >
            <AppIcon name="close" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {!hasQuery ? null : results.length === 0 ? (
        <Box alignItems="center" paddingVertical="xl" paddingHorizontal="lg">
          <AppIcon name="search" size={28} color={theme.textSecondary} />
          <AppText variant="body" weight="semibold" style={{ marginTop: 10 }}>
            No settings found
          </AppText>
          <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
            Try a broader term, like “privacy” or “appearance”.
          </AppText>
        </Box>
      ) : (
        <SettingsMenu header="Search results">
          {results.map(item => (
            <SettingsMenuItem
              key={item.id}
              leftIcon={<AppIcon name={item.icon} size={20} color={theme.primary} />}
              iconBackground={false}
              title={item.title}
              description={`${item.section} · ${item.description}`}
              onPress={item.onPress}
              testID={`settings-search-result-${item.id}`}
            />
          ))}
        </SettingsMenu>
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  searchField: {
    position: 'relative',
  },
  inputWithClear: {
    paddingRight: 40,
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
