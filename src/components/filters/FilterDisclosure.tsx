import {
  AppCard,
  AppIcon,
  AppText,
  FilterChipButton,
  Icon,
  type SegmentedOption,
} from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { Inline, Stack } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { IconName } from '@/src/types/domainIcons';
import { useCallback } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';

export interface FilterChipConfig {
  label: string;
  icon?: IconName;
  isActive?: boolean;
  onPress: () => void;
  testID?: string;
}

export type FilterGroup =
  | {
      label: string;
      options: readonly SegmentedOption<string>[];
      value: string;
      onChange: (value: string) => void;
    }
  | {
      label: string;
      chip: FilterChipConfig;
    };

export interface FilterDisclosureProps {
  isExpanded: boolean;
  onToggle: () => void;
  collapsedTitle: string;
  collapsedDetails: string;
  expandedTitle?: string;
  groups: readonly FilterGroup[];
  testID?: string;
}

function FilterLabel({ children }: { children: string }) {
  return (
    <AppText variant="caption" color="secondary" weight="bold" style={styles.filterLabel}>
      {children.toUpperCase()}
    </AppText>
  );
}

function FilterGroupView({ group }: { group: FilterGroup }) {
  return (
    <View style={styles.filterGroup}>
      <FilterLabel>{group.label}</FilterLabel>
      {'options' in group ? (
        <Inline gap="sm" wrap>
          {group.options.map(option => (
            <FilterChipButton
              key={option.id}
              label={option.label}
              isActive={option.id === group.value}
              onPress={() => group.onChange(option.id)}
            />
          ))}
        </Inline>
      ) : (
        <FilterChipButton {...group.chip} />
      )}
    </View>
  );
}

export function FilterDisclosure({
  isExpanded,
  onToggle,
  collapsedTitle,
  collapsedDetails,
  expandedTitle = 'Change what is included',
  groups,
  testID,
}: FilterDisclosureProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const handleToggle = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  }, [onToggle, reduceMotion]);

  return (
    <AppCard variant="ghost" paddingSize="md">
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} report filters`}
        accessibilityState={{ expanded: isExpanded }}
        testID={testID}
        style={({ pressed }) => [styles.disclosure, pressed && styles.disclosurePressed]}
      >
        <View style={[styles.disclosureIcon, { backgroundColor: theme.primaryLight }]}>
          <AppIcon name={Icon.Sliders} size={17} color="primary" />
        </View>
        <View style={styles.disclosureCopy}>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {isExpanded ? expandedTitle : collapsedTitle}
          </AppText>
          {!isExpanded ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {collapsedDetails}
            </AppText>
          ) : null}
        </View>
        <AppIcon
          name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={18}
          color="textSecondary"
        />
      </Pressable>

      {isExpanded ? (
        <Stack gap="md" style={[styles.filterPanel, { borderTopColor: theme.divider }]}>
          {groups.map(group => (
            <FilterGroupView key={group.label} group={group} />
          ))}
        </Stack>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  disclosurePressed: { opacity: 0.78 },
  disclosureIcon: {
    width: 36,
    height: 36,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclosureCopy: { flex: 1, gap: Spacing.xs },
  filterPanel: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  filterGroup: { gap: Spacing.xs },
  filterLabel: { letterSpacing: 0.8 },
});
