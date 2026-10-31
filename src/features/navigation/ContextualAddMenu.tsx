import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { analytics } from '@/src/services/analytics';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import type { IconName } from '@/src/types/domainIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { PRIMARY_TABS, type PrimaryTab } from '@/src/navigation/primaryNavigation';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

export type ContextualAddAction =
  'expense' | 'income' | 'transfer' | 'account' | 'category' | 'budget' | 'planned-payment';

export interface ContextualAddMenuProps {
  primaryTab: PrimaryTab;
  disabled?: boolean;
  /** Extra lift so the menu clears the raised Add control. */
  bottomOffset?: number;
  onAction: (action: ContextualAddAction) => void;
}

type MenuAction = {
  action: ContextualAddAction;
  label: string;
  icon: IconName;
  testID?: string;
};

const journal = AppConfig.strings.journal;
const nav = AppConfig.strings.navigation;
const entities = AppConfig.strings.audit.entityLabels;

const JOURNAL_ACTIONS: readonly MenuAction[] = [
  {
    action: 'expense',
    label: journal.expense,
    icon: Icon.Receipt,
    testID: 'journal-entry-fab-expense',
  },
  {
    action: 'income',
    label: journal.income,
    icon: Icon.TrendingUp,
    testID: 'journal-entry-fab-income',
  },
  {
    action: 'transfer',
    label: journal.transfer,
    icon: Icon.SwapHorizontal,
    testID: 'journal-entry-fab-transfer',
  },
];

const MENU_ACTIONS: Record<PrimaryTab, readonly MenuAction[]> = {
  dashboard: JOURNAL_ACTIONS,
  activity: JOURNAL_ACTIONS,
  accounts: [
    {
      action: 'account',
      label: entities.account,
      icon: Icon.Wallet,
      testID: 'contextual-add-account',
    },
    {
      action: 'category',
      label: nav.category,
      icon: Icon.Tag,
      testID: 'contextual-add-category',
    },
  ],
  commitments: [
    {
      action: 'budget',
      label: entities.budget,
      icon: Icon.PieChart,
      testID: 'contextual-add-budget',
    },
    {
      action: 'planned-payment',
      label: entities.planned_payment,
      icon: Icon.Calendar,
      testID: 'contextual-add-planned-payment',
    },
  ],
};

/** A tab-aware Add control and blocking contextual creation menu. */
export function ContextualAddMenu({
  primaryTab,
  disabled = false,
  bottomOffset = 0,
  onAction,
}: ContextualAddMenuProps) {
  const { theme } = useTheme();
  const workplaceName = useWorkplace().activeWorkplace.name;
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const setPageSwipeLock = usePrimaryPageNavigation()?.setPageSwipeLock;
  useEffect(() => {
    const lockId = 'contextual-add-menu';
    setPageSwipeLock?.(lockId, open);
    return () => setPageSwipeLock?.(lockId, false);
  }, [open, setPageSwipeLock]);
  const actions = MENU_ACTIONS[primaryTab];
  const isJournalTab = primaryTab === 'dashboard' || primaryTab === 'activity';
  const tabLabel = PRIMARY_TABS.find(item => item.tab === primaryTab)?.label ?? 'this screen';
  const addHeading = isJournalTab ? nav.addTransactionHeading : nav.addToTab(tabLabel);
  const openAccessibilityLabel = isJournalTab ? journal.newEntryFab.openOptions : addHeading;
  const menuWidth = Math.min(width - Spacing.lg * 2, AppConfig.layout.popupModalMaxWidth);
  const minimumActionWidth = actions.length * 96 + (actions.length - 1) * Spacing.sm;
  const vertical = menuWidth - Spacing.lg * 2 < minimumActionWidth || fontScale >= 1.2;

  return (
    <>
      <PressScaleTouchable
        testID="contextual-add-trigger"
        onPress={() => {
          if (isJournalTab) {
            analytics.track('entrypoint_opened', {
              screen: primaryTab,
              entrypoint: 'bottom_action',
            });
          }
          setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={openAccessibilityLabel}
        accessibilityState={{ expanded: open, disabled }}
        hitSlop={{ top: 10 }}
        style={[styles.triggerHitbox, disabled && styles.triggerDisabled]}
        surfaceStyle={[
          styles.trigger,
          { backgroundColor: theme.primary },
          disabled ? undefined : (Shape.elevation.md as ViewStyle),
        ]}
      >
        <AppIcon name={Icon.Add} size={Size.iconMd} color={theme.onPrimary} />
      </PressScaleTouchable>
      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.modalRoot} accessibilityViewIsModal>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
            onPress={() => setOpen(false)}
            accessible={false}
            accessibilityLabel={nav.dismissAddMenu}
          />
          <View
            style={[
              styles.menu,
              Shape.elevation.lg as ViewStyle,
              {
                width: menuWidth,
                bottom: insets.bottom + Size.fab + Spacing.md + bottomOffset,
                maxHeight: Math.max(
                  96,
                  height - insets.top - insets.bottom - (Size.fab + Spacing.xxxl * 2),
                ),
                backgroundColor: theme.surface,
              },
            ]}
          >
            <AppText
              variant="subheading"
              weight="semibold"
              style={styles.heading}
              numberOfLines={2}
              accessibilityRole="header"
            >
              {addHeading}
            </AppText>
            <AppText
              variant="caption"
              weight="semibold"
              color="secondary"
              style={styles.context}
              numberOfLines={2}
            >
              {nav.inWorkplace(workplaceName)}
            </AppText>
            <View
              accessibilityRole="menu"
              accessibilityLabel={`${addHeading}. ${nav.inWorkplace(workplaceName)}`}
              style={[styles.actions, vertical && styles.verticalActions]}
            >
              {actions.map(({ action, label, icon, testID }) => (
                <PressScaleTouchable
                  key={action}
                  onPress={() => {
                    setOpen(false);
                    if (isJournalTab) {
                      analytics.track('entrypoint_selected', {
                        screen: primaryTab,
                        entrypoint: 'bottom_action',
                        target: 'journal_entry',
                      });
                    }
                    onAction(action);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityLabel={label}
                  testID={testID}
                  style={[styles.actionHitbox, vertical && styles.verticalActionHitbox]}
                  surfaceStyle={[
                    styles.action,
                    vertical && styles.verticalAction,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                >
                  <AppIcon name={icon} size={Size.iconMd} color={theme.primary} />
                  <AppText
                    variant="bodySmall"
                    weight="semibold"
                    style={[styles.actionLabel, vertical && styles.verticalActionLabel]}
                    numberOfLines={2}
                  >
                    {label}
                  </AppText>
                </PressScaleTouchable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerHitbox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Size.buttonLg + Spacing.xs,
    minHeight: Size.buttonLg + Spacing.xs,
  },
  triggerDisabled: {
    opacity: Opacity.medium,
  },
  trigger: {
    width: Size.buttonLg,
    height: Size.buttonLg,
    borderRadius: Shape.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: Shape.radius.lg,
    padding: Spacing.lg,
  },
  heading: { marginBottom: Spacing.xs },
  context: { marginBottom: Spacing.md },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  verticalActions: { flexDirection: 'column' },
  actionHitbox: {
    flex: 1,
    minWidth: 96,
  },
  verticalActionHitbox: {
    width: '100%',
    minWidth: 0,
    flexGrow: 0,
    flexBasis: 'auto',
  },
  action: {
    minHeight: Size.touchTargetLg + Spacing.xxxl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  verticalAction: {
    minHeight: Size.touchTargetLg,
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  verticalActionLabel: { flex: 1, textAlign: 'left' },
});
