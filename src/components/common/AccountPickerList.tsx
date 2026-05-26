import { AppButton, AppIcon, AppInput, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, PlainAccount } from '@/src/types/domain';
import {
  AccountSection,
  getAccountAccentColor,
  getAccountSections,
  getAccountVariant,
  getSectionColor,
} from '@/src/utils/accountCategory';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export type CreateAccountIntent = {
  suggestedName: string;
  type?: AccountType;
};

/**
 * useDebounce - Simple hook for debouncing values
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/**
 * useAccountPicker - Logic hook for the account picker.
 * Handles searching, grouping, and section collapse state.
 */
function useAccountPicker({
  accounts,
  excludeParentAccounts,
}: {
  accounts: (Account | PlainAccount)[];
  excludeParentAccounts: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 150);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const isSearchMode = debouncedSearch.trim().length > 0;

  const filteredAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];

    let result = accounts;
    if (isSearchMode) {
      const q = debouncedSearch.toLowerCase().trim();
      result = accounts.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.accountType.toLowerCase().includes(q) ||
          (a.currencyCode && a.currencyCode.toLowerCase().includes(q)),
      );
    }

    if (excludeParentAccounts) {
      // Robust check: any account that is referenced as a parent
      const accountsWithChildren = new Set(
        accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
      );
      result = result.filter(a => !accountsWithChildren.has(a.id));
    }

    return result;
  }, [accounts, debouncedSearch, isSearchMode, excludeParentAccounts]);

  const sections = useMemo(() => {
    return getAccountSections(filteredAccounts);
  }, [filteredAccounts]);

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    sections,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount: accounts.length,
    filteredCount: filteredAccounts.length,
  };
}

// === MEMOIZED ROW COMPONENT ===
const AccountPickerRow = React.memo(
  ({
    item,
    isSelected,
    isMultiple,
    onPress,
  }: {
    item: Account | PlainAccount;
    isSelected: boolean;
    isMultiple: boolean;
    onPress: () => void;
  }) => {
    const { theme } = useTheme();
    const subtitle = [item.accountType, item.currencyCode].filter(Boolean).join(' • ');
    const accentColor = getAccountAccentColor(item.accountType, theme);

    return (
      <ListRow
        title={item.name}
        titleColor={getAccountVariant(item.accountType) as any}
        subtitle={subtitle}
        onPress={onPress}
        background={isSelected ? 'surfaceSecondary' : 'transparent'}
        padding="md"
        leading={
          <AppIcon name={(item.icon as any) || 'wallet'} size={Size.iconMd} color={accentColor} />
        }
        trailing={
          isMultiple ? (
            <AppIcon
              name={isSelected ? 'checkCircle' : 'circle'}
              size={Size.iconMd}
              color={isSelected ? theme.primary : theme.textTertiary}
            />
          ) : isSelected ? (
            <AppIcon name="check" size={Size.iconMd} color={theme.primary} />
          ) : undefined
        }
      />
    );
  },
);

AccountPickerRow.displayName = 'AccountPickerRow';

// Discriminated union for prop safety
type AccountPickerListProps = {
  accounts: (Account | PlainAccount)[];
  selectedIds: Set<AccountId>;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
  onClose: () => void;
  excludeParentAccounts?: boolean;
} & (
  | { isMultiple: true; onApply: (ids: Set<AccountId>) => void; onSelect?: never }
  | { isMultiple: false; onSelect: (id: AccountId) => void; onApply?: never }
);

