import { AccountsGroupPager } from '@/src/features/accounts/components/AccountsGroupPager';

/** Both `accounts` and `categories` routes render the same group shell. */
export function AccountsListScreen(_props?: { activeTab?: 'accounts' | 'categories' }) {
  return <AccountsGroupPager />;
}

export default AccountsListScreen;
