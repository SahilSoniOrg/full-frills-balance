import { AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useWindowSafeAreaLayout } from '@/src/design-system/SafeArea';
import { useTheme } from '@/src/hooks/use-theme';
import { PRIMARY_TABS, primaryTabFromRouteName } from '@/src/navigation/primaryNavigation';
import { primaryRouteForGroup } from '@/src/navigation/primaryPages';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { toast } from '@/src/utils/alerts';
import { StyleSheet, View } from 'react-native';
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
  onAddAction,
}: PrimaryTabBarProps) {
  const { theme } = useTheme();
  const { isKeyboardVisible } = useKeyboard();
  const { insets } = useWindowSafeAreaLayout();
  const activeTab = primaryTabFromRouteName(activeRouteName) ?? 'dashboard';
  const barColor = theme.background;
  const selectedLabelColor = getReadableColor(theme.primary, barColor);
  const inactiveLabelColor = getReadableColor(theme.textSecondary, barColor);
  const selectedIconColor = getReadableColor(theme.primary, theme.primaryLight, 3);

  if (isKeyboardVisible) return null;

  const renderTab = (copy: (typeof PRIMARY_TABS)[number]) => {
    const targetRouteName = primaryRouteForGroup(copy.tab);
    const targetRoute = routes.find(route => route.name === targetRouteName);
    const selected = activeTab === copy.tab;
    return (
      <PressScaleTouchable
        key={copy.tab}
        disabled={isSwitching || isTransitioning || !targetRoute}
        onPress={() => {
          if (!targetRoute) return;
          const prevented = emitTabPress(targetRoute.key);
          if (!selected && !prevented) onNavigateToPage(targetRouteName);
        }}
        onLongPress={() => {
          if (targetRoute) emitTabLongPress(targetRoute.key);
          toast.info(AppConfig.strings.navigation.tabDescriptions[copy.tab], {
            key: 'navigation-help',
          });
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: isSwitching || isTransitioning || !targetRoute }}
        accessibilityLabel={copy.label}
        accessibilityHint={AppConfig.strings.navigation.tabDescriptions[copy.tab]}
        testID={`tab-${copy.tab}`}
        style={styles.tabItem}
        pressScale="subtle"
      >
        <View
          // Keep the rounded native surface when deselection removes its background.
          collapsable={false}
          style={[styles.tabIcon, selected && { backgroundColor: theme.primaryLight }]}
        >
          <AppIcon
            name={copy.icon}
            size={Size.iconMd}
            color={selected ? selectedIconColor : inactiveLabelColor}
            strokeWidth={selected ? 2.5 : 2}
          />
        </View>
        <AppText
          variant="caption"
          weight={selected ? 'semibold' : 'medium'}
          style={[styles.tabLabel, { color: selected ? selectedLabelColor : inactiveLabelColor }]}
          numberOfLines={2}
          textBreakStrategy="balanced"
        >
          {copy.label}
        </AppText>
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
