import { AccountPickerPill } from './AccountPickerList';
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

const MAX_LIST_HEIGHT = 400;

export function NewPersonActionPill({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <PressScaleTouchable
      testID="account-picker-new-person-button"
      accessibilityRole="button"
      accessibilityLabel="New person"
      onPress={onPress}
      surfaceStyle={[
        styles.newPersonPill,
        {
          borderColor: withOpacity(theme.primary, Opacity.heavy),
          backgroundColor: withOpacity(theme.primary, Opacity.hover),
        },
      ]}
    >
      <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.primary} />
      <AppText variant="caption" weight="semibold" color="primary">
        New person
      </AppText>
    </PressScaleTouchable>
  );
}

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
      ? theme.primary
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
  trailingItem,
}: {
  accounts: AccountFields[];
  selectedAccountId?: AccountId;
  onSelect: (id: AccountId) => void;
  trailingItem?: ReactNode;
}) {
  const hasSelection = Boolean(selectedAccountId && selectedAccountId !== EMPTY_ACCOUNT_ID);
  return (
    <View style={styles.compactPillGrid}>
      {accounts.map(account => (
        <AccountPickerPill
          key={account.id}
          item={account}
          isSelected={hasSelection && selectedAccountId === account.id}
          onSelectId={onSelect}
        />
      ))}
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
  onCreatePersonRequest,
}: {
  sections: AccountPickerSections;
  collapsedSections: ReadonlySet<string>;
  selectedAccountId?: AccountId;
  onSelect: (id: AccountId) => void;
  toggleSection: (key: string) => void;
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
          trailingItem={
            item.sectionKey === 'people' && item.isLastInSection && onCreatePersonRequest ? (
              <NewPersonActionPill onPress={onCreatePersonRequest} />
            ) : undefined
          }
        />
      ) : (
        <AccountPickerSection
          section={item.section}
          index={item.sectionIndex}
          collapsed={item.collapsed}
          toggleSection={toggleSection}
        />
      ),
    [onSelect, selectedAccountId, toggleSection, onCreatePersonRequest],
  );

  return (
    <FlashList
      data={rows}
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
