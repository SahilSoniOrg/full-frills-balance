import { AppButton, AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { SelectionCheckmark } from '@/src/components/shared/SelectionIndicator';
import { Layout, Opacity, Size, Spacing } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { useTheme } from '@/src/hooks/use-theme';
import type { IconName } from '@/src/types/domainIcons';
import { withOpacity } from '@/src/utils/color-math';
import React, { useCallback, useMemo, type ReactNode } from 'react';
import {
  FlatList,
  Keyboard,
  SectionList,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';

const renderKeyboardAwareScrollView = (props: ScrollViewProps) => (
  <KeyboardAwareScrollView useNativeScrollView {...props} />
);

export interface SelectableItem {
  id: string;
  name: string;
  icon?: IconName;
  symbol?: string;
  color?: string;
  subtitle?: string;
}

export interface SelectableGridProps {
  title: string;
  subtitle: string;
  items: SelectableItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => ReactNode;
  headerContent?: ReactNode;
  listFooterContent?: ReactNode;
  emptyMessage?: string;
  validationMessage?: string;
  sections?: { title: string; data: SelectableItem[] }[];
}

const SelectableGridItem = React.memo(function SelectableGridItem({
  item,
  isSelected,
  onToggle,
  renderIcon,
  renderSubtitle,
}: {
  item: SelectableItem;
  isSelected: boolean;
  onToggle: (id: string) => void;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => ReactNode;
}) {
  const { theme } = useTheme();
  const accent = theme.primary;
  const { id, name, icon, symbol, subtitle } = item;

  return (
    <View style={styles.itemWrapper}>
      <PressScaleTouchable
        onPress={() => onToggle(id)}
        activeOpacity={Opacity.heavy}
        style={styles.itemPressable}
        accessibilityLabel={`${name}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityRole="checkbox"
        accessibilityHint="Double tap to select or deselect"
        accessibilityState={{ checked: isSelected }}
        testID={`grid-item-${id}`}
      >
        <Box
          borderRadius="r3"
          style={[
            styles.itemContainer,
            {
              borderWidth: 1.5,
              borderColor: isSelected ? accent : theme.border,
            },
          ]}
          unsafe_backgroundRaw={isSelected ? withOpacity(accent, Opacity.selection) : theme.surface}
          padding="md"
          justifyContent="space-between"
        >
          <Inline justify="space-between" align="flex-start" marginBottom="md">
            <Box
              width={Size.xl}
              height={Size.xl}
              borderRadius="full"
              justifyContent="center"
              alignItems="center"
              unsafe_backgroundRaw={isSelected ? withOpacity(accent, Opacity.soft) : undefined}
              style={!isSelected && styles.iconCircleBase}
            >
              {renderIcon ? (
                renderIcon(item, isSelected)
              ) : icon ? (
                <AppIcon name={icon} size={Size.iconMd} color={isSelected ? accent : theme.text} />
              ) : symbol ? (
                <AppText variant="heading" style={{ color: isSelected ? accent : theme.text }}>
                  {symbol}
                </AppText>
              ) : null}
            </Box>
            <SelectionCheckmark selected={isSelected} size={Size.iconMd} color={accent} />
          </Inline>

          <Stack space="xs">
            <AppText
              variant="subheading"
              style={{ color: isSelected ? accent : theme.text }}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {name}
            </AppText>
            {renderSubtitle ? (
              renderSubtitle(item, isSelected)
            ) : subtitle ? (
              <AppText
                variant="caption"
                color="secondary"
                style={{
                  color: isSelected ? withOpacity(accent, Opacity.strong) : theme.textSecondary,
                }}
              >
                {subtitle}
              </AppText>
            ) : null}
          </Stack>
        </Box>
      </PressScaleTouchable>
    </View>
  );
});

/** Full-screen multi-select grid with title + Continue/Back footer (setup wizards). */
export function SelectableGrid({
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
  onContinue,
  onBack,
  isCompleting,
  renderIcon,
  renderSubtitle,
  headerContent,
  listFooterContent,
  emptyMessage,
  validationMessage,
  sections,
}: SelectableGridProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggle = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      onToggle(id);
    },
    [onToggle],
  );

  const renderItem = useCallback(
    ({ item }: { item: SelectableItem }) => (
      <SelectableGridItem
        item={item}
        isSelected={selectedSet.has(item.id)}
        onToggle={handleToggle}
        renderIcon={renderIcon}
        renderSubtitle={renderSubtitle}
      />
    ),
    [selectedSet, handleToggle, renderIcon, renderSubtitle],
  );

  const listHeader = (
    <Stack paddingTop="xl" paddingBottom="xxl" space="lg">
      <Stack align="center" space="xs">
        <AppText variant="title" style={styles.headerTitle}>
          {title}
        </AppText>
        <AppText variant="body" color="secondary" style={styles.headerSubtitle}>
          {subtitle}
        </AppText>
      </Stack>
      {headerContent}
    </Stack>
  );

  const listFooter = listFooterContent ? (
    <Box paddingTop="lg" paddingBottom="xxl">
      {listFooterContent}
    </Box>
  ) : null;

  const listEmpty = emptyMessage ? (
    <Box paddingVertical="xxxxl" alignItems="center">
      <AppText variant="body" color="secondary" style={styles.emptyMessage}>
        {emptyMessage}
      </AppText>
    </Box>
  ) : null;

  const listProps = {
    style: styles.scrollContainer,
    contentContainerStyle: styles.scrollContent,
    showsVerticalScrollIndicator: false,
    keyboardShouldPersistTaps: 'always' as const,
    keyboardDismissMode: 'interactive' as const,
    ListHeaderComponent: listHeader,
    ListFooterComponent: listFooter,
    ListEmptyComponent: listEmpty,
    renderScrollComponent: renderKeyboardAwareScrollView,
  };

  const selectableList = sections ? (
    <SectionList
      {...listProps}
      sections={sections.map(section => ({
        ...section,
        data: Array.from({ length: Math.ceil(section.data.length / 2) }, (_, index) =>
          section.data.slice(index * 2, index * 2 + 2),
        ),
      }))}
      renderItem={({ item: row }) => (
        <View style={styles.grid}>
          {row.map(item => (
            <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>
          ))}
        </View>
      )}
      keyExtractor={(row: SelectableItem[]) => row.map(item => item.id).join('-')}
      renderSectionHeader={({ section }) => (
        <Box paddingTop="md" paddingBottom="xs" background="background">
          <AppText variant="subheading" weight="semibold">
            {section.title}
          </AppText>
        </Box>
      )}
    />
  ) : (
    <FlatList
      {...listProps}
      data={items}
      renderItem={renderItem}
      keyExtractor={(item: SelectableItem) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.grid}
    />
  );

  return (
    <Box flex={1}>
      {selectableList}

      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="md">
        <Stack space="xs">
          {validationMessage ? (
            <AppText
              variant="caption"
              color="error"
              accessibilityRole="alert"
              style={styles.validationMessage}
            >
              {validationMessage}
            </AppText>
          ) : null}
          <AppButton
            variant="primary"
            size="lg"
            onPress={onContinue}
            disabled={isCompleting}
            style={{ width: '100%' }}
            testID="selectable-grid-continue-button"
          >
            Continue
          </AppButton>
          <AppButton
            variant="ghost"
            size="md"
            onPress={onBack}
            disabled={isCompleting}
            testID="selectable-grid-back-button"
          >
            Back
          </AppButton>
        </Stack>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  headerTitle: {
    textAlign: 'center',
  },
  headerSubtitle: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyMessage: {
    textAlign: 'center',
  },
  validationMessage: {
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  itemWrapper: {
    flex: 1,
    flexBasis: '46%',
    margin: '2%',
  },
  itemPressable: {
    flex: 1,
  },
  itemContainer: {
    flex: 1,
    minHeight: Layout.touchTarget.minHeight,
  },
  iconCircleBase: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});
