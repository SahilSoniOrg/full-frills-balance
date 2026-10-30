import { AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useWindowSafeAreaLayout } from '@/src/design-system/SafeArea';
import { useTheme } from '@/src/hooks/use-theme';
import { PRIMARY_TABS, primaryTabFromRouteName } from '@/src/navigation/primaryNavigation';
import { PRIMARY_PAGES, primaryRouteForGroup } from '@/src/navigation/primaryPages';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { toast } from '@/src/utils/alerts';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { ContextualAddMenu, type ContextualAddAction } from './ContextualAddMenu';

const TAB_BAR_ROW_HEIGHT = Size.fab;
/** How far Add sits above the flat bar (Instagram / Path overlap pattern). */
const ADD_RAISE = Spacing.sm;
const ADD_SLOT_SIZE = Size.buttonLg + Spacing.xs;

export type PrimaryTabBarProps = {
  routes: readonly { key: string; name: string }[];
  activeRouteName: string;
  emitTabPress: (routeKey: string) => boolean;
  emitTabLongPress: (routeKey: string) => void;
  onNavigateToPage: (routeName: string) => void;
  isSwitching: boolean;
  isTransitioning: boolean;
  allowTransitionNavigation?: boolean;
  /** Six-leaf native position, supplied by Home V2 only. */
  pageProgress?: SharedValue<number>;
  onAddAction: (action: ContextualAddAction) => void;
};

export function PrimaryTabBar({
  routes,
  activeRouteName,
  emitTabPress,
  emitTabLongPress,
  onNavigateToPage,
  isSwitching,
  isTransitioning,
  allowTransitionNavigation = false,
  pageProgress,
  onAddAction,
}: PrimaryTabBarProps) {
  const { theme } = useTheme();
  const { isKeyboardVisible } = useKeyboard();
  const { insets } = useWindowSafeAreaLayout();
  const activeTab = primaryTabFromRouteName(activeRouteName) ?? 'dashboard';
  const barColor = theme.background;

  if (isKeyboardVisible) return null;

  const renderTab = (copy: (typeof PRIMARY_TABS)[number]) => {
    const targetRouteName = primaryRouteForGroup(copy.tab);
    const targetRoute = routes.find(route => route.name === targetRouteName);
    const selected = activeTab === copy.tab;
    return (
      <PressScaleTouchable
        key={copy.tab}
        disabled={isSwitching || (!allowTransitionNavigation && isTransitioning) || !targetRoute}
        onPress={() => {
          if (!targetRoute) return;
          const prevented = emitTabPress(targetRoute.key);
          if ((!selected || (allowTransitionNavigation && isTransitioning)) && !prevented)
            onNavigateToPage(targetRouteName);
        }}
        onLongPress={() => {
          if (targetRoute) emitTabLongPress(targetRoute.key);
          toast.info(AppConfig.strings.navigation.tabDescriptions[copy.tab], {
            key: 'navigation-help',
          });
        }}
        accessibilityRole="tab"
        accessibilityState={{
          selected,
          disabled: isSwitching || (!allowTransitionNavigation && isTransitioning) || !targetRoute,
        }}
        accessibilityLabel={copy.label}
        accessibilityHint={AppConfig.strings.navigation.tabDescriptions[copy.tab]}
        testID={`tab-${copy.tab}`}
        style={styles.tabItem}
        pressScale="subtle"
      >
        <TabVisual copy={copy} selected={selected} pageProgress={pageProgress} />
      </PressScaleTouchable>
    );
  };

  return (
    <View
      testID="primary-tab-bar"
      style={[
        styles.tabBar,
        {
          backgroundColor: barColor,
          borderTopColor: withOpacity(theme.border, Opacity.muted),
          // String boxShadow (design-token form) — object form doesn’t paint on Moti/native here.
          boxShadow: `0px -2px 8px ${withOpacity('#000000', Opacity.shadow)}`,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left + Spacing.xs,
          paddingRight: insets.right + Spacing.xs,
        },
      ]}
      accessibilityRole="tablist"
    >
      <View style={styles.tabRow}>
        {PRIMARY_TABS.slice(0, 2).map(renderTab)}
        <View style={styles.addItem}>
          <View style={[styles.addHalo, { backgroundColor: barColor }]} />
          <ContextualAddMenu
            primaryTab={activeTab}
            disabled={isSwitching || isTransitioning}
            bottomOffset={(TAB_BAR_ROW_HEIGHT - ADD_SLOT_SIZE) / 2 + ADD_RAISE}
            onAction={onAddAction}
          />
        </View>
        {PRIMARY_TABS.slice(2).map(renderTab)}
      </View>
    </View>
  );
}

