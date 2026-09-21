import { useAccountPickerList, type CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig, ChromeMotion } from '@/src/constants';
import { Opacity } from '@/src/constants/design-tokens';
import { useArchiveVisibility } from '@/src/contexts/ArchiveVisibilityScope';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { hasArchivedAccountsInList, pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Keyboard, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { routeAccountSelectorStyles as styles } from './SimpleFormAccountSections.styles';
import {
  RouteAccountDropdown,
  RouteAccountNode,
  RouteConnector,
} from './SimpleFormAccountSections.parts';
import { FOLDER_STROKE_WIDTH, useFolderLayoutAnimation } from './useFolderLayoutAnimation';

export type ExpansionPosition = 'left' | 'right' | null;

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
  sourceEmptyPrompt,
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
  const { theme } = useTheme();
  const { showArchived, setShowArchived } = useArchiveVisibility();
  const lastActiveSideRef = useRef<'left' | 'right'>(expansionPosition ?? 'left');

  useEffect(() => {
    if (expansionPosition) lastActiveSideRef.current = expansionPosition;
  }, [expansionPosition]);

  const activeSide = expansionPosition ?? lastActiveSideRef.current;
  const {
    animatedSvgStyle,
    containerWidth,
    dropdownMeasureStyle,
    effectiveHeight,
    isExpanded,
    isRevealVisible,
    onDropdownLayout,
    onLeftTabWrapperLayout,
    onTopRowLayout,
    reduceMotion,
    svgPath,
  } = useFolderLayoutAnimation({
    expansionPosition,
    activeSide,
  });
  const visualSide = expansionPosition ?? (isRevealVisible ? activeSide : null);
  const isLeftExpanded = visualSide === 'left';
  const isRightExpanded = visualSide === 'right';
  const showNodeLabels = displayMode === 'standard';

  const sourceAppearance = useMemo(
    () =>
      sourceAccount
        ? resolveAccountAppearance(sourceAccount, theme)
        : { accentColor: theme.textSecondary, categoryColor: theme.textSecondary },
    [sourceAccount, theme],
  );

  const destAppearance = useMemo(
    () =>
      destAccount
        ? resolveAccountAppearance(destAccount, theme)
        : { accentColor: theme.textSecondary, categoryColor: theme.textSecondary },
    [destAccount, theme],
  );

  const activeLabel = activeSide === 'left' ? sourceLabel : destLabel;
  const activeAccounts = activeSide === 'left' ? sourceAccounts : destAccounts;
  const activeAccentColor =
    activeSide === 'left' ? sourceAppearance.accentColor : destAppearance.accentColor;
  const activeEmptyPrompt =
    activeSide === 'left'
      ? (sourceEmptyPrompt ?? AppConfig.strings.transactionFlow.simpleEntry.chooseAccount)
      : (destEmptyPrompt ??
        (type === 'expense'
          ? AppConfig.strings.transactionFlow.simpleEntry.chooseCategory
          : AppConfig.strings.transactionFlow.simpleEntry.chooseAccount));
  const activeAccountId = activeSide === 'left' ? sourceAccount?.id : destAccount?.id;
  const pinnedAccountIds = useMemo(
    () =>
      pinnedArchivedAccountIds(
        activeAccountId && activeAccountId !== EMPTY_ACCOUNT_ID ? [activeAccountId] : [],
        activeAccounts,
      ),
    [activeAccountId, activeAccounts],
  );
  const { sections, toggleSection, collapsedSections } = useAccountPickerList({
    accounts: activeAccounts,
    excludeParentAccounts: true,
    pinnedAccountIds,
  });

  const hasSourceAccount = Boolean(sourceAccount && sourceAccount.id !== EMPTY_ACCOUNT_ID);
  const hasDestAccount = Boolean(destAccount && destAccount.id !== EMPTY_ACCOUNT_ID);
  const hasActiveSelectedAccount = activeSide === 'left' ? hasSourceAccount : hasDestAccount;

  const hasArchivedAccounts = useMemo(
    () => hasArchivedAccountsInList(allAccounts ?? activeAccounts),
    [allAccounts, activeAccounts],
  );

  const handleSelectActiveAccount = useCallback(
    (id: AccountId) => {
      Keyboard.dismiss();
      if (activeSide === 'left') {
        const nextId = sourceAccount?.id === id ? EMPTY_ACCOUNT_ID : id;
        onSelectSource(nextId);
      } else {
        const nextId = destAccount?.id === id ? EMPTY_ACCOUNT_ID : id;
        onSelectDestination(nextId);
      }
    },
    [activeSide, sourceAccount?.id, destAccount?.id, onSelectSource, onSelectDestination],
  );

  const handleClearActiveAccount = useCallback(() => {
    Keyboard.dismiss();
    if (activeSide === 'left') {
      onSelectSource(EMPTY_ACCOUNT_ID);
    } else {
      onSelectDestination(EMPTY_ACCOUNT_ID);
    }
  }, [activeSide, onSelectSource, onSelectDestination]);

  const dropdownBody = (
    <View collapsable={false} onLayout={onDropdownLayout} style={dropdownMeasureStyle}>
      <RouteAccountDropdown
        activeAccountId={activeAccountId}
        activeEmptyPrompt={activeEmptyPrompt}
        activeLabel={activeLabel}
        activeRole={activeSide === 'left' ? 'source' : 'destination'}
        collapsedSections={collapsedSections}
        hasActiveSelectedAccount={hasActiveSelectedAccount}
        hasArchivedAccounts={hasArchivedAccounts}
        isExpanded={isExpanded}
        onClear={handleClearActiveAccount}
        onCreateAccountRequest={onCreateAccountRequest}
        onSelect={handleSelectActiveAccount}
        sections={sections}
        setShowArchived={setShowArchived}
        showArchived={showArchived}
        testID={`${testIDPrefix}-${activeSide === 'left' ? 'source' : 'destination'}-dropdown`}
        toggleSection={toggleSection}
      />
    </View>
  );

  return (
    <Animated.View
      style={[styles.container, isRevealVisible && styles.expandedWrapper, containerStyle]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedSvgStyle]} pointerEvents="none">
        {svgPath !== '' && (
          <Svg width={containerWidth} height={effectiveHeight} pointerEvents="none">
            <Path
              d={svgPath}
              fill={withOpacity(theme.surfaceSecondary, Opacity.heavy)}
              stroke={withOpacity(activeAccentColor, Opacity.medium)}
              strokeWidth={FOLDER_STROKE_WIDTH}
            />
          </Svg>
        )}
      </Animated.View>

      <View style={styles.topRow} onLayout={onTopRowLayout}>
        <RouteAccountNode
          account={sourceAccount}
          emptyPrompt={
            sourceEmptyPrompt ?? AppConfig.strings.transactionFlow.simpleEntry.chooseAccount
          }
          isExpanded={isLeftExpanded}
          label={sourceLabel}
          showLabel={showNodeLabels}
          onLayout={onLeftTabWrapperLayout}
          onPress={() => {
            Keyboard.dismiss();
            onToggleExpansion('left');
          }}
          testID={`${testIDPrefix}-source-node`}
        />
        <RouteConnector type={type} onSwapAccounts={onSwapAccounts} />
        <RouteAccountNode
          account={destAccount}
          emptyPrompt={
            destEmptyPrompt ??
            (type === 'expense'
              ? AppConfig.strings.transactionFlow.simpleEntry.chooseCategory
              : AppConfig.strings.transactionFlow.simpleEntry.chooseAccount)
          }
          isExpanded={isRightExpanded}
          label={destLabel}
          showLabel={showNodeLabels}
          onPress={() => {
            Keyboard.dismiss();
            onToggleExpansion('right');
          }}
          testID={`${testIDPrefix}-destination-node`}
        />
      </View>

      <View
        style={[styles.dropdownLayer, !isExpanded && styles.dropdownCollapsed]}
        pointerEvents={isExpanded ? 'auto' : 'none'}
        accessibilityElementsHidden={!isExpanded}
        importantForAccessibility={isExpanded ? 'yes' : 'no-hide-descendants'}
      >
        {(!lazyDropdown || isRevealVisible) &&
          (reduceMotion ? (
            dropdownBody
          ) : (
            <MotiView
              key={activeSide}
              from={{ opacity: 0, translateY: -ChromeMotion.panelSlidePx }}
              animate={{
                opacity: isExpanded ? 1 : 0,
                translateY: isExpanded ? 0 : -ChromeMotion.panelSlidePx,
              }}
              transition={{ type: 'timing', duration: AppConfig.animation.normal }}
            >
              {dropdownBody}
            </MotiView>
          ))}
      </View>
    </Animated.View>
  );
});
