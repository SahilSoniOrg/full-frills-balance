import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import {
  AccountPickerPill,
  getAccountIcon,
  useAccountPickerList,
  type CreateAccountIntent,
} from '@/src/components/account-selection';
import { AppIcon, AppText, Icon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Opacity, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountRole } from '@/src/types/domainJournal';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { getSectionColor, resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import { useMemo } from 'react';
import { type LayoutChangeEvent, TouchableOpacity, View } from 'react-native';
import { routeAccountSelectorStyles as styles } from './SimpleFormAccountSections.styles';

export interface AccountPickerNodeProps {
  account?: AccountFields;
  emptyPrompt: string;
  isExpanded: boolean;
  label: string;
  showLabel?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  onPress: () => void;
  testID?: string;
}

export function AccountPickerNode({
  account,
  emptyPrompt,
  isExpanded,
  label,
  showLabel = true,
  onLayout,
  onPress,
  testID,
}: AccountPickerNodeProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const appearance = useMemo(
    () =>
      account
        ? resolveAccountAppearance(account, theme)
        : { accentColor: theme.textSecondary, categoryColor: theme.textSecondary },
    [account, theme],
  );
  const icon = useMemo(() => (account ? getAccountIcon(account) : undefined), [account]);
  const hasAccount = Boolean(account && account.id !== EMPTY_ACCOUNT_ID);

  return (
    <View style={styles.nodeWrapper} onLayout={onLayout}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={Opacity.medium}
        style={[
          styles.nodeButton,
          !showLabel && styles.compactNodeButton,
          isExpanded
            ? [
                styles.activeTabButton,
                { backgroundColor: withOpacity(appearance.accentColor, Opacity.shadow) },
              ]
            : [
                styles.standardNodeButton,
                {
                  backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.heavy),
                  borderColor: hasAccount
                    ? withOpacity(appearance.accentColor, Opacity.medium)
                    : withOpacity(theme.border, Opacity.heavy),
                },
              ],
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${account?.name || 'Unset'}`}
        testID={testID}
      >
        {showLabel && (
          <View style={styles.nodeHeaderRow}>
            <AppText variant="caption" weight="bold" color="tertiary" style={styles.nodeRoleLabel}>
              {label}
            </AppText>
            <MotiView
              animate={{ rotate: isExpanded ? '180deg' : '0deg' }}
              transition={reduceMotion ? { duration: 0 } : { type: 'timing', duration: 200 }}
              testID="account-node-chevron"
            >
              <AppIcon
                name={Icon.ChevronDown}
                size={Size.xxs}
                color={isExpanded ? appearance.accentColor : theme.textTertiary}
              />
            </MotiView>
          </View>
        )}
        <View style={[styles.nodeAccountRow, !showLabel && styles.compactNodeAccountRow]}>
          {hasAccount ? (
            <>
              <AccountCategoryPill color={appearance.categoryColor} size="sm" />
              {icon && <AppIcon name={icon} size={Size.xxs} color={appearance.accentColor} />}
              <AppText
                variant="caption"
                weight="semibold"
                style={[styles.nodeAccountText, { color: theme.text }]}
              >
                {account?.name}
              </AppText>
            </>
          ) : (
            <AppText
              variant="body"
              color="tertiary"
              numberOfLines={1}
              style={styles.nodePlaceholder}
            >
              {emptyPrompt}
            </AppText>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

interface RouteConnectorProps {
  compact?: boolean;
  onSwapAccounts?: () => void;
  showArrow?: boolean;
  showSwap?: boolean;
}

export function RouteConnector({
  compact = false,
  onSwapAccounts,
  showArrow = true,
  showSwap = false,
}: RouteConnectorProps) {
  const { theme } = useTheme();
  const showSwapButton = showSwap && Boolean(onSwapAccounts);

  if (!showArrow && !showSwapButton) return null;

  return (
    <View
      style={[
        styles.connectorContainer,
        compact && !showSwapButton && styles.compactConnectorContainer,
      ]}
      testID="route-flow-connector"
    >
      {showArrow && (
        <View style={styles.connectorArrow} testID="route-flow-arrow">
          <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
        </View>
      )}
      {showSwapButton && onSwapAccounts && (
        <TouchableOpacity
          onPress={onSwapAccounts}
          style={styles.connectorSwapTouchTarget}
          hitSlop={Spacing.xs}
          accessibilityRole="button"
          accessibilityLabel="Swap send from and deposit into accounts"
          testID="route-swap-accounts-button"
        >
          <View
            pointerEvents="none"
            style={[
              styles.connectorSwapVisual,
              {
                backgroundColor: withOpacity(theme.primary, Opacity.soft),
                borderColor: withOpacity(theme.primary, Opacity.medium),
              },
            ]}
          >
            <AppIcon name={Icon.SwapHorizontal} size={Size.xxs} color={theme.primary} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

export type AccountPickerSections = ReturnType<typeof useAccountPickerList>['sections'];

export interface AccountPickerDropdownProps {
  selectedAccountId?: AccountId;
  emptyPrompt: string;
  label: string;
  role: AccountRole;
  collapsedSections: Set<string>;
  hasSelectedAccount: boolean;
  hasArchivedAccounts: boolean;
  isExpanded: boolean;
  onClear: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  onSelect: (id: AccountId) => void;
  sections: AccountPickerSections;
  setShowArchived: (show: boolean) => void;
  showArchived: boolean;
  testID: string;
  toggleSection: (key: string) => void;
}

export function AccountPickerDropdown({
  selectedAccountId,
  emptyPrompt,
  label,
  role,
  collapsedSections,
  hasSelectedAccount,
  hasArchivedAccounts,
  isExpanded,
  onClear,
  onCreateAccountRequest,
  onSelect,
  sections,
  setShowArchived,
  showArchived,
  testID,
  toggleSection,
}: AccountPickerDropdownProps) {
  const { theme } = useTheme();
  const showArchiveToggle = hasArchivedAccounts || showArchived;

  return (
    <View
      testID={testID}
      pointerEvents={isExpanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!isExpanded}
      importantForAccessibility={isExpanded ? 'yes' : 'no-hide-descendants'}
      style={styles.dropdownBody}
    >
      <View
        style={[
          styles.utilityBar,
          { borderBottomColor: withOpacity(theme.border, Opacity.active) },
        ]}
      >
        <AppText variant="caption" weight="bold" color="tertiary" style={styles.utilityTitle}>
          {label.toUpperCase()}
        </AppText>
        <View style={styles.utilityActions}>
          {hasSelectedAccount && (
            <TouchableOpacity
              onPress={onClear}
              style={[
                styles.clearPillButton,
                {
                  borderColor: withOpacity(theme.border, Opacity.heavy),
                  backgroundColor: 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear selected account"
              testID="clear-selected-account-button"
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            >
              <AppIcon name={Icon.Close} size={Size.iconXs} color={theme.textTertiary} />
              <AppText
                variant="caption"
                weight="semibold"
                style={{ fontSize: Typography.sizes.xs, color: theme.textTertiary }}
              >
                Clear
              </AppText>
            </TouchableOpacity>
          )}
          {showArchiveToggle && (
            <TouchableOpacity
              onPress={() => setShowArchived(!showArchived)}
              style={[
                styles.archivePillButton,
                {
                  borderColor: showArchived
                    ? theme.primary
                    : withOpacity(theme.border, Opacity.heavy),
                  backgroundColor: showArchived
                    ? withOpacity(theme.primary, Opacity.soft)
                    : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                showArchived
                  ? AppConfig.strings.accounts.archive.hideArchived
                  : AppConfig.strings.accounts.archive.showArchived
              }
              testID="show-archived-button"
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            >
              <AppIcon
                name={Icon.Archive}
                size={Size.iconXs}
                color={showArchived ? theme.primary : theme.textTertiary}
              />
              <AppText
                variant="caption"
                weight="semibold"
                style={{
                  fontSize: Typography.sizes.xs,
                  color: showArchived ? theme.primary : theme.textTertiary,
                }}
              >
                {showArchived
                  ? AppConfig.strings.accounts.archive.hideArchived
                  : AppConfig.strings.accounts.archive.showArchived}
              </AppText>
            </TouchableOpacity>
          )}
          {onCreateAccountRequest && (
            <TouchableOpacity
              onPress={() => onCreateAccountRequest(role, { suggestedName: '' })}
              style={[
                styles.headerPlusButton,
                {
                  borderColor: withOpacity(theme.primary, Opacity.heavy),
                  backgroundColor: withOpacity(theme.primary, Opacity.hover),
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              testID="header-create-account-button"
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            >
              <AppIcon name={Icon.Plus} size={Size.xs} color={theme.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {sections.length === 0 ? (
        <View style={[styles.emptyContainer, { borderColor: theme.border }]}>
          <AppText variant="body" color="secondary">
            {emptyPrompt}
          </AppText>
        </View>
      ) : (
        sections.map((section, index) => {
          const isSectionCollapsed = collapsedSections.has(section.key);
          return (
            <View
              key={section.key}
              style={[
                styles.sectionBlock,
                index > 0 && [
                  styles.sectionDivider,
                  { borderTopColor: withOpacity(theme.border, Opacity.active) },
                ],
              ]}
            >
              <TouchableOpacity
                activeOpacity={Opacity.medium}
                onPress={() => toggleSection(section.key)}
                style={styles.sectionToggle}
                accessibilityRole="button"
                accessibilityLabel={`${section.title}, ${section.data.length} accounts, ${isSectionCollapsed ? 'collapsed' : 'expanded'}`}
              >
                <View style={styles.sectionTitleRow}>
                  <View
                    style={[
                      styles.sectionDot,
                      { backgroundColor: getSectionColor(section.type ?? section.title, theme) },
                    ]}
                  />
                  <AppText
                    variant="caption"
                    weight="bold"
                    color="secondary"
                    style={styles.sectionTitleText}
                  >
                    {section.title}
                  </AppText>
                  <View
                    style={[
                      styles.countBadge,
                      { backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.heavy) },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight="semibold"
                      color="tertiary"
                      style={styles.countText}
                    >
                      {section.data.length}
                    </AppText>
                  </View>
                </View>
                <AppIcon
                  name={isSectionCollapsed ? Icon.ChevronDown : Icon.ChevronUp}
                  size={Size.xxs}
                  color={theme.textTertiary}
                />
              </TouchableOpacity>

              {!isSectionCollapsed && (
                <View style={styles.compactPillGrid}>
                  {section.data.map(account => (
                    <AccountPickerPill
                      key={account.id}
                      item={account}
                      isSelected={
                        Boolean(selectedAccountId && selectedAccountId !== EMPTY_ACCOUNT_ID) &&
                        selectedAccountId === account.id
                      }
                      onPress={() => onSelect(account.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

// Compatibility aliases for existing simple-route callers.
export const RouteAccountNode = AccountPickerNode;
export type RouteAccountNodeProps = AccountPickerNodeProps;
export const RouteAccountDropdown = AccountPickerDropdown;
export type RouteAccountDropdownProps = AccountPickerDropdownProps;
