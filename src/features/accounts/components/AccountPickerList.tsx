import { AppButton, AppIcon, AppInput, AppText, ListRow } from '@/src/components/core';
import { ArchivedAccountIndicator } from '@/src/components/common/ArchivedAccountIndicator';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import type { AccountFields } from '@/src/types/plainDtos';
import { getArchivedAccountPickerRowPresentation } from '@/src/features/accounts/utils/archivedAccountDisplay';
import { ShowArchivedButton } from '@/src/features/accounts/components/ShowArchivedButton';
import { useAccountPickerList } from '@/src/features/accounts/hooks/useAccountPickerList';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { PlainAccount } from '@/src/types/plainDtos';
import { isAccountArchived, pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { AccountSection, getAccountVariant, getSectionColor } from '@/src/utils/accountCategory';
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
    isPinnedArchived,
    onPress,
  }: {
    item: AccountFields | PlainAccount;
    isSelected: boolean;
    isMultiple: boolean;
    isPinnedArchived: boolean;
    onPress: () => void;
  }) => {
    const { theme } = useTheme();
    const archived = isAccountArchived(item);
    const subtitle = [item.accountType, item.currencyCode].filter(Boolean).join(' • ');
    const { accentColor } = useAccountColors(item);
    const { opacity, emphasizeIndicator } = getArchivedAccountPickerRowPresentation(
      archived,
      isPinnedArchived,
    );

    return (
      <ListRow
        title={item.name}
        accessibilityLabel={item.name}
        testID={`account-picker-option-${item.id}`}
        titleColor={getAccountVariant(item.accountType)}
        subtitle={subtitle}
        onPress={onPress}
        background={isSelected ? 'surfaceSecondary' : 'transparent'}
        padding="md"
        style={{ opacity }}
        leading={
          <AppIcon
            name={getAccountIcon(item)}
            size={Size.iconMd}
            color={accentColor}
            fallbackIcon="wallet"
          />
        }
        trailing={
          <View style={styles.trailing}>
            {archived ? <ArchivedAccountIndicator emphasized={emphasizeIndicator} /> : null}
            {isMultiple ? (
              <AppIcon
                name={isSelected ? 'checkCircle' : 'circle'}
                size={Size.iconMd}
                color={isSelected ? theme.primary : theme.textTertiary}
              />
            ) : isSelected ? (
              <AppIcon name="check" size={Size.iconMd} color={theme.primary} />
            ) : undefined}
          </View>
        }
      />
    );
  },
);

AccountPickerRow.displayName = 'AccountPickerRow';

type AccountPickerListProps = {
  accounts: (AccountFields | PlainAccount)[];
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

  const accountsById = useMemo(
    () => new Map(accounts.map(account => [account.id, account])),
    [accounts],
  );

  const pinnedAccountIds = useMemo(
    () => pinnedArchivedAccountIds(selectedIds, accountsById),
    [accountsById, selectedIds],
  );

  const {
    searchQuery,
    setSearchQuery,
    sections,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount,
    filteredCount,
  } = useAccountPickerList({ accounts, excludeParentAccounts, pinnedAccountIds });
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
    ({ section }: { section: AccountSection }) => {
      const { title, data, type, key } = section;
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
    ({ item, section }: { item: AccountFields | PlainAccount; section: AccountSection }) => {
      const { key } = section;
      if (collapsedSections.has(key) && !isSearchMode) return null;
      return (
        <AccountPickerRow
          item={item}
          isSelected={selectedIds.has(item.id)}
          isMultiple={isMultiple}
          isPinnedArchived={pinnedAccountIds.has(item.id)}
          onPress={() => handleToggleSelection(item.id)}
        />
      );
    },
    [
      collapsedSections,
      isSearchMode,
      isMultiple,
      selectedIds,
      pinnedAccountIds,
      handleToggleSelection,
    ],
  );
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={styles.searchInput}>
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
          </View>
          <ShowArchivedButton accounts={accounts} />
        </View>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  searchInput: { flex: 1 },
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
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
