import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Bleed, Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectionTileProps {
  id: string;
  label: string;
  icon?: IconName;
  color: string;
}

export interface SelectionTileListProps {
  items: SelectionTileProps[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  testIDPrefix?: string;
  allowDeselect?: boolean;
}

const TILE_ESTIMATED_WIDTH = 140;

type SelectionTileRowProps = {
  item: SelectionTileProps;
  isSelected: boolean;
  disabled: boolean;
  allowDeselect: boolean;
  testIDPrefix: string;
  onSelect: (id: string) => void;
};

const SelectionTileRow = React.memo(function SelectionTileRow({
  item,
  isSelected,
  disabled,
  allowDeselect,
  testIDPrefix,
  onSelect,
}: SelectionTileRowProps) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      testID={`${testIDPrefix}-${item.id}`}
      style={[
        styles.tile,
        {
          backgroundColor: theme.surface,
          borderColor: withOpacity(theme.textSecondary, Opacity.muted),
        },
        isSelected && {
          backgroundColor: withOpacity(item.color, Opacity.soft),
          borderColor: withOpacity(item.color, Opacity.medium),
        },
      ]}
      onPress={() => onSelect(isSelected && allowDeselect ? '' : item.id)}
      disabled={disabled}
    >
      <Inline align="center" space="sm">
        <Box
          width={4}
          height={Spacing.md}
          borderRadius="full"
          background={item.color as any}
          style={{ opacity: isSelected ? 1 : Opacity.soft }}
        />
        {item.icon && (
          <AppIcon name={item.icon} size={Size.iconXs} color={item.color} fallbackIcon="wallet" />
        )}
        <AppText
          variant="body"
          weight={isSelected ? 'semibold' : 'regular'}
          style={{ color: theme.text, flexShrink: 1 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.label}
        </AppText>
        {isSelected && <AppIcon name="checkCircle" size={Size.iconSm} color={item.color} />}
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
}) => {
  const listRef = useRef<FlashList<SelectionTileProps>>(null);
  const lastScrolledId = useRef<string | null>(null);

  const scrollToSelected = useCallback(
    (animated: boolean) => {
      if (!selectedId || lastScrolledId.current === selectedId) return;
      const index = items.findIndex(item => item.id === selectedId);
      if (index < 0) return;
      listRef.current?.scrollToIndex({ index, animated });
      lastScrolledId.current = selectedId;
    },
    [items, selectedId],
  );

  useEffect(() => {
    lastScrolledId.current = null;
    scrollToSelected(true);
  }, [selectedId, items, scrollToSelected]);

  const renderItem = useCallback(
    ({ item }: { item: SelectionTileProps }) => (
      <View style={styles.tileWrapper}>
        <SelectionTileRow
          item={item}
          isSelected={selectedId === item.id}
          disabled={disabled}
          allowDeselect={allowDeselect}
          testIDPrefix={testIDPrefix}
          onSelect={onSelect}
        />
      </View>
    ),
    [allowDeselect, disabled, onSelect, selectedId, testIDPrefix],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <Bleed horizontal="lg">
      <View style={styles.listHost}>
        <FlashList
          ref={listRef}
          horizontal
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onLoad={() => scrollToSelected(false)}
        />
      </View>
    </Bleed>
  );
};

const styles = StyleSheet.create({
  listHost: {
    minHeight: 48,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
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
});

export const selectionTileEstimatedWidth = TILE_ESTIMATED_WIDTH;
