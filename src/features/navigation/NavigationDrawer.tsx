import {
  AppIcon,
  AppText,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  PersonAvatar,
  PressScaleTouchable,
} from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import {
  MultipleWorkplacesProvider,
  usePrimaryNavigation,
} from '@/src/navigation/primaryNavigation';
import { workplaceService } from '@/src/services/WorkplaceService';
import { parseIconName, type IconName } from '@/src/types/domainIcons';
import type { WorkplaceId } from '@/src/types/ids';
import { getReadableColor } from '@/src/utils/color-math';
import { AppNavigation } from '@/src/utils/navigation';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Drawer } from 'react-native-drawer-layout';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface NavigationWorkplace {
  id: WorkplaceId;
  name: string;
  icon?: IconName;
}

export interface NavigationDrawerProps {
  children: ReactNode;
}

const copy = AppConfig.strings.navigation;
const settingsCopy = AppConfig.strings.settings;

const NAV_SECTIONS: {
  label: string;
  items: {
    id: string;
    label: string;
    icon: IconName;
    onPress: () => void;
    accent?: 'asset' | 'primary';
    tone?: 'default' | 'utility';
  }[];
}[] = [
  {
    label: copy.exploreSection,
    items: [
      {
        id: 'reports',
        label: AppConfig.strings.reports.title,
        icon: Icon.PieChart,
        onPress: AppNavigation.toReports,
        accent: 'asset',
      },
      {
        id: 'insights',
        label: copy.insights,
        icon: Icon.Sparkles,
        onPress: AppNavigation.toHub,
        accent: 'primary',
      },
    ],
  },
  {
    label: copy.personalSection,
    items: [
      {
        id: 'details',
        label: copy.yourDetails,
        icon: Icon.User,
        onPress: AppNavigation.toPersonalizationSettings,
      },
      {
        id: 'appearance',
        label: settingsCopy.sections.appearance,
        icon: Icon.Palette,
        onPress: AppNavigation.toAppearanceSettings,
      },
      {
        id: 'notifications',
        label: copy.notificationSettings,
        icon: Icon.Notifications,
        onPress: AppNavigation.toAutomationSettings,
      },
    ],
  },
  {
    label: copy.deviceSection,
    items: [
      {
        id: 'inbox',
        label: settingsCopy.personalization.transactionInboxTitle,
        icon: Icon.Inbox,
        onPress: AppNavigation.toTransactionInbox,
        tone: 'utility',
      },
    ],
  },
];

