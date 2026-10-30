import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import { AppIcon, AppText, Icon, type IconName } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { PRIMARY_PAGES, primaryPageFromRouteName } from '@/src/navigation/primaryPages';
import { usePrimaryPageSwipeReservation } from '@/src/navigation/primaryPageNavigation';
import { useHasMultipleWorkplaces } from '@/src/navigation/primaryNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const pageDetails: Partial<Record<string, { icon: IconName; description: string }>> = {
  accounts: { icon: Icon.Wallet, description: 'Balances and account structure' },
  categories: { icon: Icon.Tag, description: 'Income and expense categories' },
  commitments: { icon: Icon.Calendar, description: 'Spending limits and progress' },
  'planned-payments': { icon: Icon.Calendar, description: 'Upcoming payments and income' },
};

type Anchor = { x: number; bottom: number; routeName: string; workplaceId: string };

/** An anchored two-page menu keeps sibling destinations explicit without a second header row. */
export function HomeV2PagePicker({
  activeRouteName,
  disabled,
  onNavigate,
  children,
}: {
  activeRouteName: string;
  disabled: boolean;
  onNavigate: (routeName: string) => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const workplace = useWorkplace();
  const hasMultipleWorkplaces = useHasMultipleWorkplaces();
  const anchorRef = useRef<View>(null);
  const request = useRef(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { reserve, release } = usePrimaryPageSwipeReservation();
  const page = primaryPageFromRouteName(activeRouteName);
  const siblings = PRIMARY_PAGES.filter(item => item.group === page?.group);
  const paired = siblings.length > 1;
  const unavailable = disabled || workplace.isSwitchingWorkplace || !focused;
  const scope = [activeRouteName, workplace.workplaceId, unavailable, width, height].join('|');
  const [visibility, setVisibility] = useState({ scope, requestedOpen: false });
  if (visibility.scope !== scope) {
    setVisibility({ scope, requestedOpen: false });
  }
  const requestedOpen = visibility.scope === scope && visibility.requestedOpen;
  const open =
    requestedOpen &&
    !!anchor &&
    paired &&
    !unavailable &&
    anchor.routeName === activeRouteName &&
    anchor.workplaceId === workplace.workplaceId;

  useEffect(() => {
    // Hide the modal without clearing its last paint: native fade-out keeps
    // rendering children after visible becomes false.
    request.current += 1;
    return () => {
      request.current += 1;
    };
  }, [activeRouteName, workplace.workplaceId, unavailable, width, height]);
  useEffect(() => {
    if (open) reserve();
    return release;
  }, [open, reserve, release]);

  const close = () => {
    request.current += 1;
    setVisibility({ scope, requestedOpen: false });
    release();
  };
  // Navigation may commit while the old modal is fading. Retain its page group
  // and selection as well as its anchor until the next opening replaces them.
  const menuPage = primaryPageFromRouteName(anchor?.routeName ?? activeRouteName);
  const menuSiblings = PRIMARY_PAGES.filter(item => item.group === menuPage?.group);
  const menuWidth = Math.min(320, width - insets.left - insets.right - Spacing.lg * 2);
  const maxMenuHeight = Math.max(
    Size.touchTarget,
    height - insets.top - insets.bottom - Spacing.lg * 2,
  );
  const estimatedHeight = Math.min(
    maxMenuHeight,
    menuSiblings.length * (Size.touchTarget + Spacing.lg) * Math.max(1, fontScale) +
      Size.touchTarget +
      Spacing.lg * 2,
  );
  const left = Math.max(
    insets.left + Spacing.lg,
    Math.min(anchor?.x ?? 0, width - insets.right - Spacing.lg - menuWidth),
  );
  const top = Math.max(
    insets.top + Spacing.sm,
    Math.min(
      (anchor?.bottom ?? insets.top) + Spacing.xs,
      height - insets.bottom - Spacing.lg - estimatedHeight,
    ),
  );

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchor}>
        <Pressable
          onPress={() => {
            if (!paired || unavailable) return;
            const epoch = ++request.current;
            anchorRef.current?.measureInWindow((x, y, _width, measuredHeight) => {
              if (request.current !== epoch) return;
              setAnchor({
                x,
                bottom: y + measuredHeight,
                routeName: activeRouteName,
                workplaceId: workplace.workplaceId,
              });
              setVisibility({ scope, requestedOpen: true });
            });
          }}
          disabled={!paired || unavailable}
          accessibilityRole={paired ? 'button' : 'header'}
          accessibilityLabel={
            paired
              ? `${page?.title}.${hasMultipleWorkplaces ? ` Workplace: ${workplace.activeWorkplace.name}.` : ''} Choose ${siblings.map(item => item.title).join(' or ')}`
              : `${page?.title}${hasMultipleWorkplaces ? `. Workplace: ${workplace.activeWorkplace.name}` : ''}`
          }
          accessibilityHint={paired ? 'Opens the page selector' : undefined}
          accessibilityState={paired ? { expanded: open, disabled: unavailable } : undefined}
          style={styles.trigger}
          testID="home-v2-page-title"
        >
          {children}
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.modal} accessibilityViewIsModal>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
            onPress={close}
            accessible={false}
            testID="home-v2-page-menu-backdrop"
          />
          <View
            style={[
              styles.menu,
              Shape.elevation.lg,
              {
                left,
                top,
                width: menuWidth,
                maxHeight: Math.max(Size.touchTarget, height - insets.bottom - Spacing.lg - top),
                backgroundColor: theme.surface,
              },
            ]}
            accessibilityRole="menu"
            accessibilityLabel="Choose page"
            testID="home-v2-page-menu"
            onAccessibilityEscape={close}
          >
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.menuScroll}>
              {menuSiblings.map(item => {
                const selected = item.routeName === anchor?.routeName;
                const details = pageDetails[item.routeName];
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.title}. ${details?.description ?? ''}`}
                    testID={`home-v2-page-option-${item.routeName}`}
                    onPress={() => {
                      close();
                      onNavigate(item.routeName);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: pressed
                          ? theme.surfaceSecondary
                          : selected
                            ? theme.primaryLight
                            : theme.surface,
                      },
                    ]}
                  >
                    <AppIcon
                      name={details?.icon ?? Icon.Calendar}
                      size={Size.iconMd}
                      color={theme.text}
                    />
                    <View style={styles.optionLabel}>
                      <AppText
                        weight={selected ? 'semibold' : 'medium'}
                        contrastOn={selected ? theme.primaryLight : theme.surface}
                      >
                        {item.title}
                      </AppText>
                      <AppText
                        variant="caption"
                        color="secondary"
                        contrastOn={selected ? theme.primaryLight : theme.surface}
                      >
                        {details?.description}
                      </AppText>
                    </View>
                    {selected ? (
                      <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.text} />
                    ) : null}
                  </Pressable>
                );
              })}
              <View style={styles.menuHint}>
                <AppIcon
                  name={Icon.SwapHorizontal}
                  size={Size.iconSm}
                  color={theme.textSecondary}
                />
                <AppText variant="caption" color="secondary" style={styles.optionLabel}>
                  You can also swipe between these pages
                </AppText>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, minWidth: 0 },
  trigger: { minHeight: Size.touchTarget, justifyContent: 'center' },
  modal: { flex: 1 },
  menuScroll: { flexGrow: 0 },
  menu: {
    position: 'absolute',
    borderRadius: Shape.radius.lg,
    padding: Spacing.sm,
  },
  option: {
    minHeight: Size.touchTarget + Spacing.lg,
    borderRadius: Shape.radius.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  optionLabel: { flex: 1, gap: Spacing.xs },
  menuHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
