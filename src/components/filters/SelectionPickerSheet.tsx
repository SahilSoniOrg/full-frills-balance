import { Icon, AppIcon, AppInput, AppText, type IconName } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { useTheme } from '@/src/hooks/use-theme';
import { SelectionCheckmark } from '@/src/components/shared/SelectionIndicator';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, View } from 'react-native';

export interface SelectionOption<T extends string | number = string> {
  id: T;
  label: string;
  description?: string;
  icon?: IconName;
}

export interface SelectionPickerSheetProps<T extends string | number> {
  visible: boolean;
  title: string;
  options: SelectionOption<T>[];
  selectedValue: T;
  searchPlaceholder?: string;
  onClose: () => void;
  onSelect: (value: T) => void;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  selectedBackgroundColor?: string;
  showSearch?: boolean;
}

export function SelectionPickerSheet<T extends string | number>({
  visible,
  title,
  options,
  selectedValue,
  searchPlaceholder = AppConfig.strings.common.searchPlaceholder,
  onClose,
  onSelect,
  actionLabel,
  onAction,
  actionTestID,
  selectedBackgroundColor,
  showSearch,
}: SelectionPickerSheetProps<T>) {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(query) || o.description?.toLowerCase().includes(query),
    );
  }, [options, searchQuery]);

  const closeAndReset = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (value: T) => {
    onSelect(value);
    Keyboard.dismiss();
    closeAndReset();
  };

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={closeAndReset}
      position="bottomSheet"
      fixedHeight
      scrollable={false}
      maxHeightPercent={80}
      contentStyle={styles.body}
      accessibilityCloseLabel="Close selection"
    >
      {(showSearch ?? options.length > 10) && (
        <View style={styles.searchContainer}>
          <AppInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={Icon.Search}
          />
        </View>
      )}

      {actionLabel && onAction ? (
        <PressScaleTouchable
          pressScale="subtle"
          haptic="selection"
          onPress={() => {
            onAction();
            closeAndReset();
          }}
          style={[styles.action, { borderBottomColor: theme.border }]}
          testID={actionTestID}
        >
          <AppIcon name={Icon.Plus} size={20} color={theme.primary} />
          <AppText variant="body" weight="semibold" style={{ color: theme.primary }}>
            {actionLabel}
          </AppText>
        </PressScaleTouchable>
      ) : null}

      <FlatList
        keyboardShouldPersistTaps="always"
        data={filteredOptions}
        keyExtractor={item => String(item.id)}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        renderItem={({ item }) => {
          const isSelected = selectedValue === item.id;
          return (
            <PressScaleTouchable
              pressScale="subtle"
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.optionItem,
                { borderBottomColor: theme.border },
                isSelected && {
                  backgroundColor:
                    selectedBackgroundColor ?? withOpacity(theme.primary, Opacity.selection),
                },
              ]}
              onPress={() => handleSelect(item.id)}
            >
              {item.icon && (
                <AppIcon
                  name={item.icon}
                  size={20}
                  color={isSelected ? theme.primary : theme.textSecondary}
                  style={{ marginRight: Spacing.md }}
                />
              )}
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="semibold">
                  {item.label}
                </AppText>
                {item.description && (
                  <AppText variant="caption" color="secondary">
                    {item.description}
                  </AppText>
                )}
              </View>
              <SelectionCheckmark selected={isSelected} size={18} />
            </PressScaleTouchable>
          );
        }}
      />
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 0,
  },
  searchContainer: {
    paddingBottom: Spacing.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
