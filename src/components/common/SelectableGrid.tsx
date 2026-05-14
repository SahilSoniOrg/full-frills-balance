import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Layout, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import { FlatList, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
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
  maxSelection?: number;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  accentColor?: string;
  footerActionLabel?: string;
  bottomContent?: React.ReactNode;
  disableAnimation?: boolean;
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
  }: SelectableGridItemProps) => {
    const { id, name, icon, symbol, subtitle } = item;

    const content = (
      <TouchableOpacity
        onPress={() => onToggle(id)}
        disabled={isAtMax}
        activeOpacity={Opacity.heavy}
        accessibilityLabel={`${name}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: isAtMax }}
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
              numberOfLines={1}
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
        from={{ opacity: 0, scale: 0.9, translateY: 15 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{
          type: 'spring',
          damping: 15,
          stiffness: 120,
          delay: Math.min(50 + index * 30, 300),
        }}
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
      prev.item.color === next.item.color
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
  maxSelection,
  renderIcon,
  renderSubtitle,
  accentColor,
  footerActionLabel = 'Continue',
  bottomContent,
  disableAnimation = false,
}) => {
  const { theme } = useTheme();
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
    ],
  );

  return (
    <Box flex={1}>
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
        ListHeaderComponent={
          <Stack align="center" paddingTop="lg" paddingBottom="md" space="xs">
            <AppText variant="title" style={{ textAlign: 'center' }}>
              {title}
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              style={{ textAlign: 'center', paddingHorizontal: Spacing.xl }}
            >
              {subtitle}
            </AppText>
          </Stack>
        }
      />

      {bottomContent && <Box paddingHorizontal="lg">{bottomContent}</Box>}

      <Stack paddingBottom={0} space="sm">
        <AppButton
          variant="primary"
          size="lg"
          onPress={onContinue}
          disabled={isCompleting}
          style={{ width: '100%' }}
        >
          {footerActionLabel}
        </AppButton>
        <AppButton variant="ghost" size="md" onPress={onBack} disabled={isCompleting}>
          Back
        </AppButton>
      </Stack>
    </Box>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xs,
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
  itemContainer: {
    minHeight: Layout.touchTarget.minHeight,
  },
  iconCircleBase: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});
