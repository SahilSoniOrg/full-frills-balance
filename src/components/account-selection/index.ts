/**
 * Shared account-selection capabilities.
 *
 * Feature code consumes this narrow surface instead of importing the Accounts
 * feature barrel, which also exports account screens and creates cycles.
 */
export { AccountPickerModal, MultiAccountPickerModal } from './AccountPickerModal';
export type { AccountPickerModalProps, MultiAccountPickerModalProps } from './AccountPickerModal';
export type { CreateAccountIntent } from './AccountPickerList';
export { useAccounts } from '@/src/hooks/useAccounts';
export { getAccountFallbackIcon, getAccountIcon } from '@/src/utils/accountIcon';
export { getArchivedAccountTilePresentation } from '@/src/components/accounts/archivedAccountDisplay';
