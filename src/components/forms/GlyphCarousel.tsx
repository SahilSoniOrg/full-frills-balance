import { AppIcon, AppText, type IconName } from '@/src/components/core';
import { IvyPalette, Opacity, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from 'react-native';
import { withOpacity } from '@/src/utils/color-math';

export interface GlyphCarouselItem {
  key: string;
  icon: IconName;
  label: string;
  caption?: string;
  tone: 'asset' | 'liability' | 'income' | 'expense' | 'neutral';
}
export interface GlyphCarouselProps {
  items: readonly GlyphCarouselItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  captionAction?: { label: string; onPress: () => void };
  testID?: string;
  accessibilityLabel?: string;
}

const ITEM_WIDTH = 100;
const toneColor = (tone: GlyphCarouselItem['tone'], theme: ReturnType<typeof useTheme>['theme']) =>
  tone === 'neutral' ? theme.textSecondary : theme[tone];

export function GlyphCarousel({
  items,
  selectedKey,
  onSelect,
  captionAction,
  testID,
  accessibilityLabel = copy.accountKind,
}: GlyphCarouselProps) {
  const { theme, themeMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(0);
  const listRef = useRef<FlatList<GlyphCarouselItem>>(null);
  const index = Math.max(
    0,
    items.findIndex(item => item.key === selectedKey),
  );
  const sidePadding = useMemo(() => Math.max(0, (viewportWidth - ITEM_WIDTH) / 2), [viewportWidth]);
  const measureViewport = (event: LayoutChangeEvent) =>
    setViewportWidth(event.nativeEvent.layout.width);
  useEffect(() => {
    if (items.length && viewportWidth > 0) {
      listRef.current?.scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.5 });
    }
  }, [index, items.length, reduceMotion, viewportWidth]);
  const changeIndex = useCallback(
    (delta: number) => {
      const next = Math.min(items.length - 1, Math.max(0, index + delta));
      if (next !== index) onSelect(items[next].key);
    },
    [index, items, onSelect],
  );
  const renderItem = ({ item, index: itemIndex }: ListRenderItemInfo<GlyphCarouselItem>) => {
    const selected = itemIndex === index;
    const color = toneColor(item.tone, theme);
    const diameter = selected ? 84 : 52;
    return (
      <Pressable
        testID={testID ? `${testID}-${item.key}` : undefined}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected }}
        onPress={() => onSelect(item.key)}
        style={{
          width: ITEM_WIDTH,
          alignItems: 'center',
          justifyContent: 'center',
          height: 112,
          opacity: selected ? 1 : 0.48,
        }}
      >
        <View
          style={{
            width: diameter,
            height: diameter,
            borderRadius: Size.touchTargetLg,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withOpacity(color, Opacity.soft),
          }}
        >
          <AppIcon name={item.icon} size={selected ? 36 : 24} color={color} />
        </View>
      </Pressable>
    );
  };
  return (
    <View>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: items[index]?.label ?? '' }}
        accessibilityActions={[
          { name: 'increment', label: copy.nextItem },
          { name: 'decrement', label: copy.previousItem },
        ]}
        onAccessibilityAction={event =>
          changeIndex(event.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        onLayout={measureViewport}
      >
        <FlatList
          ref={listRef}
          testID={testID ? `${testID}-list` : undefined}
          horizontal
          data={items as GlyphCarouselItem[]}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: sidePadding }}
          getItemLayout={(_, itemIndex) => ({
            length: ITEM_WIDTH,
            offset: ITEM_WIDTH * itemIndex + sidePadding,
            index: itemIndex,
          })}
          onScrollBeginDrag={() => onSelect(selectedKey)}
          onMomentumScrollEnd={event => {
            const next = Math.round(event.nativeEvent.contentOffset.x / ITEM_WIDTH);
            if (items[next] && items[next].key !== selectedKey) onSelect(items[next].key);
          }}
        />
        <AppText variant="bodyLarge" weight="semibold" align="center">
          {items[index]?.label}
        </AppText>
        {items[index]?.caption ? (
          <View
            style={{
              minHeight: 28,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {items[index]?.caption ? (
              <AppText variant="caption" color="secondary">
                {items[index].caption}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: Spacing.xs,
            marginTop: Spacing.xs,
          }}
        >
          {items.map((item, itemIndex) => (
            <View
              key={item.key}
              style={{
                width: itemIndex === index ? 16 : 5,
                height: 5,
                borderRadius: Typography.sizes.xs,
                backgroundColor: itemIndex === index ? theme.primary : theme.border,
              }}
            />
          ))}
        </View>
      </View>
      {captionAction ? (
        <View style={{ alignItems: 'center', minHeight: 28, justifyContent: 'center' }}>
          <Pressable
            onPress={captionAction.onPress}
            accessibilityRole="button"
            testID={testID ? `${testID}-caption-action` : undefined}
          >
            <AppText
              variant="caption"
              style={{ color: themeMode === 'light' ? IvyPalette.greenDark : theme.primary }}
            >
              {captionAction.label}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
