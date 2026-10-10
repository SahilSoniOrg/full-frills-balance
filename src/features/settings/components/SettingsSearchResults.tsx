import {
  ListGroup,
  Icon,
  AppIcon,
  AppInput,
  AppText,
  PressScaleTouchable,
} from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import type { SettingsSearchItem } from '@/src/features/settings/components/settingsSections';
import { useTheme } from '@/src/hooks/use-theme';
import { filterSettingsSearchItems } from '@/src/features/settings/components/settingsSections';
import { useMemo, type RefObject } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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
          leftIcon={Icon.Search}
          inputStyle={hasQuery ? styles.inputWithClear : undefined}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search settings"
          testID="settings-search-input"
          ref={inputRef}
        />
        {hasQuery && (
          <PressScaleTouchable
            pressScale="subtle"
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
            <AppIcon name={Icon.Close} size={18} color={theme.textSecondary} />
          </PressScaleTouchable>
        )}
      </View>

      {!hasQuery ? null : results.length === 0 ? (
        <Box alignItems="center" paddingVertical="xl" paddingHorizontal="lg">
          <AppIcon name={Icon.Search} size={28} color={theme.textSecondary} />
          <AppText variant="body" weight="semibold" style={{ marginTop: 10 }}>
            No settings found
          </AppText>
          <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
            Try a broader term, like “privacy” or “appearance”.
          </AppText>
        </Box>
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
