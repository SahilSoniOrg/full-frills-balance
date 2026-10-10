import type { CreateAccountIntent } from './AccountPickerList';
import { AppIcon, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { withOpacity } from '@/src/utils/color-math';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  AccountPickerPanel,
  type AccountPickerLeg,
  type ExpansionPosition,
} from './AccountPickerPanel';
import { AccountPickerNode } from './AccountPickerPanel.parts';

export interface SimpleFormAccountSectionsProps {
  /**
   * Position of the expanded dropdown:
   * - 'left': Source leg expanded (e.g. Paid with / Send from)
   * - 'right': Destination leg expanded (e.g. Spend on / Deposit into)
   * - null: Collapsed (both buttons side by side)
   */
  expansionPosition: ExpansionPosition;
  onToggleExpansion: (side: 'left' | 'right') => void;

  // Source (Left) Leg
  sourceLabel: string;
  sourceAccount?: AccountFields;
  sourceAccounts: AccountFields[];
  onSelectSource: (id: AccountId) => void;
  sourceEmptyPrompt?: string;

  // Destination (Right) Leg
  destLabel: string;
  destAccount?: AccountFields;
  destAccounts: AccountFields[];
  onSelectDestination: (id: AccountId) => void;
  destEmptyPrompt?: string;

  // Middle Connector / Swap
  type?: TabType;
  onSwapAccounts?: () => void;

  // Archive & Creation
  allAccounts?: AccountFields[];
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;

  // Embedding
  displayMode?: 'standard' | 'compact';
  containerStyle?: StyleProp<ViewStyle>;
  lazyDropdown?: boolean;
  testIDPrefix?: string;
}

export const SimpleFormAccountSections = React.memo(function SimpleFormAccountSections({
  expansionPosition,
  onToggleExpansion,
  sourceLabel,
  sourceAccount,
  sourceAccounts,
  onSelectSource,
  sourceEmptyPrompt = AppConfig.strings.transactionFlow.simpleEntry.chooseAccount,
  destLabel,
  destAccount,
  destAccounts,
  onSelectDestination,
  destEmptyPrompt,
  type = 'expense',
  onSwapAccounts,
  allAccounts,
  onCreateAccountRequest,
  displayMode = 'standard',
  containerStyle,
  lazyDropdown = false,
  testIDPrefix = 'journal-route',
}: SimpleFormAccountSectionsProps) {
  const [lastActiveSide, setLastActiveSide] = useState<'left' | 'right'>(
    expansionPosition ?? 'left',
  );
  if (expansionPosition && expansionPosition !== lastActiveSide) {
    setLastActiveSide(expansionPosition);
  }

  const activeSide = expansionPosition ?? lastActiveSide;
  const transferPinnedAccountIds = useMemo(() => {
    if (type !== 'transfer') return undefined;
    const selectedIds = [sourceAccount?.id, destAccount?.id].filter((id): id is AccountId =>
      Boolean(id && id !== EMPTY_ACCOUNT_ID),
    );
    if (selectedIds.length === 0) return undefined;
    return pinnedArchivedAccountIds(selectedIds, allAccounts ?? sourceAccounts);
  }, [allAccounts, destAccount?.id, sourceAccount?.id, sourceAccounts, type]);
  const showNodeLabels = displayMode === 'standard';
  const resolvedDestEmptyPrompt =
    destEmptyPrompt ??
    (type === 'expense'
      ? AppConfig.strings.transactionFlow.simpleEntry.chooseCategory
      : AppConfig.strings.transactionFlow.simpleEntry.chooseAccount);
  const activeLeg: AccountPickerLeg =
    activeSide === 'left'
      ? {
          account: sourceAccount,
          accounts: sourceAccounts,
          emptyPrompt: sourceEmptyPrompt,
          label: sourceLabel,
          onSelect: onSelectSource,
          pinnedAccountIds: transferPinnedAccountIds,
          role: 'source',
        }
      : {
          account: destAccount,
          accounts: destAccounts,
          emptyPrompt: resolvedDestEmptyPrompt,
          label: destLabel,
          onSelect: onSelectDestination,
          pinnedAccountIds: transferPinnedAccountIds,
          role: 'destination',
        };

  return (
    <AccountPickerPanel
      activeLeg={activeLeg}
      activeSide={activeSide}
      allAccounts={allAccounts}
      containerStyle={containerStyle}
      dropdownTestID={`${testIDPrefix}-${activeSide === 'left' ? 'source' : 'destination'}-dropdown`}
      expansionPosition={expansionPosition}
      lazyDropdown={lazyDropdown}
      onCreateAccountRequest={onCreateAccountRequest}
      renderNodes={({ visualSide, onLeftTabWrapperLayout }) => (
        <>
          <AccountPickerNode
            account={sourceAccount}
            emptyPrompt={sourceEmptyPrompt}
            isExpanded={visualSide === 'left'}
            label={sourceLabel}
            showLabel={showNodeLabels}
            onLayout={onLeftTabWrapperLayout}
            onPress={() => {
              Keyboard.dismiss();
              onToggleExpansion('left');
            }}
            testID={`${testIDPrefix}-source-node`}
          />
          <RouteConnector
            compact={displayMode === 'compact'}
            onSwapAccounts={type === 'transfer' ? onSwapAccounts : undefined}
          />
          <AccountPickerNode
            account={destAccount}
            emptyPrompt={resolvedDestEmptyPrompt}
            isExpanded={visualSide === 'right'}
            label={destLabel}
            showLabel={showNodeLabels}
            onPress={() => {
              Keyboard.dismiss();
              onToggleExpansion('right');
            }}
            testID={`${testIDPrefix}-destination-node`}
          />
        </>
      )}
    />
  );
});

function RouteConnector({
  compact,
  onSwapAccounts,
}: {
  compact: boolean;
  onSwapAccounts?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.connectorContainer,
        compact &&
          (onSwapAccounts
            ? styles.compactTransferConnectorContainer
            : styles.compactConnectorContainer),
      ]}
      testID="route-flow-connector"
    >
      {onSwapAccounts && (
        <PressScaleTouchable
          pressScale="subtle"
          onPress={onSwapAccounts}
          style={styles.connectorButton}
          hitSlop={Spacing.sm}
          accessibilityRole="button"
          accessibilityLabel="Swap send from and deposit into accounts"
          testID="route-flow-arrow"
        >
          <View
            pointerEvents="none"
            style={[
              styles.connectorSwapVisual,
              {
                backgroundColor: withOpacity(theme.primary, Opacity.soft),
                borderColor: withOpacity(theme.primary, Opacity.medium),
              },
            ]}
          >
            <AppIcon name={Icon.ArrowRight} size={Size.xs} color={theme.primary} />
          </View>
        </PressScaleTouchable>
      )}
      {!onSwapAccounts && (
        <View style={styles.connectorArrow} testID="route-flow-arrow">
          <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  connectorContainer: {
    width: Size.buttonSm,
    minHeight: Size.buttonLg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  compactConnectorContainer: {
    width: Size.xs,
    minHeight: Size.controlCompact,
    gap: Spacing.none,
  },
  compactTransferConnectorContainer: {
    width: Size.sm,
    minHeight: Size.controlCompact,
    gap: Spacing.none,
  },
  connectorButton: {
    width: Size.sm,
    height: Size.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorArrow: {
    width: Size.xs,
    height: Size.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorSwapVisual: {
    width: Size.sm,
    height: Size.sm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
