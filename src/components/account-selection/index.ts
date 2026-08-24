/**
 * Shared account-selection capabilities.
 *
 * Feature code consumes this narrow surface instead of importing the Accounts
 * feature barrel, which also exports account screens and creates cycles.
 */
export {
  AccountPickerModal,
  MultiAccountPickerModal,
} from '@/src/features/accounts/components/AccountPickerModal';
export type {
  AccountPickerModalProps,
  MultiAccountPickerModalProps,
} from '@/src/features/accounts/components/AccountPickerModal';
export type { CreateAccountIntent } from '@/src/features/accounts/components/AccountPickerList';
export { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
export { getAccountFallbackIcon, getAccountIcon } from '@/src/utils/accountIcon';
export { getArchivedAccountTilePresentation } from '@/src/features/accounts/utils/archivedAccountDisplay';
