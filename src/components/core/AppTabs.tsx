import { Opacity, Spacing } from '@/src/constants';
import { Box, Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { memo } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

export interface TabOption<T extends string | number = string> {
  id: T;
  label: string;
  badge?: string | number;
}

interface AppTabsProps<T extends string | number> {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'underline' | 'pill'; // For future flexibility, default to underline
  testID?: string;
}

/**
 * AppTabs - A shared tab navigation component with a modern underline indicator.
 * Optimized for use in feature headers like Hub and Commitments.
 */
function AppTabsComponent<T extends string | number>({
  options,
  value,
  onChange,
  testID,
}: AppTabsProps<T>) {
  const { theme } = useTheme();

  return (
    <Box
      flexDirection="row"
      borderBottomWidth={1}
      borderColor="border"
      paddingHorizontal="lg"
      accessibilityRole="tablist"
      testID={testID}
    >
      <Stack direction="row" gap="sm">
        {options.map(option => {
          const isSelected = option.id === value;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => onChange(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              activeOpacity={Opacity.heavy}
              testID={testID ? `${testID}-item-${option.id}` : `tab-item-${option.id}`}
              style={[
                styles.tab,
                isSelected && {
                  borderBottomColor: theme.primary,
                  borderBottomWidth: 2,
                },
              ]}
            >
              <Box flexDirection="row" alignItems="center" gap="xs">
                <Text
                  variant="base"
                  weight={isSelected ? 'bold' : 'medium'}
                  style={{ color: isSelected ? theme.primary : theme.textSecondary }}
                >
                  {option.label}
                </Text>
                {option.badge !== undefined && (
                  <Box
                    background={isSelected ? 'primary' : 'surfaceSecondary'}
                    paddingHorizontal="xs"
                    borderRadius="full"
                    minWidth={20}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text
                      variant="xs"
                      weight="bold"
                      style={{
                        color: isSelected ? theme.onPrimary : theme.textSecondary,
                        fontSize: 10,
                      }}
                    >
                      {option.badge}
                    </Text>
                  </Box>
                )}
              </Box>
            </TouchableOpacity>
          );
        })}
      </Stack>
    </Box>
  );
}

const styles = StyleSheet.create({
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: -1, // Overlap with container border
  },
});

export const AppTabs = memo(AppTabsComponent) as <T extends string | number>(
  props: AppTabsProps<T>,
) => React.ReactElement;
