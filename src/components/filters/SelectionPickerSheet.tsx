import { AppIcon, AppInput, AppText, Icon, ListRow, type IconName } from '@/src/components/core';
import { ListVariantContext } from '@/src/components/core/ListRow';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SelectionCheckmark } from '@/src/components/shared/SelectionIndicator';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Keyboard, SectionList, StyleSheet, View } from 'react-native';

export interface SelectionOption<T extends string | number = string> {
  id: T;
  label: string;
  description?: string;
  icon?: IconName;
  /** Custom leading node; wins over `icon`. */
  leading?: ReactNode;
  /** Trailing secondary text (e.g. currency code). */
  meta?: string;
  /** Extra searchable text (e.g. currency symbol) not shown in the row. */
  keywords?: string;
  testID?: string;
}

export interface SelectionSection<T extends string | number = string> {
  title: string;
  data: SelectionOption<T>[];
}

export interface SelectionPickerSheetProps<T extends string | number> {
  visible: boolean;
  title: string;
  /** Flat option list. Ignored when `sections` is provided. */
  options?: SelectionOption<T>[];
  /** Sectioned option list (e.g. Popular / All). */
  sections?: SelectionSection<T>[];
  selectedValue: T;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (value: T) => void;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  selectedBackgroundColor?: string;
  showSearch?: boolean;
  maxHeightPercent?: number;
  fixedHeight?: boolean;
  accessibilityCloseLabel?: string;
  closeTestID?: string;
}

function optionMatches<T extends string | number>(option: SelectionOption<T>, query: string) {
  return (
    option.label.toLowerCase().includes(query) ||
    option.description?.toLowerCase().includes(query) ||
    option.meta?.toLowerCase().includes(query) ||
    option.keywords?.toLowerCase().includes(query) ||
    String(option.id).toLowerCase().includes(query)
  );
}

export function SelectionPickerSheet<T extends string | number>({
  visible,
  title,
  options,
  sections,
  selectedValue,
  searchPlaceholder = AppConfig.strings.common.searchPlaceholder,
  emptyMessage,
  onClose,
  onSelect,
  actionLabel,
  onAction,
  actionTestID,
  selectedBackgroundColor,
  showSearch,
  maxHeightPercent = 80,
  fixedHeight = true,
  accessibilityCloseLabel = 'Close selection',
  closeTestID,
}: SelectionPickerSheetProps<T>) {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const wash = selectedBackgroundColor ?? withOpacity(theme.primary, Opacity.selection);

  const flatOptions = useMemo(() => options ?? [], [options]);
  const sourceSections = useMemo((): SelectionSection<T>[] => {
    if (sections) return sections;
    return flatOptions.length ? [{ title: '', data: flatOptions }] : [];
  }, [sections, flatOptions]);

  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sourceSections;
    const data = sourceSections
      .flatMap(section => section.data)
      .filter(o => optionMatches(o, query));
    return data.length ? [{ title: '', data }] : [];
  }, [sourceSections, searchQuery]);

  const optionCount = useMemo(
    () => sourceSections.reduce((count, section) => count + section.data.length, 0),
    [sourceSections],
  );
  const useSections = Boolean(sections) || filteredSections.some(section => section.title);
  const searchEnabled = showSearch ?? optionCount > 10;

  const closeAndReset = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (value: T) => {
    onSelect(value);
    Keyboard.dismiss();
    closeAndReset();
  };

  const renderOption = (item: SelectionOption<T>) => {
    const isSelected = selectedValue === item.id;
    const leading =
      item.leading ??
      (item.icon ? (
        <AppIcon
          name={item.icon}
          size={20}
          color={isSelected ? theme.primary : theme.textSecondary}
        />
      ) : undefined);

    return (
      <ListRow
        title={item.label}
        subtitle={item.description}
        leading={leading}
        trailing={
          <>
            {item.meta ? (
              <AppText variant="caption" color="secondary" weight="medium">
                {item.meta}
              </AppText>
            ) : null}
            <SelectionCheckmark selected={isSelected} size={18} />
          </>
        }
        chevron={false}
        onPress={() => handleSelect(item.id)}
        accessibilityState={{ selected: isSelected }}
        style={isSelected ? { backgroundColor: wash } : undefined}
        testID={item.testID}
      />
    );
  };

  return (
    <ModalSurface
      keyboardAvoiding
      visible={visible}
      title={title}
      onClose={closeAndReset}
      position="bottomSheet"
      fixedHeight={fixedHeight}
      scrollable={false}
      maxHeightPercent={maxHeightPercent}
      contentStyle={[styles.body, !fixedHeight && styles.fitContent]}
      accessibilityCloseLabel={accessibilityCloseLabel}
      closeTestID={closeTestID}
    >
      {searchEnabled ? (
        <View style={styles.searchContainer}>
          <AppInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={Icon.Search}
          />
        </View>
      ) : null}

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

      <ListVariantContext.Provider value="plain">
        {useSections ? (
          <SectionList
            keyboardShouldPersistTaps="always"
            sections={filteredSections}
            keyExtractor={item => String(item.id)}
            style={[styles.list, !fixedHeight && styles.fitContent]}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) =>
              section.title ? (
                <View style={styles.sectionHeader}>
                  <AppText variant="caption" color="secondary" weight="bold">
                    {section.title.toUpperCase()}
                  </AppText>
                </View>
              ) : null
            }
            renderItem={({ item }) => renderOption(item)}
            ListEmptyComponent={
              emptyMessage ? (
                <View style={styles.empty}>
                  <AppText variant="body" color="secondary" style={styles.emptyText}>
                    {emptyMessage}
                  </AppText>
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            keyboardShouldPersistTaps="always"
            data={filteredSections[0]?.data ?? []}
            keyExtractor={item => String(item.id)}
            style={[styles.list, !fixedHeight && styles.fitContent]}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => renderOption(item)}
            ListEmptyComponent={
              emptyMessage ? (
                <View style={styles.empty}>
                  <AppText variant="body" color="secondary" style={styles.emptyText}>
                    {emptyMessage}
                  </AppText>
                </View>
              ) : null
            }
          />
        )}
      </ListVariantContext.Provider>
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
  // Content-sized sheets need the list's intrinsic height. A zero flex basis
  // collapses the list when the modal only supplies a maximum height.
  // Reset flex too: native Yoga gives positive flex a zero basis even with auto.
  fitContent: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  sectionHeader: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
});
