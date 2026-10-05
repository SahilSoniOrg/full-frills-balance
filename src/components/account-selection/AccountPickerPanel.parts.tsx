import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import type { CreateAccountIntent } from './AccountPickerList';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Opacity, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountRole } from '@/src/types/domainJournal';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform, type LayoutChangeEvent, View } from 'react-native';
import {
  AccountPickerPillGrid,
  AccountPickerRecycledList,
  AccountPickerSection,
} from './AccountPickerRecycledList';
import type { AccountPickerSections } from './accountPickerRows';
import { accountPickerStyles as styles } from './AccountPickerPanel.styles';

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
  const icon = account ? getAccountIcon(account) : undefined;
  const hasAccount = Boolean(account && account.id !== EMPTY_ACCOUNT_ID);

  return (
    <View style={styles.nodeWrapper} onLayout={onLayout}>
      <PressScaleTouchable
        onPress={onPress}
        style={styles.nodeTouchable}
        surfaceStyle={[
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
      </PressScaleTouchable>
    </View>
  );
}

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
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleAccountPress = useCallback((id: AccountId) => {
    onSelectRef.current(id);
  }, []);
  const showArchiveToggle = hasArchivedAccounts || showArchived;
  const visibleAccountCount = sections.reduce(
    (count, section) => count + (collapsedSections.has(section.key) ? 0 : section.data.length),
    0,
  );
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
            <PressScaleTouchable
              onPress={onClear}
              surfaceStyle={[
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
            </PressScaleTouchable>
          )}
          {showArchiveToggle && (
            <PressScaleTouchable
              onPress={() => setShowArchived(!showArchived)}
              surfaceStyle={[
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
            </PressScaleTouchable>
          )}
          {onCreateAccountRequest && (
            <PressScaleTouchable
              onPress={() => onCreateAccountRequest(role, { suggestedName: '' })}
              surfaceStyle={[
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
            </PressScaleTouchable>
          )}
        </View>
      </View>

      {sections.length === 0 ? (
        <View style={[styles.emptyContainer, { borderColor: theme.border }]}>
          <AppText variant="body" color="secondary">
            {emptyPrompt}
          </AppText>
        </View>
      ) : Platform.OS !== 'web' && visibleAccountCount > 32 ? (
        <AccountPickerRecycledList
          sections={sections}
          collapsedSections={collapsedSections}
          selectedAccountId={selectedAccountId}
          onSelect={handleAccountPress}
          toggleSection={toggleSection}
        />
      ) : (
        sections.map((section, index) => {
          const isSectionCollapsed = collapsedSections.has(section.key);
          return (
            <AccountPickerSection
              key={section.key}
              section={section}
              index={index}
              collapsed={isSectionCollapsed}
              toggleSection={toggleSection}
            >
              {!isSectionCollapsed && (
                <AccountPickerPillGrid
                  accounts={section.data}
                  selectedAccountId={selectedAccountId}
                  onSelect={handleAccountPress}
                />
              )}
            </AccountPickerSection>
          );
        })
      )}
    </View>
  );
}
