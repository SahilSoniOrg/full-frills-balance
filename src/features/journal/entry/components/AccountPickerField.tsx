import { useAccountPickerList, type CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig, ChromeMotion } from '@/src/constants';
import { Opacity } from '@/src/constants/design-tokens';
import { useArchiveVisibility } from '@/src/contexts/ArchiveVisibilityScope';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountRole } from '@/src/types/domainJournal';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { hasArchivedAccountsInList, pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { MotiView } from 'moti';
import { useCallback, useMemo } from 'react';
import { Keyboard, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AccountPickerDropdown, AccountPickerNode } from './SimpleFormAccountSections.parts';
import { routeAccountSelectorStyles as styles } from './SimpleFormAccountSections.styles';
import { FOLDER_STROKE_WIDTH, useFolderLayoutAnimation } from './useFolderLayoutAnimation';

export interface AccountPickerFieldProps {
  account?: AccountFields;
  accounts: AccountFields[];
  allAccounts?: AccountFields[];
  containerStyle?: StyleProp<ViewStyle>;
  displayMode?: 'standard' | 'compact';
  emptyPrompt: string;
  isExpanded: boolean;
  label: string;
  lazyDropdown?: boolean;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  onSelect: (id: AccountId) => void;
  onToggle: () => void;
  role: AccountRole;
  testIDPrefix?: string;
}

/** A single account selector. Simple mode composes two of these with a route connector. */
export function AccountPickerField({
  account,
  accounts,
  allAccounts,
  containerStyle,
  displayMode = 'standard',
  emptyPrompt,
  isExpanded,
  label,
  lazyDropdown = false,
  onCreateAccountRequest,
  onSelect,
  onToggle,
  role,
  testIDPrefix = 'account-picker',
}: AccountPickerFieldProps) {
  const { theme } = useTheme();
  const { showArchived, setShowArchived } = useArchiveVisibility();
  const activeAccountId = account?.id;
  const pinnedAccountIds = useMemo(
    () =>
      pinnedArchivedAccountIds(
        activeAccountId && activeAccountId !== EMPTY_ACCOUNT_ID ? [activeAccountId] : [],
        accounts,
      ),
    [activeAccountId, accounts],
  );
  const { sections, toggleSection, collapsedSections } = useAccountPickerList({
    accounts,
    excludeParentAccounts: true,
    pinnedAccountIds,
  });
  const hasSelectedAccount = Boolean(account && account.id !== EMPTY_ACCOUNT_ID);
  const hasArchivedAccounts = useMemo(
    () => hasArchivedAccountsInList(allAccounts ?? accounts),
    [allAccounts, accounts],
  );
  const appearance = useMemo(
    () =>
      account
        ? resolveAccountAppearance(account, theme)
        : { accentColor: theme.textSecondary, categoryColor: theme.textSecondary },
    [account, theme],
  );
  const {
    animatedSvgStyle,
    containerWidth,
    dropdownMeasureStyle,
    effectiveHeight,
    isRevealVisible,
    isExpanded: animationExpanded,
    onDropdownLayout,
    onLeftTabWrapperLayout,
    onTopRowLayout,
    reduceMotion,
    svgPath,
  } = useFolderLayoutAnimation({
    expansionPosition: isExpanded ? 'left' : null,
    activeSide: 'left',
  });
  const showNodeLabels = displayMode === 'standard';

  const handleSelect = useCallback(
    (id: AccountId) => {
      Keyboard.dismiss();
      onSelect(account?.id === id ? EMPTY_ACCOUNT_ID : id);
    },
    [account?.id, onSelect],
  );

  const handleClear = useCallback(() => {
    Keyboard.dismiss();
    onSelect(EMPTY_ACCOUNT_ID);
  }, [onSelect]);

  const dropdownBody = (
    <View collapsable={false} onLayout={onDropdownLayout} style={dropdownMeasureStyle}>
      <AccountPickerDropdown
        selectedAccountId={activeAccountId}
        emptyPrompt={emptyPrompt}
        label={label}
        role={role}
        collapsedSections={collapsedSections}
        hasSelectedAccount={hasSelectedAccount}
        hasArchivedAccounts={hasArchivedAccounts}
        isExpanded={animationExpanded}
        onClear={handleClear}
        onCreateAccountRequest={onCreateAccountRequest}
        onSelect={handleSelect}
        sections={sections}
        setShowArchived={setShowArchived}
        showArchived={showArchived}
        testID={`${testIDPrefix}-source-dropdown`}
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
              stroke={withOpacity(appearance.accentColor, Opacity.medium)}
              strokeWidth={FOLDER_STROKE_WIDTH}
            />
          </Svg>
        )}
      </Animated.View>

      <View style={styles.topRow} onLayout={onTopRowLayout}>
        <AccountPickerNode
          account={account}
          emptyPrompt={emptyPrompt}
          isExpanded={isExpanded || isRevealVisible}
          label={label}
          showLabel={showNodeLabels}
          onLayout={onLeftTabWrapperLayout}
          onPress={() => {
            Keyboard.dismiss();
            onToggle();
          }}
          testID={`${testIDPrefix}-source-node`}
        />
      </View>

      <View
        style={[styles.dropdownLayer, !animationExpanded && styles.dropdownCollapsed]}
        pointerEvents={animationExpanded ? 'auto' : 'none'}
        accessibilityElementsHidden={!animationExpanded}
        importantForAccessibility={animationExpanded ? 'yes' : 'no-hide-descendants'}
      >
        {(!lazyDropdown || isRevealVisible) &&
          (reduceMotion ? (
            dropdownBody
          ) : (
            <MotiView
              from={{ opacity: 0, translateY: -ChromeMotion.panelSlidePx }}
              animate={{
                opacity: animationExpanded ? 1 : 0,
                translateY: animationExpanded ? 0 : -ChromeMotion.panelSlidePx,
              }}
              transition={{ type: 'timing', duration: AppConfig.animation.normal }}
            >
              {dropdownBody}
            </MotiView>
          ))}
      </View>
    </Animated.View>
  );
}
