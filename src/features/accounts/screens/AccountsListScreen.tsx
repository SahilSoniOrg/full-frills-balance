import { AccountsPagerLeaf } from '../components/AccountsPagerLeaf';

export function AccountsListScreen({ tab = 'accounts' }: { tab?: 'accounts' | 'categories' }) {
  return <AccountsPagerLeaf tab={tab} />;
}

export default AccountsListScreen;
