import { AccountCategoryPill } from '@/src/components/common/AccountCategoryPill';
import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { useRevealHorizontalItem } from '@/src/components/common/useRevealHorizontalItem';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Bleed, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';

export interface SelectionTileProps {
  id: string;
  label: string;
  icon?: IconName;
  color: string;
  /** Semantic category color, kept separate from the account identity color. */
  categoryColor?: string;
}

export type SelectionTilePresentation = {
  borderStyle?: 'solid' | 'dashed';
  borderWidth?: number;
  borderColor?: string;
  showSelectedFill?: boolean;
  showCheckmark?: boolean;
  opacity?: number;
};

export interface SelectionTileListProps {
  items: SelectionTileProps[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  testIDPrefix?: string;
  allowDeselect?: boolean;
  getTilePresentation?: (
    item: SelectionTileProps,
    isSelected: boolean,
  ) => SelectionTilePresentation | undefined;
  renderAccessory?: (item: SelectionTileProps, isSelected: boolean) => React.ReactNode;
}

const TILE_ESTIMATED_WIDTH = 140;

type SelectionTileRowProps = {
  item: SelectionTileProps;
  isSelected: boolean;
  disabled: boolean;
  allowDeselect: boolean;
  testIDPrefix: string;
  onSelect: (id: string) => void;
  presentation?: SelectionTilePresentation;
  accessory?: React.ReactNode;
};

const SelectionTileRow = React.memo(function SelectionTileRow({
  item,
  isSelected,
  disabled,
  allowDeselect,
  testIDPrefix,
  onSelect,
  presentation,
  accessory,
}: SelectionTileRowProps) {
  const { theme } = useTheme();
  const defaultBorderColor = withOpacity(theme.textSecondary, Opacity.muted);
  const showSelectedFill = isSelected && (presentation?.showSelectedFill ?? true);
  const showCheckmark = isSelected && (presentation?.showCheckmark ?? true);

  const tileStyle: ViewStyle = {
    backgroundColor: theme.surface,
    borderColor: presentation?.borderColor ?? defaultBorderColor,
    borderStyle: presentation?.borderStyle ?? 'solid',
    borderWidth: presentation?.borderWidth ?? 1,
    opacity: presentation?.opacity ?? 1,
  };

  if (showSelectedFill) {
    tileStyle.backgroundColor = withOpacity(item.color, Opacity.soft);
    tileStyle.borderColor = withOpacity(item.color, Opacity.medium);
  }

  return (
    <TouchableOpacity
      testID={`${testIDPrefix}-${item.id}`}
      style={[styles.tile, tileStyle]}
      onPress={() => onSelect(isSelected && allowDeselect ? '' : item.id)}
      disabled={disabled}
    >
      <Inline align="center" space="sm">
        <AccountCategoryPill
          color={(item.categoryColor ?? item.color) as string}
          opacity={isSelected ? 1 : Opacity.soft}
        />
        {accessory}
        {item.icon ? (
          <AppIcon name={item.icon} size={Size.iconXs} color={item.color} fallbackIcon="wallet" />
        ) : (
          <AppIcon name="wallet" size={Size.iconXs} color={item.color} />
        )}
        <AppText
          variant="body"
          weight={isSelected ? 'semibold' : 'regular'}
          style={{
            color: theme.text,
            flexShrink: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.label}
        </AppText>
        <View style={styles.checkmarkSlot}>
          {showCheckmark ? (
            <AppIcon name="checkCircle" size={Size.iconSm} color={item.color} />
          ) : null}
        </View>
      </Inline>
    </TouchableOpacity>
  );
});

export const SelectionTileList: React.FC<SelectionTileListProps> = ({
  items,
  selectedId,
  onSelect,
  disabled = false,
  testIDPrefix = 'selection-tile',
  allowDeselect = false,
  getTilePresentation,
  renderAccessory,
}) => {
  const itemIds = items.map(item => item.id);
  const { scrollRef, contentRef, registerItemRef } = useRevealHorizontalItem(selectedId, itemIds, {
    margin: Spacing.lg,
    estimatedItemWidth: TILE_ESTIMATED_WIDTH,
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <Bleed horizontal="lg">
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        <View ref={contentRef} style={styles.scrollContent}>
          {items.map(item => {
            const isSelected = selectedId === item.id;
            return (
              <View
                key={item.id}
                ref={node => registerItemRef(item.id, node)}
                style={styles.tileWrapper}
              >
                <SelectionTileRow
                  item={item}
                  isSelected={isSelected}
                  disabled={disabled}
                  allowDeselect={allowDeselect}
                  testIDPrefix={testIDPrefix}
                  onSelect={onSelect}
                  presentation={getTilePresentation?.(item, isSelected)}
                  accessory={renderAccessory?.(item, isSelected)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Bleed>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
  },
  tileWrapper: {
    marginRight: Spacing.sm,
  },
  tile: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    minWidth: 100,
    maxWidth: 240,
  },
  checkmarkSlot: {
    width: Size.iconSm,
    alignItems: 'center',
  },
});
