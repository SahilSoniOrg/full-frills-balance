import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';

export interface AccountTileListProps {
  title?: string;
  accounts: Account[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  onSearchRequest?: () => void;
  browseAllTestID?: string;
  emptyPrompt?: string;
}

export const AccountTileList = React.memo(function AccountTileList({
  title,
  accounts,
  selectedId,
  onSelect,
  onSearchRequest,
  browseAllTestID,
  emptyPrompt,
}: AccountTileListProps) {
  const { theme } = useTheme();

  const items = useMemo(() => {
    return accounts.map(account => ({
      id: account.id,
      label: account.name,
      icon: account.icon as IconName,
      color: getAccountAccentColor(account.accountType, theme),
    }));
  }, [accounts, theme]);

  return (
    <View style={{ gap: Spacing.xs, marginVertical: Spacing.sm }}>
      {/* Clickable header for opening the modal */}
      {title && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingRight: Spacing.xs,
            paddingVertical: Spacing.xs,
          }}
        >
          <AppText
            variant="caption"
            weight="bold"
            color="tertiary"
            style={{ marginLeft: Spacing.xs }}
          >
            {title}
          </AppText>

          {onSearchRequest && (
            <TouchableOpacity
              testID={browseAllTestID}
              onPress={onSearchRequest}
              activeOpacity={Opacity.medium}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.xs,
                paddingHorizontal: Spacing.sm,
                paddingVertical: Spacing.sm,
              }}
            >
              <AppIcon name="search" size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                Browse all
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View>
        {items.length === 0 && onSearchRequest ? (
          <TouchableOpacity
            onPress={onSearchRequest}
            activeOpacity={Opacity.medium}
            style={{
              paddingVertical: Spacing.lg,
              paddingHorizontal: Spacing.md,
              borderRadius: Shape.radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surfaceSecondary,
              alignItems: 'center',
            }}
            accessibilityRole="button"
          >
            <AppText variant="body" color="secondary">
              {emptyPrompt ?? AppConfig.strings.transactionFlow.simpleEntry.chooseAccount}
            </AppText>
          </TouchableOpacity>
        ) : (
          <SelectionTileList
            items={items}
            selectedId={selectedId}
            onSelect={id => onSelect(id as AccountId)}
            testIDPrefix="account-option"
          />
        )}
      </View>
    </View>
  );
});
