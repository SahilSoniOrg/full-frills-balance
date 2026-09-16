import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { Icon, AppIcon, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import type { AccountTreeDropKind } from '@/src/services/accounts/accountTreeTargets';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useEffect } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_TREE_ROW_MIN_HEIGHT } from './accountTreeDragLayout';
import {
  ACCOUNT_TREE_CHILD_INTENT_BORDER_WIDTH,
  ACCOUNT_TREE_DEPTH_INDENT,
  ACCOUNT_TREE_DRAG_LIFT_SCALE,
  ACCOUNT_TREE_DRAG_LIFT_SHADOW,
  ACCOUNT_TREE_DRAG_LONG_PRESS_MS,
  ACCOUNT_TREE_FLASH_IN_MS,
  ACCOUNT_TREE_FLASH_OUT_MS,
  ACCOUNT_TREE_INSERTION_SCALE_DELTA,
  ACCOUNT_TREE_INSERTION_SCALE_FROM,
  ACCOUNT_TREE_INSERTION_TERMINAL_OFFSET,
  ACCOUNT_TREE_INSERTION_TERMINAL_SIZE,
  ACCOUNT_TREE_INTENT_MS,
  ACCOUNT_TREE_LAYOUT_EPSILON,
  ACCOUNT_TREE_MAKE_ROOM_MS,
  shouldDispatchAccountTreeDragUpdate,
  type AccountTreeDragMotion,
} from './accountTreeDragMotion';

export {
  ACCOUNT_TREE_ROW_MIN_HEIGHT,
  ACCOUNT_TREE_SECTION_HEADER_HEIGHT,
} from './accountTreeDragLayout';
export {
  ACCOUNT_TREE_DRAG_UPDATE_MIN_DELTA,
  ACCOUNT_TREE_DRAG_LIFT_SCALE,
  ACCOUNT_TREE_MAKE_ROOM_MS,
  shouldDispatchAccountTreeDragUpdate,
  type AccountTreeDragMotion,
} from './accountTreeDragMotion';

interface AccountManagementTreeRowProps {
  row: FlattenedAccountTreeRow;
  account: AccountFields;
  isOrganizing: boolean;
  isPending: boolean;
  pendingPreview?: string;
  isActive: boolean;
  isFlashing: boolean;
  dragMotion: AccountTreeDragMotion;
  isActiveSubtree: boolean;
  makeRoomOffset: number;
  dropIntent: AccountTreeDropKind | null;
  theme: ReturnType<typeof useTheme>['theme'];
  onBegin: (id: AccountId) => void;
  onUpdate: (id: AccountId, translationY: number, absoluteY: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onPress: () => void;
  onToggleTypeSection: (accountType: string) => void;
  onLayout: (accountId: AccountId, height: number) => void;
}

function AccountTreeInsertionLine({
  edge,
  color,
  visible,
  progress,
}: {
  edge: 'before' | 'after';
  color: string;
  visible: boolean;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: visible ? progress.value : 0,
    transform: [
      {
        scaleX:
          ACCOUNT_TREE_INSERTION_SCALE_FROM + progress.value * ACCOUNT_TREE_INSERTION_SCALE_DELTA,
      },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.insertionLine,
        edge === 'before' ? styles.insertionLineBefore : styles.insertionLineAfter,
        { backgroundColor: color },
        style,
      ]}
    >
      <View style={[styles.insertionTerminal, { backgroundColor: color }]} />
    </Animated.View>
  );
}

