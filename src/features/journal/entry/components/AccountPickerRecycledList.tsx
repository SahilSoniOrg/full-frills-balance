import { AccountPickerPill } from '@/src/components/account-selection';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Size } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import { getSectionColor } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { accountPickerStyles as styles } from './AccountPickerPanel.styles';
import {
  buildAccountPickerRows,
  type AccountPickerListItem,
  type AccountPickerSections,
} from './accountPickerRows';

const MAX_LIST_HEIGHT = 400;

export function AccountPickerRecycledList({
  sections,
  collapsedSections,
  selectedAccountId,
  onSelect,
  toggleSection,
}: {
  sections: AccountPickerSections;
  collapsedSections: ReadonlySet<string>;
  selectedAccountId?: AccountId;
  onSelect: (id: AccountId) => void;
  toggleSection: (key: string) => void;
}) {
  const { theme } = useTheme();
  const rows = useMemo(
    () => buildAccountPickerRows(sections, collapsedSections),
    [sections, collapsedSections],
  );
  const renderItem = useCallback(
    ({ item }: { item: AccountPickerListItem }) => {
      if (item.kind === 'accounts') {
        return (
          <View style={styles.compactPillGrid}>
            {item.accounts.map(account => (
              <AccountPickerPill
                key={account.id}
                item={account}
                isSelected={
                  Boolean(selectedAccountId && selectedAccountId !== EMPTY_ACCOUNT_ID) &&
                  selectedAccountId === account.id
                }
                onSelectId={onSelect}
              />
            ))}
          </View>
        );
      }

      const { section, sectionIndex, collapsed } = item;
      return (
        <View
          style={[
            styles.sectionBlock,
            sectionIndex > 0 && [
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
              name={collapsed ? Icon.ChevronDown : Icon.ChevronUp}
              size={Size.xxs}
              color={theme.textTertiary}
            />
          </PressScaleTouchable>
        </View>
      );
    },
    [onSelect, selectedAccountId, theme, toggleSection],
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
