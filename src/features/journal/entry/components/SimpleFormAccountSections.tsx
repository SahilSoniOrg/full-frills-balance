import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppIcon, Icon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { withOpacity } from '@/src/utils/color-math';
import React, { useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
          role: 'source',
        }
      : {
          account: destAccount,
          accounts: destAccounts,
          emptyPrompt: resolvedDestEmptyPrompt,
          label: destLabel,
          onSelect: onSelectDestination,
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
        compact && !onSwapAccounts && styles.compactConnectorContainer,
      ]}
      testID="route-flow-connector"
    >
      <View style={styles.connectorArrow} testID="route-flow-arrow">
        <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
      </View>
      {onSwapAccounts && (
        <TouchableOpacity
          onPress={onSwapAccounts}
          style={styles.connectorSwapTouchTarget}
          hitSlop={Spacing.xs}
          accessibilityRole="button"
          accessibilityLabel="Swap send from and deposit into accounts"
          testID="route-swap-accounts-button"
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
            <AppIcon name={Icon.SwapHorizontal} size={Size.xxs} color={theme.primary} />
          </View>
        </TouchableOpacity>
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
  connectorArrow: {
    width: Size.xs,
    height: Size.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorSwapTouchTarget: {
    width: Size.iconLg,
    height: Size.iconLg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorSwapVisual: {
    width: Size.md,
    height: Size.md,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
