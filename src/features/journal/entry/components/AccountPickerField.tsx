import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { Keyboard, type StyleProp, type ViewStyle } from 'react-native';
import { AccountPickerPanel } from './AccountPickerPanel';
import { AccountPickerNode } from './AccountPickerPanel.parts';

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
  return (
    <AccountPickerPanel
      activeLeg={{ account, accounts, emptyPrompt, label, onSelect, role }}
      activeSide="left"
      allAccounts={allAccounts}
      containerStyle={containerStyle}
      dropdownTestID={`${testIDPrefix}-source-dropdown`}
      expansionPosition={isExpanded ? 'left' : null}
      lazyDropdown={lazyDropdown}
      onCreateAccountRequest={onCreateAccountRequest}
      renderNodes={({ visualSide, onLeftTabWrapperLayout }) => (
        <AccountPickerNode
          account={account}
          emptyPrompt={emptyPrompt}
          isExpanded={visualSide === 'left'}
          label={label}
          showLabel={displayMode === 'standard'}
          onLayout={onLeftTabWrapperLayout}
          onPress={() => {
            Keyboard.dismiss();
            onToggle();
          }}
          testID={`${testIDPrefix}-source-node`}
        />
      )}
    />
  );
}
