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
import { useCallback, useMemo, type ReactNode } from 'react';
import {
  Keyboard,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AccountPickerDropdown } from './AccountPickerPanel.parts';
import { accountPickerStyles as styles } from './AccountPickerPanel.styles';
import { FOLDER_STROKE_WIDTH, useFolderLayoutAnimation } from './useFolderLayoutAnimation';

export type ExpansionPosition = 'left' | 'right' | null;

/** The account leg whose dropdown the panel currently shows. */
export interface AccountPickerLeg {
  account?: AccountFields;
  accounts: AccountFields[];
  emptyPrompt: string;
  label: string;
  onSelect: (id: AccountId) => void;
  role: AccountRole;
}

export interface AccountPickerPanelLayout {
  /** Side drawn as open, including while the collapse animation is still visible. */
  visualSide: ExpansionPosition;
  onLeftTabWrapperLayout: (event: LayoutChangeEvent) => void;
}

interface AccountPickerPanelProps {
  activeLeg: AccountPickerLeg;
  activeSide: 'left' | 'right';
  allAccounts?: AccountFields[];
  containerStyle?: StyleProp<ViewStyle>;
  dropdownTestID: string;
  expansionPosition: ExpansionPosition;
  lazyDropdown?: boolean;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  renderNodes: (layout: AccountPickerPanelLayout) => ReactNode;
}

/**
 * Folder-shaped account selector: a row of tab nodes over an animated dropdown for the
 * active leg. Callers render the nodes; the panel owns the list, archive toggle, and motion.
 */
export function AccountPickerPanel({
  activeLeg,
  activeSide,
  allAccounts,
  containerStyle,
  dropdownTestID,
  expansionPosition,
  lazyDropdown = false,
  onCreateAccountRequest,
  renderNodes,
}: AccountPickerPanelProps) {
  const { theme } = useTheme();
  const { showArchived, setShowArchived } = useArchiveVisibility();
  const { account, accounts, emptyPrompt, label, onSelect, role } = activeLeg;
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
  const accentColor = useMemo(
    () => (account ? resolveAccountAppearance(account, theme).accentColor : theme.textSecondary),
    [account, theme],
  );
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
  } = useFolderLayoutAnimation({ expansionPosition, activeSide });
  const visualSide = expansionPosition ?? (isRevealVisible ? activeSide : null);

  const handleSelect = useCallback(
    (id: AccountId) => {
      Keyboard.dismiss();
      onSelect(activeAccountId === id ? EMPTY_ACCOUNT_ID : id);
    },
    [activeAccountId, onSelect],
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
        isExpanded={isExpanded}
        onClear={handleClear}
        onCreateAccountRequest={onCreateAccountRequest}
        onSelect={handleSelect}
        sections={sections}
        setShowArchived={setShowArchived}
        showArchived={showArchived}
        testID={dropdownTestID}
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
              stroke={withOpacity(accentColor, Opacity.medium)}
              strokeWidth={FOLDER_STROKE_WIDTH}
            />
          </Svg>
        )}
      </Animated.View>

      <View style={styles.topRow} onLayout={onTopRowLayout}>
        {renderNodes({ visualSide, onLeftTabWrapperLayout })}
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
}
