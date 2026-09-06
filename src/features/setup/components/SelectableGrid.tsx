import { AppButton, AppIcon, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Layout, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import { FlatList, Keyboard, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Box, Inline, Stack } from '@/src/design-system';
import { triggerHaptic } from '@/src/utils/haptics';
import { MotiView } from 'moti';

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
  continueDisabled?: boolean;
  continueDisabledReason?: string;
  maxSelection?: number;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  accentColor?: string;
  footerActionLabel?: string;
  headerContent?: React.ReactNode;
  listFooterContent?: React.ReactNode;
  emptyMessage?: string;
  disableAnimation?: boolean;
  validationMessage?: string;
  sections?: { title: string; data: SelectableItem[] }[];
}

interface SelectableGridItemProps {
  item: SelectableItem;
  index: number;
  isSelected: boolean;
  isAtMax: boolean;
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  onToggle: (id: string) => void;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  disableAnimation?: boolean;
  reduceMotion?: boolean;
}

const SelectableGridItem = React.memo(
  ({
    item,
    index,
    isSelected,
    isAtMax,
    accentColor,
    backgroundColor,
    borderColor,
    textColor,
    secondaryTextColor,
    onToggle,
    renderIcon,
    renderSubtitle,
    disableAnimation,
    reduceMotion,
  }: SelectableGridItemProps) => {
    const { id, name, icon, symbol, subtitle } = item;

    const content = (
      <TouchableOpacity
        onPress={() => onToggle(id)}
        disabled={isAtMax}
        activeOpacity={Opacity.heavy}
        style={styles.itemPressable}
        accessibilityLabel={`${name}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: isAtMax }}
        testID={`grid-item-${id}`}
      >
        <Box
          borderRadius="r3"
          style={[
            styles.itemContainer,
            {
              borderWidth: 1.5,
              borderColor,
            },
          ]}
          unsafe_backgroundRaw={backgroundColor}
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
              unsafe_backgroundRaw={isSelected ? withOpacity(accentColor, Opacity.soft) : undefined}
              style={!isSelected && styles.iconCircleBase}
            >
              {renderIcon ? (
                renderIcon(item, isSelected)
              ) : icon ? (
                <AppIcon
                  name={icon}
                  size={Size.iconMd}
                  color={isSelected ? accentColor : textColor}
                />
              ) : symbol ? (
                <AppText variant="heading" style={{ color: isSelected ? accentColor : textColor }}>
                  {symbol}
                </AppText>
              ) : null}
            </Box>
            {isSelected && <AppIcon name="checkCircle" size={Size.iconMd} color={accentColor} />}
          </Inline>

          <Stack space="xs">
            <AppText
              variant="subheading"
              style={{ color: isSelected ? accentColor : textColor }}
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
                  color: isSelected ? withOpacity(accentColor, Opacity.strong) : secondaryTextColor,
                }}
              >
                {subtitle}
              </AppText>
            ) : null}
          </Stack>
        </Box>
      </TouchableOpacity>
    );

    if (disableAnimation) {
      return <View style={styles.itemWrapper}>{content}</View>;
    }

    return (
      <MotiView
        from={{
          opacity: 0,
          scale: reduceMotion ? 1 : 0.9,
          translateY: reduceMotion ? 0 : 15,
        }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={
          reduceMotion
            ? { type: 'timing', duration: 100 }
            : {
                type: 'spring',
                damping: 15,
                stiffness: 120,
                delay: Math.min(50 + index * 30, 300),
              }
        }
        style={styles.itemWrapper}
      >
        {content}
      </MotiView>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.isAtMax === next.isAtMax &&
      prev.accentColor === next.accentColor &&
      prev.backgroundColor === next.backgroundColor &&
      prev.borderColor === next.borderColor &&
      prev.textColor === next.textColor &&
      prev.secondaryTextColor === next.secondaryTextColor &&
      // Deep field check for the item itself
      prev.item.id === next.item.id &&
      prev.item.name === next.item.name &&
      prev.item.icon === next.item.icon &&
      prev.item.symbol === next.item.symbol &&
      prev.item.subtitle === next.item.subtitle &&
      prev.item.color === next.item.color &&
      prev.reduceMotion === next.reduceMotion
    );
  },
);

SelectableGridItem.displayName = 'SelectableGridItem';

export const SelectableGrid: React.FC<SelectableGridProps> = ({
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
  onContinue,
  onBack,
  isCompleting,
  continueDisabled = false,
  continueDisabledReason,
  maxSelection,
  renderIcon,
  renderSubtitle,
  accentColor,
  footerActionLabel = 'Continue',
  headerContent,
  listFooterContent,
  emptyMessage,
  disableAnimation = false,
  validationMessage,
  sections,
}) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const effectiveAccentColor = accentColor || theme.primary;

  // Kill O(n^2) selection lookups
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggle = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      if (maxSelection && selectedSet.size >= maxSelection && !selectedSet.has(id)) {
        triggerHaptic('warning');
        return;
      }
      onToggle(id);
    },
    [maxSelection, onToggle, selectedSet],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SelectableItem; index: number }) => {
      const isSelected = selectedSet.has(item.id);
      const isAtMax = maxSelection !== undefined && selectedSet.size >= maxSelection && !isSelected;

      return (
        <SelectableGridItem
          item={item}
          index={index}
          isSelected={isSelected}
          isAtMax={isAtMax}
          accentColor={effectiveAccentColor}
          backgroundColor={
            isSelected ? withOpacity(effectiveAccentColor, Opacity.selection) : theme.surface
          }
          borderColor={isSelected ? effectiveAccentColor : theme.border}
          textColor={theme.text}
          secondaryTextColor={theme.textSecondary}
          onToggle={handleToggle}
          renderIcon={renderIcon}
          renderSubtitle={renderSubtitle}
          disableAnimation={disableAnimation}
          reduceMotion={reduceMotion}
        />
      );
    },
    [
      selectedSet,
      theme,
      effectiveAccentColor,
      maxSelection,
      renderIcon,
      renderSubtitle,
      handleToggle,
      disableAnimation,
      reduceMotion,
    ],
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

  const selectableList = sections ? (
    <SectionList
      sections={sections.map(section => ({
        ...section,
        data: Array.from({ length: Math.ceil(section.data.length / 2) }, (_, index) =>
          section.data.slice(index * 2, index * 2 + 2),
        ),
      }))}
      renderItem={({ item: row, index }) => (
        <View style={styles.grid}>
          {row.map((item, itemIndex) => (
            <React.Fragment key={item.id}>
              {renderItem({ item, index: index * 2 + itemIndex } as {
                item: SelectableItem;
                index: number;
              })}
            </React.Fragment>
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
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="interactive"
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={listEmpty}
    />
  ) : (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item: SelectableItem) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.grid}
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="interactive"
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
    />
  );

  return (
    <Box flex={1}>
      {selectableList}

      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="md">
        <Stack space="xs">
          {validationMessage && (
            <AppText
              variant="caption"
              color="error"
              accessibilityRole="alert"
              style={styles.validationMessage}
            >
              {validationMessage}
            </AppText>
          )}
          <AppButton
            variant="primary"
            size="lg"
            onPress={onContinue}
            disabled={isCompleting || continueDisabled}
            style={{ width: '100%' }}
            testID="selectable-grid-continue-button"
          >
            {footerActionLabel}
          </AppButton>
          {continueDisabledReason ? (
            <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              {continueDisabledReason}
            </AppText>
          ) : null}
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
};

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
