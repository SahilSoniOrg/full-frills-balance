import { AppButton, AppIcon, AppInput, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useAccountPickerList } from '@/src/features/accounts/hooks/useAccountPickerList';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, AccountType, PlainAccount } from '@/src/types/domain';
import {
  AccountSection,
  getAccountAccentColor,
  getAccountVariant,
  getSectionColor,
} from '@/src/utils/accountCategory';
import React, { useCallback, useMemo } from 'react';
import { Keyboard, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export type CreateAccountIntent = {
  suggestedName: string;
  type?: AccountType;
};

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
        accessibilityLabel={item.name}
        testID={`account-picker-option-${item.id}`}
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

type AccountPickerListProps = {
  accounts: (Account | PlainAccount)[];
  selectedIds: Set<AccountId>;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
  onClose: () => void;
  excludeParentAccounts?: boolean;
} & (
  | {
      isMultiple: true;
      onToggle: (id: AccountId) => void;
      onApply: (ids: Set<AccountId>) => void;
      onSelect?: never;
    }
  | { isMultiple: false; onSelect: (id: AccountId) => void; onApply?: never; onToggle?: never }
);

export function AccountPickerList(props: AccountPickerListProps) {
  const {
    accounts,
    selectedIds,
    onSelect,
    onToggle,
    onApply,
    onCreateRequest,
    onClose,
    isMultiple,
    excludeParentAccounts = false,
  } = props;
  const { theme } = useTheme();
  const {
    searchQuery,
    setSearchQuery,
    sections,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount,
    filteredCount,
  } = useAccountPickerList({ accounts, excludeParentAccounts });
  const extraData = useMemo(
    () => ({ selectedIds, collapsedSections, isSearchMode }),
    [selectedIds, collapsedSections, isSearchMode],
  );
  const handleToggleSelection = useCallback(
    (id: AccountId) => {
      if (isMultiple && onToggle) onToggle(id);
      else if (onSelect) {
        onSelect(id);
        Keyboard.dismiss();
      }
    },
    [isMultiple, onToggle, onSelect],
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
      const { title, data, type, key } = section as AccountSection;
      const isCollapsed = collapsedSections.has(key) && !isSearchMode;
      return (
        <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            activeOpacity={Opacity.medium}
            onPress={() => toggleSection(key)}
            style={styles.sectionToggle}
          >
            <View style={styles.sectionTitleRow}>
              <View
                style={[styles.sectionDot, { backgroundColor: getSectionColor(title, theme) }]}
              />
              <AppText variant="subheading" weight="bold" color="secondary">
                {title}
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
                  onPress={event => {
                    event.stopPropagation();
                    onClose();
                    requestAnimationFrame(() => onCreateRequest({ suggestedName: '', type }));
                  }}
                  style={styles.actionButton}
                  accessibilityLabel={`Create ${title} account`}
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
      const { key } = section as AccountSection;
      if (collapsedSections.has(key) && !isSearchMode) return null;
      return (
        <AccountPickerRow
          item={item}
          isSelected={selectedIds.has(item.id)}
          isMultiple={isMultiple}
          onPress={() => handleToggleSelection(item.id)}
        />
      );
    },
    [collapsedSections, isSearchMode, isMultiple, selectedIds, handleToggleSelection],
  );
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={AppConfig.strings.accounts.picker.searchPlaceholder}
          testID="account-picker-search-input"
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
          stickySectionHeadersEnabled
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
              onApply(selectedIds);
            }}
            variant="primary"
          >
            {AppConfig.strings.accounts.picker.applySelection(selectedIds.size)}
          </AppButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, display: 'flex' },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  countIndicator: { marginTop: Spacing.xs, paddingHorizontal: Spacing.xs },
  listWrapper: { flex: 1, minHeight: 400 },
  sectionHeader: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  sectionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  countBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
    minWidth: 20,
    alignItems: 'center',
  },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  actionButton: { padding: Spacing.xs, marginRight: Spacing.xs },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
  },
  emptyContainer: { padding: Spacing.xxxxl, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: Spacing.lg, textAlign: 'center' },
  emptyButton: { marginTop: Spacing.xl },
});
