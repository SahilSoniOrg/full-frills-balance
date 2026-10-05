import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import { Icon, AppIcon, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';

const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_RETRY_MS = 50;

function useRevealHorizontalItem(selectedId: string, itemIds: readonly string[]) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const itemRefs = useRef(new Map<string, View>());

  const scrollToId = useCallback(
    (id: string) => {
      if (!id) return false;

      const itemNode = itemRefs.current.get(id);
      const contentNode = contentRef.current;
      if (!itemNode || !contentNode || !scrollRef.current) return false;

      const index = itemIds.indexOf(id);
      const fallbackX = index >= 0 ? index * TILE_ESTIMATED_WIDTH : 0;

      itemNode.measureLayout(
        contentNode,
        x => {
          scrollRef.current?.scrollTo({
            x: Math.max(0, x - Spacing.lg),
            animated: true,
          });
        },
        () => {
          scrollRef.current?.scrollTo({
            x: Math.max(0, fallbackX - Spacing.lg),
            animated: true,
          });
        },
      );
      return true;
    },
    [itemIds],
  );

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const scroll = () => {
      if (cancelled || attempts >= MAX_SCROLL_ATTEMPTS) return;
      attempts += 1;
      if (!scrollToId(selectedId)) {
        retryTimer = setTimeout(scroll, SCROLL_RETRY_MS);
      }
    };

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(scroll);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [scrollToId, selectedId]);

  const registerItemRef = useCallback((id: string, node: View | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  return { scrollRef, contentRef, registerItemRef };
}

export interface SelectionTileProps {
  id: string;
  label: string;
  icon?: IconName;
  color: string;
  /** Semantic category color, kept separate from the account identity color. */
  categoryColor?: string;
}

export interface SelectionTileListProps {
  items: SelectionTileProps[];
  selectedId: string;
  onSelect: (id: string) => void;
  allowDeselect?: boolean;
}

const TILE_ESTIMATED_WIDTH = 140;

type SelectionTileRowProps = {
  item: SelectionTileProps;
  isSelected: boolean;
  allowDeselect: boolean;
  onSelect: (id: string) => void;
};

const SelectionTileRow = React.memo(function SelectionTileRow({
  item,
  isSelected,
  allowDeselect,
  onSelect,
}: SelectionTileRowProps) {
  const { theme } = useTheme();
  const defaultBorderColor = withOpacity(theme.textSecondary, Opacity.muted);
  const showSelectedFill = isSelected;
  const showCheckmark = isSelected;

  const tileStyle: ViewStyle = {
    backgroundColor: theme.surface,
    borderColor: defaultBorderColor,
    borderStyle: 'solid',
    borderWidth: 1,
    opacity: 1,
  };

  if (showSelectedFill) {
    tileStyle.backgroundColor = withOpacity(item.color, Opacity.soft);
    tileStyle.borderColor = withOpacity(item.color, Opacity.medium);
  }

  return (
    <TouchableOpacity
      testID={`selection-tile-${item.id}`}
      style={[styles.tile, tileStyle]}
      onPress={() => onSelect(isSelected && allowDeselect ? '' : item.id)}
    >
      <Inline align="center" space="sm">
        <AccountCategoryPill
          color={(item.categoryColor ?? item.color) as string}
          opacity={isSelected ? 1 : Opacity.soft}
        />
        {item.icon ? (
          <AppIcon
            name={item.icon}
            size={Size.iconXs}
            color={item.color}
            fallbackIcon={Icon.Wallet}
          />
        ) : (
          <AppIcon name={Icon.Wallet} size={Size.iconXs} color={item.color} />
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
            <AppIcon name={Icon.CheckCircle} size={Size.iconSm} color={item.color} />
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
  allowDeselect = false,
}) => {
  const itemIds = items.map(item => item.id);
  const { scrollRef, contentRef, registerItemRef } = useRevealHorizontalItem(selectedId, itemIds);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.bleed}>
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
                  allowDeselect={allowDeselect}
                  onSelect={onSelect}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -Spacing.lg,
  },
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
