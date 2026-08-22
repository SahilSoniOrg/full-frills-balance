import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { ArchivedAccountIndicator } from '@/src/components/common/ArchivedAccountIndicator';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import type { AccountFields } from '@/src/types/domain';
import { getAccountIcon, getArchivedAccountTilePresentation } from '@/src/features/accounts';
import { limitQuickTileAccounts } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { runAfterInteractions } from '@/src/utils/scheduler';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

export interface AccountTileListProps {
  title?: string;
  accounts: AccountFields[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  onSearchRequest?: () => void;
  browseAllTestID?: string;
  emptyPrompt?: string;
}

const INITIAL_ACCOUNT_TILE_BATCH = 15;

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
  const [isFullyLoaded, setIsFullyLoaded] = useState(
    () => accounts.length <= INITIAL_ACCOUNT_TILE_BATCH,
  );

  useEffect(() => {
    if (accounts.length <= INITIAL_ACCOUNT_TILE_BATCH) {
      setIsFullyLoaded(true);
      return;
    }
    setIsFullyLoaded(false);
    return runAfterInteractions(() => {
      setIsFullyLoaded(true);
    });
  }, [accounts]);

  const visibleAccounts = useMemo(() => {
    if (isFullyLoaded || accounts.length <= INITIAL_ACCOUNT_TILE_BATCH) {
      return accounts;
    }
    return limitQuickTileAccounts(accounts, selectedId, INITIAL_ACCOUNT_TILE_BATCH);
  }, [accounts, isFullyLoaded, selectedId]);

  const items = useMemo(() => {
    return visibleAccounts.map(account => {
      const { accentColor, categoryColor } = resolveAccountAppearance(account, theme);
      return {
        id: account.id,
        label: account.name,
        icon: getAccountIcon(account),
        color: accentColor,
        categoryColor,
      };
    });
  }, [visibleAccounts, theme]);

  const archivedById = useMemo(() => {
    return new Map<string, boolean>(
      visibleAccounts.map(account => [account.id, isAccountArchived(account)]),
    );
  }, [visibleAccounts]);

  const getTilePresentation = useCallback(
    (item: { id: string; color: string }, isSelected: boolean) =>
      getArchivedAccountTilePresentation(
        archivedById.get(item.id) ?? false,
        isSelected,
        item.color,
      ),
    [archivedById],
  );

  const renderAccessory = useCallback(
    (item: { id: string }, isSelected: boolean) => {
      if (!archivedById.get(item.id)) return null;
      return <ArchivedAccountIndicator emphasized={isSelected} />;
    },
    [archivedById],
  );

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
            allowDeselect={true}
            getTilePresentation={getTilePresentation}
            renderAccessory={renderAccessory}
          />
        )}
      </View>
    </View>
  );
});