export function AccountPickerList(props: AccountPickerListProps) {
  const {
    accounts,
    selectedIds,
    onSelect,
    onApply,
    onCreateRequest,
    onClose,
    isMultiple,
    excludeParentAccounts = false,
  } = props;

  const { theme } = useTheme();

  // Immutability Fix: Always clone the Set to prevent reference sharing
  const [localSelected, setLocalSelected] = useState<Set<AccountId>>(() => new Set(selectedIds));

  // Sync with prop changes using fresh cloning
  useEffect(() => {
    setTimeout(() => setLocalSelected(new Set(selectedIds)), 0);
  }, [selectedIds]);

  const {
    searchQuery,
    setSearchQuery,
    sections,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount,
    filteredCount,
  } = useAccountPicker({ accounts, excludeParentAccounts });

  // Memoize extraData to prevent SectionList identity churn
  const extraData = useMemo(
    () => ({
      selectedIds: isMultiple ? localSelected : selectedIds,
      collapsedSections,
      isSearchMode,
    }),
    [isMultiple, localSelected, selectedIds, collapsedSections, isSearchMode],
  );

  const handleToggleSelection = useCallback(
    (id: AccountId) => {
      if (isMultiple) {
        setLocalSelected(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else if (onSelect) {
        onSelect(id);
        Keyboard.dismiss();
      }
    },
    [isMultiple, onSelect],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <AppIcon name="search" size={Size.iconLg} color={theme.textTertiary} opacity={0.5} />
        <AppText variant="body" color="secondary" style={styles.emptyText}>
          {isSearchMode
            ? AppConfig.strings.accounts.picker.noResults(searchQuery.trim())
            : AppConfig.strings.accounts.picker.noAccountsInCategory}
        </AppText>
        {onCreateRequest && (
          <AppButton
            variant="outline"
            onPress={() => {
              onClose();
              requestAnimationFrame(() => onCreateRequest({ suggestedName: searchQuery.trim() }));
            }}
            style={styles.emptyButton}
          >
            {AppConfig.strings.accounts.picker.createAccount}
          </AppButton>
        )}
      </View>
    ),
    [isSearchMode, searchQuery, onCreateRequest, onClose, theme],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: any }) => {
      const {
        title: sectionTitle,
        data,
        type: sectionType,
        key: sectionKey,
      } = section as AccountSection;
      const isCollapsed = collapsedSections.has(sectionKey) && !isSearchMode;
      const color = getSectionColor(sectionTitle, theme);

      return (
        <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            activeOpacity={Opacity.medium}
            onPress={() => toggleSection(sectionKey)}
            style={styles.sectionToggle}
          >
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, { backgroundColor: color }]} />
              <AppText variant="subheading" weight="bold" color="secondary">
                {sectionTitle}
              </AppText>
              <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
                <AppText variant="caption" weight="bold" color="tertiary">
                  {data.length}
                </AppText>
              </View>
            </View>

            <View style={styles.sectionActions}>
              {onCreateRequest && !isSearchMode && (
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation();
                    onClose();
                    requestAnimationFrame(() => {
                      onCreateRequest({ suggestedName: '', type: sectionType });
                    });
                  }}
                  style={styles.actionButton}
                  accessibilityLabel={`Create ${sectionTitle} account`}
                >
                  <AppIcon name="plus" size={Size.iconSm} color={theme.primary} />
                </TouchableOpacity>
              )}
              {!isSearchMode && (
                <AppIcon
                  name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                  size={Size.iconSm}
                  color={theme.textSecondary}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [collapsedSections, isSearchMode, theme, toggleSection, onCreateRequest, onClose],
  );

  const renderItem = useCallback(
    ({ item, section }: { item: Account | PlainAccount; section: any }) => {
      const { key: sectionKey } = section as AccountSection;
      const isCollapsed = collapsedSections.has(sectionKey) && !isSearchMode;
      if (isCollapsed) return null;

      const currentSelected = isMultiple ? localSelected : selectedIds;
      const isSelected = currentSelected.has(item.id);

      return (
        <AccountPickerRow
          item={item}
          isSelected={isSelected}
          isMultiple={isMultiple}
          onPress={() => handleToggleSelection(item.id)}
        />
      );
    },
    [
      collapsedSections,
      isSearchMode,
      isMultiple,
      localSelected,
      selectedIds,
      handleToggleSelection,
    ],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={AppConfig.strings.accounts.picker.searchPlaceholder}
          leftIcon="search"
          variant="default"
          background="surfaceSecondary"
          borderColor="transparent"
          borderRadius="full"
        />
        {isSearchMode && (
          <View style={styles.countIndicator}>
            <AppText variant="caption" color="secondary">
              Showing {filteredCount} of {totalCount} accounts
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.listWrapper}>
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          extraData={extraData}
          stickySectionHeadersEnabled={true}
          ListEmptyComponent={renderEmpty}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          keyboardShouldPersistTaps="always"
        />
      </View>

      {isMultiple && onApply && (
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderTopColor: theme.border },
          ]}
        >
          <AppButton
            onPress={() => {
              Keyboard.dismiss();
              onApply(localSelected);
            }}
            variant="primary"
          >
            {AppConfig.strings.accounts.picker.applySelection(localSelected.size)}
          </AppButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    display: 'flex',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  countIndicator: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  listWrapper: {
    flex: 1,
    minHeight: 400,
  },
  sectionHeader: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  sectionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
    minWidth: 20,
    alignItems: 'center',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
  },
  emptyContainer: {
    padding: Spacing.xxxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: Spacing.xl,
  },
});
