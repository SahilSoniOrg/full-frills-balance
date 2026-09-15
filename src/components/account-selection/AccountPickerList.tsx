import { Icon, AppButton, AppIcon, AppInput, AppText, ListRow } from '@/src/components/core';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import type { AccountFields } from '@/src/types/plainDtos';
import { getArchivedAccountPickerRowPresentation } from '@/src/components/accounts/archivedAccountDisplay';
import { ShowArchivedButton } from '@/src/components/accounts/ShowArchivedButton';
import { useAccountPickerList } from './useAccountPickerList';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
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
            fallbackIcon={Icon.Wallet}
          />
        }
        trailing={
          <View style={styles.trailing}>
            {archived ? <ArchivedAccountIndicator emphasized={emphasizeIndicator} /> : null}
            {isMultiple ? (
              <AppIcon
                name={isSelected ? Icon.CheckCircle : Icon.Circle}
                size={Size.iconMd}
                color={isSelected ? theme.primary : theme.textTertiary}
              />
            ) : isSelected ? (
              <AppIcon name={Icon.Check} size={Size.iconMd} color={theme.primary} />
            ) : undefined}
          </View>
        }
      />
    );
  },
);

AccountPickerRow.displayName = 'AccountPickerRow';

const AccountPickerPill = React.memo(
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
    const { accentColor } = useAccountColors(item);
    const { opacity, emphasizeIndicator } = getArchivedAccountPickerRowPresentation(
      archived,
      isPinnedArchived,
    );

    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={item.name}
        accessibilityState={{ selected: isSelected }}
        testID={`account-picker-option-${item.id}`}
        onPress={onPress}
        activeOpacity={Opacity.medium}
        style={[
          styles.pill,
          {
            backgroundColor: withOpacity(accentColor, isSelected ? 0.22 : 0.1),
            borderColor: isSelected ? withOpacity(accentColor, 0.55) : 'transparent',
            opacity,
          },
        ]}
      >
        <AppIcon
          name={getAccountIcon(item)}
          size={Size.iconSm}
          color={accentColor}
          fallbackIcon={Icon.Wallet}
        />
        <AppText
          variant="caption"
          weight="bold"
          color="secondary"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.pillLabel}
        >
          {item.name}
        </AppText>
        {archived ? <ArchivedAccountIndicator emphasized={emphasizeIndicator} /> : null}
        {isMultiple ? (
          <AppIcon
            name={isSelected ? Icon.CheckCircle : Icon.Circle}
            size={Size.iconSm}
            color={isSelected ? accentColor : theme.textTertiary}
          />
        ) : isSelected ? (
          <AppIcon name={Icon.Check} size={Size.iconSm} color={accentColor} />
        ) : null}
      </TouchableOpacity>
    );
  },
);

AccountPickerPill.displayName = 'AccountPickerPill';

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

type PickerAccount = AccountFields | PlainAccount;
type DisplaySection = Omit<AccountSection, 'data'> & {
  data: (PickerAccount | PickerAccount[])[];
};

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
  const { useCompactAccountPicker } = useAccountDisplayPrefs();

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
  const displaySections = useMemo<DisplaySection[]>(
    () =>
      useCompactAccountPicker
        ? sections.map(section => ({ ...section, data: [section.data] }))
        : sections,
    [sections, useCompactAccountPicker],
  );
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
        <AppIcon name={Icon.Search} size={Size.iconLg} color={theme.textTertiary} opacity={0.5} />
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
    ({ section }: { section: DisplaySection }) => {
      const { title, data, type, key } = section;
      const accountCount = useCompactAccountPicker
        ? Array.isArray(data[0])
          ? data[0].length
          : 0
        : data.length;
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
                  {accountCount}
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
                  <AppIcon name={Icon.Plus} size={Size.iconSm} color={theme.primary} />
                </TouchableOpacity>
              )}
              {!isSearchMode && (
                <AppIcon
                  name={isCollapsed ? Icon.ChevronRight : Icon.ChevronDown}
                  size={Size.iconSm}
                  color={theme.textSecondary}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [
      collapsedSections,
      isSearchMode,
      theme,
      toggleSection,
      onCreateRequest,
      onClose,
      useCompactAccountPicker,
    ],
  );
  const renderItem = useCallback(
    ({ item, section }: { item: PickerAccount | PickerAccount[]; section: DisplaySection }) => {
      const { key } = section;
      if (collapsedSections.has(key) && !isSearchMode) return null;
      if (useCompactAccountPicker) {
        const accountsInRow = item as PickerAccount[];
        return (
          <View pointerEvents="box-none" style={styles.pillGrid}>
            {accountsInRow.map(account => (
              <AccountPickerPill
                key={account.id}
                item={account}
                isSelected={selectedIds.has(account.id)}
                isMultiple={isMultiple}
                isPinnedArchived={pinnedAccountIds.has(account.id)}
                onPress={() => handleToggleSelection(account.id)}
              />
            ))}
          </View>
        );
      }
      const account = item as PickerAccount;
      return (
        <AccountPickerRow
          item={account}
          isSelected={selectedIds.has(account.id)}
          isMultiple={isMultiple}
          isPinnedArchived={pinnedAccountIds.has(account.id)}
          onPress={() => handleToggleSelection(account.id)}
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
      useCompactAccountPicker,
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
              leftIcon={Icon.Search}
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
        <SectionList<PickerAccount | PickerAccount[], DisplaySection>
          sections={displaySections}
          testID="account-picker-list"
          keyExtractor={(item, index) => {
            if (Array.isArray(item)) return `account-picker-row-${index}`;
            return (item as PickerAccount).id;
          }}
          extraData={extraData}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          ListEmptyComponent={renderEmpty}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          keyboardShouldPersistTaps="always"
          style={styles.list}
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
  container: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  searchInput: { flex: 1 },
  countIndicator: { marginTop: Spacing.xs, paddingHorizontal: Spacing.xs },
  listWrapper: { flex: 1, minHeight: 0, width: '100%' },
  list: { flex: 1, minHeight: 0, width: '100%' },
  listContent: { flexGrow: 1, paddingBottom: Spacing.xl },
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
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pill: {
    minHeight: Size.touchTarget,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderRadius: Shape.radius.full,
  },
  pillLabel: { flexShrink: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
