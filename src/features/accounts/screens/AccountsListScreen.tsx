import { AccountsGroupPager } from '@/src/features/accounts/components/AccountsGroupPager';

/** Both `accounts` and `categories` routes render the same group shell. */
export function AccountsListScreen() {
  return <AccountsGroupPager />;
}

export default AccountsListScreen;
