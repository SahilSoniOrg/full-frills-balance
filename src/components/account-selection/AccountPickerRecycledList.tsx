import { AccountPickerPill } from './AccountPickerList';
import { NewPersonActionPill } from './NewPersonActionPill';
import { formatPersonPickerLabel, type PersonPickerGroup } from './personAccountGrouping';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Size } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { getSectionColor } from '@/src/design-system/accountPresentation';
import { withOpacity } from '@/src/design-system/colorMath';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { accountPickerStyles as styles } from './AccountPickerPanel.styles';
import {
  buildAccountPickerRows,
  type AccountPickerListItem,
  type AccountPickerSections,
} from './accountPickerRows';

export const MAX_LIST_HEIGHT = 400;

export function AccountPickerSection({
  section,
  index,
  collapsed,
  toggleSection,
  children,
}: {
  section: AccountPickerSections[number];
  index: number;
  collapsed: boolean;
  toggleSection: (key: string) => void;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const dotColor =
    section.key === 'people'
      ? theme.transfer
      : getSectionColor(section.type ?? section.title, theme);
  return (
    <View
      style={[
        styles.sectionBlock,
        index > 0 && [
          styles.sectionDivider,
          { borderTopColor: withOpacity(theme.border, Opacity.active) },
        ],
      ]}
    >
      <PressScaleTouchable
        onPress={() => toggleSection(section.key)}
        style={styles.sectionTouchable}
        surfaceStyle={styles.sectionToggle}
        accessibilityRole="button"
        accessibilityLabel={`${section.title}, ${section.data.length} accounts, ${collapsed ? 'collapsed' : 'expanded'}`}
      >
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionDot, { backgroundColor: dotColor }]} />
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
            <AppText variant="caption" weight="semibold" color="tertiary" style={styles.countText}>
              {section.data.length}
            </AppText>
          </View>
        </View>
        <AppIcon
          name={collapsed ? Icon.ChevronDown : Icon.ChevronUp}
          size={Size.xxs}
          color={theme.textTertiary}
        />
      </PressScaleTouchable>
      {children}
    </View>
  );
}

export function AccountPickerPillGrid({
  accounts,
  selectedAccountId,
  onSelect,
  peopleGroups,
  trailingItem,
}: {
  accounts: AccountFields[];
  selectedAccountId?: AccountId;
  onSelect: (id: AccountId) => void;
  peopleGroups?: readonly PersonPickerGroup[];
  trailingItem?: ReactNode;
}) {
  const { theme } = useTheme();
  const hasSelection = Boolean(selectedAccountId && selectedAccountId !== EMPTY_ACCOUNT_ID);
  return (
    <View style={styles.compactPillGrid}>
      {accounts.map(account => {
        const personLabel = formatPersonPickerLabel(account, peopleGroups);
        return (
          <AccountPickerPill
            key={account.id}
            item={account}
            displayLabel={personLabel}
            toneColor={personLabel ? theme.transfer : undefined}
            isSelected={hasSelection && selectedAccountId === account.id}
            onSelectId={onSelect}
          />
        );
      })}
      {trailingItem}
    </View>
  );
}

export function AccountPickerRecycledList({
  sections,
  collapsedSections,
  selectedAccountId,
  onSelect,
  toggleSection,
  peopleGroups,
  onCreatePersonRequest,
}: {
  sections: AccountPickerSections;
  collapsedSections: ReadonlySet<string>;
  selectedAccountId?: AccountId;
  onSelect: (id: AccountId) => void;
  toggleSection: (key: string) => void;
  peopleGroups?: readonly PersonPickerGroup[];
  onCreatePersonRequest?: () => void;
}) {
  const rows = useMemo(
    () => buildAccountPickerRows(sections, collapsedSections),
    [sections, collapsedSections],
  );
  const renderItem = useCallback(
    ({ item }: { item: AccountPickerListItem }) =>
      item.kind === 'accounts' ? (
        <AccountPickerPillGrid
          accounts={item.accounts}
          selectedAccountId={selectedAccountId}
          onSelect={onSelect}
          peopleGroups={peopleGroups}
        />
      ) : (
        <AccountPickerSection
          section={item.section}
          index={item.sectionIndex}
          collapsed={item.collapsed}
          toggleSection={toggleSection}
        />
      ),
    [onSelect, selectedAccountId, toggleSection, peopleGroups, onCreatePersonRequest],
  );

  return (
    <FlashList
      data={rows}
      ListHeaderComponent={
        onCreatePersonRequest ? <NewPersonActionPill onPress={onCreatePersonRequest} /> : null
      }
      renderItem={renderItem}
      keyExtractor={item => item.key}
      getItemType={item => item.kind}
      extraData={selectedAccountId}
      maintainVisibleContentPosition={{ disabled: true }}
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      style={{ height: MAX_LIST_HEIGHT }}
      testID="journal-account-folder-list"
    />
  );
}