export function NavigationDrawer({ children }: NavigationDrawerProps) {
  const workplace = useWorkplace();
  const primaryNav = usePrimaryNavigation();
  if (!primaryNav) {
    throw new Error('NavigationDrawer must be used within PrimaryNavigationProvider');
  }
  const { drawerVisible, openDrawer, closeDrawer: closePrimaryDrawer, userName } = primaryNav;
  const { data: workplaceRows = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );
  const workplaces: NavigationWorkplace[] = workplaceRows.map(item => ({
    id: item.id,
    name: item.name,
    icon: parseIconName(item.icon, Icon.Briefcase),
  }));
  const activeWorkplace: NavigationWorkplace = {
    id: workplace.activeWorkplace.id,
    name: workplace.activeWorkplace.name,
    icon: parseIconName(workplace.activeWorkplace.icon, Icon.Briefcase),
  };
  const isSwitching = workplace.isSwitchingWorkplace;
  const canSwipeOpen =
    Platform.OS !== 'web' &&
    primaryNav.activeRouteName === 'index' &&
    !primaryNav.selectionModeActive &&
    primaryNav.drawerSwipePermission === true;
  const error = workplace.workplaceSwitchError;
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const activeIdRef = useRef(activeWorkplace.id);
  const drawerWidth = Math.min(width * 0.88, AppConfig.layout.popupModalMaxWidth);
  const selectorMaxHeight = Math.max(
    Size.touchTargetLg * 3,
    Math.min(Size.touchTargetLg * 7.5, height * 0.45 - insets.bottom),
  );

  const closeDrawer = useCallback(() => {
    setSelectorOpen(false);
    closePrimaryDrawer();
  }, [closePrimaryDrawer]);

  if (!drawerVisible && selectorOpen) {
    setSelectorOpen(false);
  }

  const dismiss = useCallback(() => {
    if (selectorOpen) setSelectorOpen(false);
    else closeDrawer();
  }, [closeDrawer, selectorOpen]);

  useEffect(() => {
    if (!drawerVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [dismiss, drawerVisible]);

  useEffect(() => {
    if (!drawerVisible) {
      activeIdRef.current = activeWorkplace.id;
      return;
    }
    if (isSwitching || activeIdRef.current === activeWorkplace.id) return;
    activeIdRef.current = activeWorkplace.id;
    setSelectorOpen(false);
    AccessibilityInfo.announceForAccessibility(copy.workplaceNowActive(activeWorkplace.name));
  }, [activeWorkplace.id, activeWorkplace.name, isSwitching, drawerVisible]);

  const runNavigationAction = (action: () => void) => {
    closeDrawer();
    action();
  };

  const onSwitchWorkplace = (id: WorkplaceId) => {
    void workplace.setWorkplaceId(id);
  };

  const switchError = error ? (
    <AppText
      variant="caption"
      style={[styles.status, { color: theme.error }]}
      accessibilityRole="alert"
    >
      {error}
    </AppText>
  ) : null;

  const renderDrawerContent = () => (
    <View
      testID="navigation-drawer-surface"
      style={styles.surface}
      accessibilityViewIsModal={drawerVisible}
      accessibilityElementsHidden={isSwitching}
      importantForAccessibility={isSwitching ? 'no-hide-descendants' : 'auto'}
    >
      {selectorOpen ? (
        <Pressable
          style={[styles.selectorBackdrop, { backgroundColor: theme.overlay }]}
          onPress={() => setSelectorOpen(false)}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <View
        accessibilityElementsHidden={selectorOpen}
        importantForAccessibility={selectorOpen ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            paddingTop: insets.top + Spacing.sm,
            paddingLeft: insets.left + Spacing.lg,
            paddingRight: insets.right + Spacing.lg,
          },
        ]}
      >
        <View
          style={styles.profileHeader}
          accessibilityRole="text"
          accessibilityLabel={`User: ${userName}`}
        >
          <PersonAvatar name={userName} />
          <AppText variant="bodySmall" weight="medium" numberOfLines={1} style={styles.profileName}>
            {userName}
          </AppText>
        </View>
        <PressScaleTouchable
          testID="navigation-drawer-close"
          pressScale="subtle"
          onPress={closeDrawer}
          accessibilityRole="button"
          accessibilityLabel={copy.closeDrawer}
          style={styles.closeButton}
        >
          <AppIcon name={Icon.Close} size={Size.iconSm} color={theme.textSecondary} />
        </PressScaleTouchable>
      </View>

      <View
        style={[
          styles.workplaceSection,
          {
            paddingLeft: insets.left + Spacing.lg,
            paddingRight: insets.right + Spacing.lg,
          },
        ]}
      >
        <AppText
          variant="overline"
          color="secondary"
          contrastOn={theme.surface}
          accessibilityRole="header"
          style={styles.workplaceSectionTitle}
        >
          {copy.workplaceSection}
        </AppText>
        <PressScaleTouchable
          pressScale="subtle"
          onPress={() => setSelectorOpen(open => !open)}
          disabled={isSwitching}
          accessibilityRole="button"
          accessibilityLabel={copy.activeWorkplace(activeWorkplace.name)}
          accessibilityHint={copy.chooseWorkplaceHint}
          testID="navigation-drawer-workplace-trigger"
          accessibilityState={{ expanded: selectorOpen, disabled: isSwitching }}
          style={[
            styles.workplaceButton,
            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
          ]}
        >
          <View style={[styles.workplaceIcon, { backgroundColor: theme.primaryLight }]}>
            <AppIcon
              name={activeWorkplace.icon ?? Icon.Briefcase}
              size={Size.iconSm}
              color={getReadableColor(theme.primary, theme.primaryLight, 3)}
            />
          </View>
          <AppText variant="body" weight="semibold" numberOfLines={2} style={styles.workplaceName}>
            {activeWorkplace.name}
          </AppText>
          <AppIcon
            name={selectorOpen ? Icon.ChevronUp : Icon.ChevronDown}
            size={Size.sm}
            color={theme.textSecondary}
          />
        </PressScaleTouchable>
        {selectorOpen && (
          <ScrollView
            style={[
              styles.selector,
              {
                backgroundColor: theme.surface,
                left: insets.left + Spacing.lg,
                right: insets.right + Spacing.lg,
                maxHeight: selectorMaxHeight,
              },
            ]}
            contentContainerStyle={{ paddingVertical: Spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {workplaces.length > 0 && (
              <View
                accessible
                accessibilityRole="radiogroup"
                accessibilityLabel={copy.workplacesGroup}
              >
                <ListGroup variant="plain" dividerInset="none">
                  {workplaces.map(workplace => {
                    const checked = workplace.id === activeWorkplace.id;
                    return (
                      <ListRow
                        key={workplace.id}
                        icon={workplace.icon ?? Icon.Briefcase}
                        title={workplace.name}
                        chevron={false}
                        disabled={isSwitching}
                        onPress={() => {
                          if (checked) return;
                          setSelectorOpen(false);
                          onSwitchWorkplace(workplace.id);
                        }}
                        accessibilityRole="radio"
                        accessibilityLabel={workplace.name}
                        accessibilityHint={
                          checked
                            ? copy.currentWorkplaceHint
                            : copy.switchToWorkplaceHint(workplace.name)
                        }
                        accessibilityState={{ checked, disabled: isSwitching }}
                        trailing={
                          checked ? (
                            <AppIcon
                              name={Icon.Check}
                              size={Size.iconSm}
                              color={getReadableColor(theme.primary, theme.surface, 3)}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </ListGroup>
              </View>
            )}
            {switchError}
            <View
              style={[
                styles.selectorActions,
                workplaces.length > 1 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                  marginTop: Spacing.sm,
                  paddingTop: Spacing.sm,
                },
              ]}
            >
              <ListGroup variant="plain" dividerInset="none">
                <ListRow
                  icon={Icon.Plus}
                  title={settingsCopy.workplacePicker.create}
                  subtitle={settingsCopy.workplacePicker.createSubtitle}
                  chevron={false}
                  disabled={isSwitching}
                  onPress={() => runNavigationAction(AppNavigation.toWorkplaceCreation)}
                  testID="navigation-drawer-create-workplace"
                />
                <ListRow
                  icon={Icon.Save}
                  title={settingsCopy.workplacePicker.import}
                  subtitle={settingsCopy.workplacePicker.importSubtitle}
                  chevron={false}
                  disabled={isSwitching}
                  onPress={() =>
                    runNavigationAction(() => {
                      router.push({
                        pathname: '/onboarding',
                        params: { journey: 'settings_restore' },
                      });
                    })
                  }
                />
              </ListGroup>
            </View>
          </ScrollView>
        )}
        {!selectorOpen && switchError}
        {!selectorOpen ? (
          <ListGroup variant="plain" dividerInset="none">
            <ListRow
              icon={Icon.Settings}
              title={copy.manageWorkplace}
              tone="utility"
              level={1}
              chevron={false}
              disabled={isSwitching}
              onPress={() => runNavigationAction(AppNavigation.toWorkplaceManagement)}
            />
          </ListGroup>
        ) : null}
      </View>

      <View style={styles.drawerBody}>
        <View
          style={[
            styles.drawerBodyContent,
            {
              paddingLeft: insets.left + Spacing.sm,
              paddingRight: insets.right + Spacing.sm,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
          accessibilityElementsHidden={selectorOpen}
          importantForAccessibility={selectorOpen ? 'no-hide-descendants' : 'auto'}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {NAV_SECTIONS.map(section => (
              <ListGroup
                key={section.label}
                variant="plain"
                header={section.label}
                items={section.items.map(item => ({
                  id: item.id,
                  title: item.label,
                  icon: item.accent ? undefined : item.icon,
                  leading: item.accent ? (
                    <IconTile icon={item.icon} tint={item.accent} size="md" />
                  ) : undefined,
                  onPress: () => runNavigationAction(item.onPress),
                  chevron: !!item.accent,
                  tone: item.tone,
                }))}
              />
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <ListGroup variant="plain" dividerInset="none">
              <ListRow
                title={copy.allSettings}
                leading={<IconTile icon={Icon.Settings} tint="primary" size="md" />}
                onPress={() => runNavigationAction(AppNavigation.toSettings)}
                testID="navigation-drawer-all-settings"
              />
            </ListGroup>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <MultipleWorkplacesProvider value={workplaceRows.length > 1}>
      <Drawer
        open={drawerVisible}
        onOpen={() => {
          if (!drawerVisible) openDrawer();
        }}
        onClose={() => {
          if (drawerVisible) closeDrawer();
        }}
        drawerType="front"
        // Closing remains available whenever the drawer itself can accept gestures;
        // pager blockers apply only to opening from the underlying page.
        swipeEnabled={
          Platform.OS !== 'web' && (drawerVisible || canSwipeOpen) && !selectorOpen && !isSwitching
        }
        // Opening is Dashboard-only; its right swipe can start anywhere.
        // The native pager yields to this pan until its direction is resolved.
        swipeEdgeWidth={width}
        configureGestureHandler={gesture => {
          // These native config fields work with the drawer's builder gesture
          // and its public callback type, without deprecated gesture aliases.
          Object.assign(gesture.config, {
            activeOffsetXStart: drawerVisible ? -20 : undefined,
            activeOffsetXEnd: drawerVisible ? undefined : 20,
            failOffsetXStart: drawerVisible ? undefined : -20,
            failOffsetXEnd: drawerVisible ? 20 : undefined,
          });
          return gesture;
        }}
        reduceMotion={reduceMotion}
        drawerStyle={[styles.drawer, { width: drawerWidth, backgroundColor: theme.surface }]}
        overlayStyle={{ backgroundColor: theme.overlay }}
        overlayAccessibilityLabel={copy.closeDrawer}
        renderDrawerContent={renderDrawerContent}
      >
        {children}
      </Drawer>
    </MultipleWorkplacesProvider>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, position: 'relative' },
  drawer: {
    borderTopRightRadius: Shape.radius.xl,
    borderBottomRightRadius: Shape.radius.xl,
    overflow: 'hidden',
    elevation: 20,
  },
  selectorBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  header: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  profileHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  profileName: { flex: 1 },
  closeButton: {
    width: Size.touchTarget,
    height: Size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workplaceSection: { position: 'relative', zIndex: 20, elevation: 20 },
  workplaceSectionTitle: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  workplaceButton: {
    minHeight: Size.touchTargetLg + Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Shape.radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  workplaceIcon: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workplaceName: { flex: 1 },
  selector: {
    position: 'absolute',
    top: '100%',
    flexGrow: 0,
    marginTop: Spacing.sm,
    borderRadius: Shape.radius.lg,
    ...Shape.elevation.lg,
  },
  selectorActions: { gap: Spacing.xs },
  status: { marginTop: Spacing.xs, marginHorizontal: Spacing.sm },
  drawerBody: { flex: 1, zIndex: 1 },
  drawerBodyContent: { flex: 1, paddingTop: Spacing.sm },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.md, gap: Spacing.md },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