export function AccountManagementTreeRow({
  row,
  account,
  isOrganizing,
  isPending,
  pendingPreview,
  isActive,
  isFlashing,
  dragMotion,
  isActiveSubtree,
  makeRoomOffset,
  dropIntent,
  theme,
  onBegin,
  onUpdate,
  onFinish,
  onCancel,
  onPress,
  onToggleTypeSection,
  onLayout,
}: AccountManagementTreeRowProps) {
  const reduceMotion = useReducedMotion();
  const intentProgress = useSharedValue(0);
  const flashProgress = useSharedValue(0);
  const makeRoomY = useSharedValue(0);
  const lastDispatchedDragUpdate = useSharedValue<{
    translationY: number;
    absoluteY: number;
  } | null>(null);
  const { translationY: dragTranslationY, scrollDelta: dragScrollDelta, liftProgress } = dragMotion;

  useEffect(() => {
    intentProgress.value = withTiming(dropIntent ? 1 : 0, {
      duration: reduceMotion ? 0 : ACCOUNT_TREE_INTENT_MS,
    });
  }, [dropIntent, intentProgress, reduceMotion]);

  useEffect(() => {
    if (Math.abs(makeRoomY.value - makeRoomOffset) < ACCOUNT_TREE_LAYOUT_EPSILON) return;
    makeRoomY.value = withTiming(makeRoomOffset, {
      duration: reduceMotion ? 0 : ACCOUNT_TREE_MAKE_ROOM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [makeRoomOffset, makeRoomY, reduceMotion]);

  useEffect(() => {
    flashProgress.value = withTiming(isFlashing ? 1 : 0, {
      duration: reduceMotion
        ? 0
        : isFlashing
          ? ACCOUNT_TREE_FLASH_IN_MS
          : ACCOUNT_TREE_FLASH_OUT_MS,
    });
  }, [flashProgress, isFlashing, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const lift = isActiveSubtree ? liftProgress.value : 0;
    const translateY = isActiveSubtree
      ? dragTranslationY.value + dragScrollDelta.value
      : makeRoomY.value;
    const scale = reduceMotion ? 1 : 1 + lift * (ACCOUNT_TREE_DRAG_LIFT_SCALE - 1);
    return {
      transform: [{ translateY }, { scale }],
      zIndex: isActiveSubtree ? 4 : 0,
      shadowColor: ACCOUNT_TREE_DRAG_LIFT_SHADOW.color,
      shadowOffset: {
        width: 0,
        height: interpolate(lift, [0, 1], [0, ACCOUNT_TREE_DRAG_LIFT_SHADOW.offsetY]),
      },
      shadowOpacity: lift * Opacity.soft,
      shadowRadius: interpolate(lift, [0, 1], [0, ACCOUNT_TREE_DRAG_LIFT_SHADOW.radius]),
      elevation: interpolate(lift, [0, 1], [0, ACCOUNT_TREE_DRAG_LIFT_SHADOW.elevation]),
    };
  }, [dragScrollDelta, dragTranslationY, isActiveSubtree, liftProgress, makeRoomY, reduceMotion]);

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: isActiveSubtree ? liftProgress.value * Opacity.muted : 0,
  }));

  const rowSurfaceStyle = useAnimatedStyle(() => {
    const lift = isActiveSubtree ? liftProgress.value : 0;
    const flash = flashProgress.value;
    const baseBackground =
      dropIntent === 'child'
        ? theme.primaryLight
        : dropIntent === 'outside'
          ? theme.warningLight
          : isActive || lift > 0
            ? theme.surfaceSecondary
            : 'transparent';
    return {
      backgroundColor: flash > 0 ? theme.primaryLight : baseBackground,
      borderRadius: interpolate(lift, [0, 1], [0, Shape.radius.sm]),
      borderColor: dropIntent === 'child' ? theme.primary : 'transparent',
      borderWidth: dropIntent === 'child' ? ACCOUNT_TREE_CHILD_INTENT_BORDER_WIDTH : 0,
    };
  }, [
    dropIntent,
    flashProgress,
    isActive,
    isActiveSubtree,
    liftProgress,
    theme.primary,
    theme.primaryLight,
    theme.surfaceSecondary,
    theme.warningLight,
  ]);

  const gesture = Gesture.Pan()
    .activateAfterLongPress(ACCOUNT_TREE_DRAG_LONG_PRESS_MS)
    .onStart(() => {
      lastDispatchedDragUpdate.value = null;
      // eslint-disable-next-line react-hooks/immutability
      dragTranslationY.value = 0;
      runOnJS(onBegin)(account.id);
    })
    .onUpdate(event => {
      // eslint-disable-next-line react-hooks/immutability
      dragTranslationY.value = event.translationY;
      const next = { translationY: event.translationY, absoluteY: event.absoluteY };
      if (!shouldDispatchAccountTreeDragUpdate(lastDispatchedDragUpdate.value, next)) return;
      lastDispatchedDragUpdate.value = next;
      runOnJS(onUpdate)(account.id, event.translationY, event.absoluteY);
    })
    .onEnd(() => runOnJS(onFinish)())
    .onFinalize((_event, success) => {
      if (!success) runOnJS(onCancel)();
    });
  const { accentColor } = resolveAccountAppearance(account, theme);
  const recordLayout = (event: LayoutChangeEvent) =>
    onLayout(account.id, event.nativeEvent.layout.height);
  const rowPaddingLeft = Spacing.md + row.depth * ACCOUNT_TREE_DEPTH_INDENT;

  return (
    <View onLayout={recordLayout}>
      {row.sectionLabel && row.accountType && (
        <Pressable
          onPress={() => onToggleTypeSection(row.accountType!)}
          accessibilityRole="button"
          accessibilityState={{ expanded: !row.isSectionCollapsed }}
          style={[styles.sectionHeader, { backgroundColor: theme.background }]}
        >
          <AppText variant="caption" color="secondary" weight="bold">
            {row.sectionLabel}
          </AppText>
          <AppIcon
            name={row.isSectionCollapsed ? Icon.ChevronRight : Icon.ChevronDown}
            size={Size.iconXs}
            color={theme.textTertiary}
          />
        </Pressable>
      )}
      {!row.isSectionCollapsed && (
        <View>
          {isActiveSubtree && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.originGhost,
                { backgroundColor: theme.surfaceSecondary, marginLeft: rowPaddingLeft },
                ghostStyle,
              ]}
            />
          )}
          <Animated.View style={animatedStyle}>
            <Animated.View
              style={[
                styles.row,
                { paddingLeft: rowPaddingLeft, borderBottomColor: theme.divider },
                rowSurfaceStyle,
              ]}
            >
              <AccountTreeInsertionLine
                edge="before"
                color={theme.primary}
                visible={dropIntent === 'sibling-before'}
                progress={intentProgress}
              />
              <AccountTreeInsertionLine
                edge="after"
                color={theme.primary}
                visible={dropIntent === 'sibling-after'}
                progress={intentProgress}
              />
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={{ expanded: row.childCount > 0 ? row.isExpanded : undefined }}
                style={styles.rowPress}
              >
                <View style={styles.connector}>
                  {row.depth > 0 && (
                    <View style={[styles.connectorLine, { borderLeftColor: theme.divider }]} />
                  )}
                </View>
                {isOrganizing && (
                  <GestureDetector gesture={gesture}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Drag ${account.name}`}
                      accessibilityHint="Drag to reorder or change this account's parent"
                      style={styles.handle}
                    >
                      <Text style={[styles.handleText, { color: theme.textTertiary }]}>⠿</Text>
                    </Pressable>
                  </GestureDetector>
                )}
                <View style={styles.iconWrapper}>
                  <IvyIcon
                    name={account.icon}
                    fallbackIcon={getAccountFallbackIcon(account.accountType)}
                    label={account.name}
                    color={accentColor}
                    size={Size.lg}
                    shape={row.childCount > 0 ? 'square' : 'circle'}
                  />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    {isAccountArchived(account) && <ArchivedAccountIndicator emphasized />}
                    <AppText
                      variant="body"
                      weight={row.childCount > 0 ? 'bold' : 'regular'}
                      numberOfLines={1}
                      style={styles.title}
                    >
                      {account.name}
                    </AppText>
                    {row.childCount > 0 && (
                      <AppText variant="caption" color="secondary">
                        {row.childCount}
                      </AppText>
                    )}
                  </View>
                  {pendingPreview && (
                    <AppText variant="caption" color="secondary">
                      {pendingPreview}
                    </AppText>
                  )}
                  {isPending && !pendingPreview && (
                    <AppText variant="caption" color="secondary">
                      Included in staged changes
                    </AppText>
                  )}
                </View>
                {row.childCount > 0 && (
                  <AppIcon
                    name={row.isExpanded ? Icon.ChevronDown : Icon.ChevronRight}
                    size={Size.iconXs}
                    color={theme.textTertiary}
                  />
                )}
              </Pressable>
            </Animated.View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ACCOUNT_TREE_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: Spacing.md,
    overflow: 'visible',
  },
  originGhost: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: Spacing.md,
    borderRadius: Shape.radius.sm,
  },
  rowPress: {
    flex: 1,
    minHeight: ACCOUNT_TREE_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  insertionLine: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    height: 2,
    zIndex: 1,
    borderRadius: 1,
  },
  insertionLineBefore: { top: 0 },
  insertionLineAfter: { bottom: 0 },
  insertionTerminal: {
    position: 'absolute',
    left: -ACCOUNT_TREE_INSERTION_TERMINAL_OFFSET,
    top: -ACCOUNT_TREE_INSERTION_TERMINAL_OFFSET,
    width: ACCOUNT_TREE_INSERTION_TERMINAL_SIZE,
    height: ACCOUNT_TREE_INSERTION_TERMINAL_SIZE,
    borderRadius: ACCOUNT_TREE_INSERTION_TERMINAL_SIZE / 2,
  },
  connector: { width: Spacing.sm, height: '100%', justifyContent: 'center' },
  connectorLine: { height: '70%', borderLeftWidth: 1 },
  iconWrapper: { width: Size.lg, marginRight: Spacing.sm },
  copy: { flex: 1, gap: Spacing.xs / 2, paddingVertical: Spacing.sm },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { flexShrink: 1 },
  handle: { width: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  handleText: { fontSize: Typography.sizes.lg, lineHeight: Size.iconSm },
});
