import { useCallback, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { AppIcon, AppText, Icon } from '@/src/components/core';
import { usePersistentTabChrome } from '@/src/components/layout/PersistentTabChrome';
import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PrimaryNavigationHeader } from '@/src/navigation/PrimaryNavigationHeader';
import {
  PRIMARY_NAVIGATION_TRIGGER_SIZE,
  useHasMultipleWorkplaces,
} from '@/src/navigation/primaryNavigation';
import { PRIMARY_PAGES } from '@/src/navigation/primaryPages';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { HomeV2PagePicker } from './HomeV2PagePicker';

/** One fixed row: identity, current leaf title, and screen-owned actions. */
export function HomeV2Header({
  activeRouteName,
  pageProgress,
  onNavigate,
  isTransitioning,
}: {
  activeRouteName: string;
  pageProgress: SharedValue<number>;
  onNavigate: (routeName: string) => void;
  isTransitioning: boolean;
}) {
  const { theme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { activeWorkplace } = useWorkplace();
  const hasMultipleWorkplaces = useHasMultipleWorkplaces();
  const chrome = usePersistentTabChrome(activeRouteName);
  const [actionWidths, setActionWidths] = useState<Readonly<Record<string, number>>>({});
  const reportWidth = useCallback((routeName: string, width: number) => {
    setActionWidths(previous =>
      Math.abs((previous[routeName] ?? 0) - width) < 1
        ? previous
        : { ...previous, [routeName]: width },
    );
  }, []);
  const searching = !!chrome?.isSearchActive;
  const widths = PRIMARY_PAGES.map(page =>
    Math.max(Size.touchTarget, actionWidths[page.routeName] ?? 0),
  );
  const actionLayout = useAnimatedStyle(() => {
    if (searching) return { width: undefined, flex: 1 };
    const progress = Math.max(0, Math.min(widths.length - 1, pageProgress.value));
    const from = Math.floor(progress);
    const to = Math.min(widths.length - 1, from + 1);
    return { width: widths[from] + (widths[to] - widths[from]) * (progress - from), flex: 0 };
  });

  return (
    <View
      testID="home-v2-header"
      style={[
        styles.toolbar,
        {
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
          minHeight: Math.ceil(64 * Math.max(1, fontScale)),
        },
      ]}
    >
      <PrimaryNavigationHeader />
      {!searching ? (
        <HomeV2PagePicker
          activeRouteName={activeRouteName}
          disabled={isTransitioning}
          onNavigate={onNavigate}
        >
          <View style={{ height: Math.ceil(32 * Math.max(1, fontScale)) }}>
            {PRIMARY_PAGES.map((page, index) => (
              <HeaderTitle key={page.id} index={index} pageProgress={pageProgress} />
            ))}
          </View>
          {hasMultipleWorkplaces ? (
            <AppText
              variant="caption"
              color="secondary"
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="primary-navigation-workplace-name"
            >
              {activeWorkplace.name}
            </AppText>
          ) : null}
        </HomeV2PagePicker>
      ) : null}
      <Animated.View style={[styles.actions, actionLayout]} pointerEvents="none" />
      <View style={styles.actionOverlay} pointerEvents="box-none">
        {PRIMARY_PAGES.map((page, index) => (
          <HeaderActions
            key={page.id}
            routeName={page.routeName}
            index={index}
            pageProgress={pageProgress}
            reportWidth={reportWidth}
            expanded={searching}
            interactive={!isTransitioning && activeRouteName === page.routeName}
          />
        ))}
      </View>
    </View>
  );
}

function HeaderTitle({
  index,
  pageProgress,
}: {
  index: number;
  pageProgress: SharedValue<number>;
}) {
  const { theme } = useTheme();
  const page = PRIMARY_PAGES[index];
  const paired = page.group === 'accounts' || page.group === 'commitments';
  const animation = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(pageProgress.value - index)),
  }));
  return (
    <Animated.View
      style={[styles.titleLayer, animation]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.titleLine, paired && styles.pairedTitle]}>
        <AppText variant="heading" fontRole="display" numberOfLines={1} style={styles.title}>
          {page.title}
        </AppText>
        {paired ? (
          <AppIcon name={Icon.ChevronDown} size={Size.iconXs} color={theme.textSecondary} />
        ) : null}
      </View>
      {paired ? (
        <View style={styles.pagePositions}>
          {PRIMARY_PAGES.map((sibling, siblingIndex) =>
            sibling.group === page.group ? (
              <SiblingPosition key={sibling.id} index={siblingIndex} pageProgress={pageProgress} />
            ) : null,
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

function SiblingPosition({
  index,
  pageProgress,
}: {
  index: number;
  pageProgress: SharedValue<number>;
}) {
  const { theme } = useTheme();
  const animation = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * Math.max(0, 1 - Math.abs(pageProgress.value - index)),
  }));
  return (
    <Animated.View style={[styles.pagePosition, { backgroundColor: theme.primary }, animation]} />
  );
}

function HeaderActions({
  routeName,
  index,
  pageProgress,
  interactive,
  reportWidth,
  expanded,
}: {
  routeName: string;
  index: number;
  pageProgress: SharedValue<number>;
  interactive: boolean;
  expanded: boolean;
  reportWidth: (routeName: string, width: number) => void;
}) {
  const chrome = usePersistentTabChrome(routeName);
  const page = PRIMARY_PAGES[index];
  const animation = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(pageProgress.value - index)),
  }));
  return (
    <Animated.View
      style={[styles.actionLayer, expanded && styles.expandedLayer, animation]}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
    >
      <PrivacyScopeProvider scopeKey={page.group}>
        <View
          onLayout={event => {
            if (!expanded) reportWidth(routeName, event.nativeEvent.layout.width);
          }}
          style={chrome?.isSearchActive ? styles.expandedActions : undefined}
        >
          {chrome?.headerActions}
        </View>
      </PrivacyScopeProvider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pairedTitle: { paddingBottom: Spacing.xs },
  pagePositions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  pagePosition: { width: Size.sm, height: 3, borderRadius: Shape.radius.full },
  title: { flexShrink: 1, minWidth: 0 },
  actions: { alignSelf: 'stretch', minHeight: Size.touchTarget, flexShrink: 0 },
  // Measure controls against the toolbar, not their animated spacer. Otherwise
  // a narrow initial spacer can constrain the very width we're trying to read.
  actionOverlay: {
    position: 'absolute',
    top: Spacing.sm,
    bottom: Spacing.sm,
    right: Spacing.lg,
    left: Spacing.lg + PRIMARY_NAVIGATION_TRIGGER_SIZE + Spacing.sm,
  },
  actionLayer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  expandedLayer: { left: 0 },
  expandedActions: { width: '100%' },
});
