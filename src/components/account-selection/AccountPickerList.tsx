import { getArchivedAccountPickerRowPresentation } from '@/src/components/accounts/archivedAccountDisplay';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { AccountListRow } from '@/src/components/accounts/AccountListRow';
import { ShowArchivedButton } from '@/src/components/accounts/ShowArchivedButton';
import {
  AppButton,
  AppIcon,
  AppInput,
  AppText,
  Icon,
  IconButton,
  PressScaleTouchable,
} from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { ListSectionHeader } from '@/src/components/shared/ListSectionHeader';
import { SelectionCheckmark, SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { useTheme } from '@/src/hooks/use-theme';
import {
  resolveAccountAppearance,
  AccountSection,
  getSectionColor,
} from '@/src/design-system/accountPresentation';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { PlainAccount } from '@/src/types/plainDtos';
import { isAccountArchived, pinnedArchivedAccountIds } from '@/src/domain/accounts/accountArchive';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { withOpacity } from '@/src/design-system/colorMath';
import React, { useCallback, useMemo } from 'react';
import { Keyboard, SectionList, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAccountPickerList } from './useAccountPickerList';
import { NewPersonActionPill } from './NewPersonActionPill';
import { PersonAccountChooserModal } from './PersonAccountChooserModal';
import {
  formatPersonPickerLabel,
  isPersonPickerSelection,
  type PersonPickerGroup,
} from './personAccountGrouping';
import { usePersonLinkedAccountSelect } from './usePersonLinkedAccountSelect';

export type CreateAccountIntent = {
  suggestedName: string;
  type?: AccountType;
};

export interface AccountPickerPillProps {
  item: AccountFields | PlainAccount;
  displayLabel?: string;
  toneColor?: string;
  isSelected: boolean;
  isMultiple?: boolean;
  isPinnedArchived?: boolean;
  onPress?: () => void;
  onSelectId?: (id: AccountId) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const AccountPickerPill = React.memo(
  ({
    item,
    displayLabel,
    toneColor,
    isSelected,
    isMultiple = false,
    isPinnedArchived = false,
    onPress,
    onSelectId,
    testID,
    style,
  }: AccountPickerPillProps) => {
    const { theme } = useTheme();
    const archived = isAccountArchived(item);
    const { accentColor: resolvedColor } = resolveAccountAppearance(item, theme);
    const accentColor = toneColor ?? resolvedColor;
    const { opacity, emphasizeIndicator } = getArchivedAccountPickerRowPresentation(
      archived,
      isPinnedArchived,
    );

    const visibleName = displayLabel ?? item.name;
    const nameLength = visibleName.length;
    const isLongName = nameLength > 14;
    const contentColor = isSelected ? theme.onPrimary : accentColor;
    const handlePress = useCallback(() => {
      if (onSelectId) {
        onSelectId(item.id);
      } else {
        onPress?.();
      }
    }, [item.id, onPress, onSelectId]);

    return (
      <PressScaleTouchable
        pressScale="subtle"
        accessibilityRole={isMultiple ? 'checkbox' : 'button'}
        accessibilityLabel={visibleName}
        accessibilityState={isMultiple ? { checked: isSelected } : { selected: isSelected }}
        testID={testID ?? `account-picker-option-${item.id}`}
        onPress={handlePress}
        activeOpacity={Opacity.heavy}
        style={[
          style,
          styles.pill,
          isLongName && styles.pillLongName,
          {
            backgroundColor: isSelected ? accentColor : 'transparent',
            borderColor: isSelected ? accentColor : withOpacity(accentColor, Opacity.muted),
            opacity,
          },
        ]}
      >
        <AppIcon
          name={getAccountIcon(item)}
          size={Size.iconXs}
          color={contentColor}
          fallbackIcon={Icon.Wallet}
        />
        <AppText
          variant="caption"
          weight="bold"
          color={isSelected ? 'primary' : 'secondary'}
          numberOfLines={isLongName ? 2 : 1}
          ellipsizeMode="tail"
          style={[
            styles.pillLabel,
            {
              color: isSelected ? theme.onPrimary : theme.textSecondary,
            },
          ]}
        >
          {visibleName}
        </AppText>
        {archived ? <ArchivedAccountIndicator emphasized={emphasizeIndicator} /> : null}
        {isMultiple ? (
          <SelectionIndicator selected={isSelected} size={Size.iconXs} color={contentColor} />
        ) : (
          <SelectionCheckmark selected={isSelected} size={Size.xxs} color={theme.onPrimary} />
        )}
      </PressScaleTouchable>
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
  peopleGroups?: readonly PersonPickerGroup[];
  onCreatePersonRequest?: () => void;
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
  accountCount: number;
  data: (PickerAccount | PickerAccount[])[];
};

const PILLS_PER_ROW = 24;

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
    peopleGroups,
    onCreatePersonRequest,
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
    eligibleAccounts,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount,
    filteredCount,
  } = useAccountPickerList({ accounts, excludeParentAccounts, pinnedAccountIds, peopleGroups });
  const displaySections = useMemo<DisplaySection[]>(
    () =>
      sections.map(section => {
        if (!useCompactAccountPicker) {
          return { ...section, accountCount: section.data.length };
        }
        const data: DisplaySection['data'] = [];
        for (let index = 0; index < section.data.length; index += PILLS_PER_ROW) {
          data.push(section.data.slice(index, index + PILLS_PER_ROW));
        }
        return { ...section, accountCount: section.data.length, data };
      }),
    [sections, useCompactAccountPicker],
  );
  const extraData = useMemo(
    () => ({ selectedIds, collapsedSections, isSearchMode }),
    [selectedIds, collapsedSections, isSearchMode],
  );
  const commitSingleSelect = useCallback(
    (id: AccountId) => {
      onSelect?.(id);
      Keyboard.dismiss();
    },
    [onSelect],
  );
  const personSelect = usePersonLinkedAccountSelect({
    accounts: eligibleAccounts,
    peopleGroups,
    onSelect: commitSingleSelect,
  });
  const handleToggleSelection = useCallback(
    (id: AccountId) => {
      if (isMultiple && onToggle) onToggle(id);
      else personSelect.selectAccount(id);
    },
    [isMultiple, onToggle, personSelect],
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
      const { title, accountCount, type, key } = section;
      const isCollapsed = collapsedSections.has(key) && !isSearchMode;
      const createAction =
        onCreateRequest && !isSearchMode ? (
          <IconButton
            name={Icon.Plus}
            size={Size.iconSm}
            variant="clear"
            iconColor={theme.primary}
            onPress={() => {
              onClose();
              requestAnimationFrame(() => {
                onCreateRequest({ suggestedName: '', type });
              });
            }}
            accessibilityLabel={`Create ${title} account`}
          />
        ) : undefined;

      return (
        <ListSectionHeader
          title={title}
          count={accountCount}
          expanded={!isCollapsed}
          onToggle={() => toggleSection(key)}
          showChevron={!isSearchMode}
          leading={
            <View
              style={[
                styles.sectionDot,
                {
                  backgroundColor:
                    key === 'people' ? theme.transfer : getSectionColor(title, theme),
                },
              ]}
            />
          }
          actions={createAction}
          style={[styles.sectionHeader, { backgroundColor: theme.background }]}
          accessibilityLabel={`${title}, ${accountCount} accounts`}
          accessibilityHint={isCollapsed ? 'Expand section' : 'Collapse section'}
        />
      );
    },
    [collapsedSections, isSearchMode, theme, toggleSection, onCreateRequest, onClose],
  );
  const renderItem = useCallback(
    ({ item, section }: { item: PickerAccount | PickerAccount[]; section: DisplaySection }) => {
      const { key } = section;
      if (collapsedSections.has(key) && !isSearchMode) return null;
      if (useCompactAccountPicker) {
        const accountsInRow = item as PickerAccount[];
        return (
          <View pointerEvents="box-none" style={styles.pillGrid}>
            {accountsInRow.map(account => {
              const personLabel = formatPersonPickerLabel(account, peopleGroups);
              const selected = [...selectedIds].some(id =>
                isPersonPickerSelection(account.id, id, peopleGroups),
              );
              return (
                <AccountPickerPill
                  key={account.id}
                  item={account}
                  displayLabel={personLabel}
                  toneColor={personLabel ? theme.transfer : undefined}
                  isSelected={selected}
                  isMultiple={isMultiple}
                  isPinnedArchived={pinnedAccountIds.has(account.id)}
                  onPress={() => handleToggleSelection(account.id)}
                />
              );
            })}
          </View>
        );
      }
      const account = item as PickerAccount;
      return (
        <AccountListRow
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
      peopleGroups,
      theme.transfer,
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
          keyExtractor={item => {
            if (Array.isArray(item)) return `account-picker-row-${item[0].id}`;
            return (item as PickerAccount).id;
          }}
          initialNumToRender={useCompactAccountPicker ? 2 : 10}
          maxToRenderPerBatch={useCompactAccountPicker ? 2 : 10}
          extraData={extraData}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={
            !isSearchMode && onCreatePersonRequest ? (
              <View style={styles.personActionHeader}>
                <NewPersonActionPill onPress={onCreatePersonRequest} />
              </View>
            ) : null
          }
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
            testID="account-picker-apply-selection"
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
      {!isMultiple ? (
        <PersonAccountChooserModal
          visible={personSelect.chooserVisible}
          personName={personSelect.chooserPersonName}
          accounts={personSelect.chooserAccounts}
          peopleGroups={peopleGroups}
          selectedId={[...selectedIds][0]}
          onClose={personSelect.closeChooser}
          onSelect={personSelect.confirmChooserAccount}
        />
      ) : null}
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
  personActionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    alignItems: 'flex-start',
  },
  list: { flex: 1, minHeight: 0, width: '100%' },
  listContent: { flexGrow: 1, paddingBottom: Spacing.xl },
  sectionHeader: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  sectionDot: { width: Spacing.sm, height: Spacing.sm, borderRadius: Shape.radius.xs },
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
  pillLongName: {
    borderRadius: Shape.radius.lg,
    paddingVertical: 5,
  },
  pillLabel: { flexShrink: 1 },
});