/** Both paints stay mounted: native progress blends selection without React per frame. */
function TabVisual({
  copy,
  selected,
  pageProgress,
}: {
  copy: (typeof PRIMARY_TABS)[number];
  selected: boolean;
  pageProgress?: SharedValue<number>;
}) {
  const { theme } = useTheme();
  const indices = PRIMARY_PAGES.flatMap((page, index) => (page.group === copy.tab ? [index] : []));
  const first = indices[0];
  const last = indices[indices.length - 1];
  // Group ranges hold selection steady across sibling leaves.
  const selectionProgress = useDerivedValue(() =>
    pageProgress
      ? Math.max(0, 1 - Math.max(first - pageProgress.value, pageProgress.value - last, 0))
      : selected
        ? 1
        : 0,
  );
  const emphasis = useAnimatedStyle(() => ({ opacity: selectionProgress.value }));
  const inactive = useAnimatedStyle(() => ({ opacity: 1 - selectionProgress.value }));
  const inactiveColor = getReadableColor(theme.textSecondary, theme.background);
  const selectedLabelColor = getReadableColor(theme.primary, theme.background);
  const selectedIconColor = getReadableColor(theme.primary, theme.primaryLight, 3);
  return (
    <View
      style={styles.tabVisual}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.tabVisual, inactive]}>
        <View collapsable={false} style={styles.tabIcon}>
          <AppIcon name={copy.icon} size={Size.iconMd} color={inactiveColor} strokeWidth={2} />
        </View>
        <AppText
          variant="caption"
          weight="medium"
          style={[styles.tabLabel, { color: inactiveColor }]}
          numberOfLines={2}
          textBreakStrategy="balanced"
        >
          {copy.label}
        </AppText>
      </Animated.View>
      <Animated.View style={[styles.selectedVisual, emphasis]}>
        <View collapsable={false} style={[styles.tabIcon, { backgroundColor: theme.primaryLight }]}>
          <AppIcon
            name={copy.icon}
            size={Size.iconMd}
            color={selectedIconColor}
            strokeWidth={2.5}
          />
        </View>
        <AppText
          variant="caption"
          weight="semibold"
          style={[styles.tabLabel, { color: selectedLabelColor }]}
          numberOfLines={2}
          textBreakStrategy="balanced"
        >
          {copy.label}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    overflow: 'visible',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabRow: {
    minHeight: TAB_BAR_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
    zIndex: 1,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    minHeight: TAB_BAR_ROW_HEIGHT,
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  tabVisual: { width: '100%', alignItems: 'center', gap: Spacing.xs },
  selectedVisual: { ...StyleSheet.absoluteFill, alignItems: 'center', gap: Spacing.xs },
  tabIcon: {
    width: Size.xxl,
    height: Size.lg,
    borderRadius: Size.lg / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    textAlign: 'center',
    width: '100%',
  },
  addItem: {
    width: ADD_SLOT_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -ADD_RAISE }],
    zIndex: 2,
  },
  addHalo: {
    ...StyleSheet.absoluteFill,
    borderRadius: Shape.radius.lg + Spacing.xs,
    transform: [{ scale: 1.3 }],
  },
});
