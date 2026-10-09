import { asAccountId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import type { AccountCardViewModel, AccountSectionViewModel } from '../../utils/transformAccounts';
import { buildAccountListRows } from '../accountListRows';

const account: AccountCardViewModel = {
  id: asAccountId('asset-1'),
  name: 'Asset',
  icon: Icon.Wallet,
  balance: 10,
  currencyCode: 'USD',
  depth: 0,
  categoryColor: '#000000',
  accountColor: '#ffffff',
  textColor: '#000000',
  hasChildren: false,
  isExpanded: false,
  isArchived: false,
  showMonthlyStats: false,
  monthlyIncome: 0,
  monthlyExpenses: 0,
};
const assets: AccountSectionViewModel = {
  title: 'Assets',
  count: 1,
  total: 10,
  totalColor: '#000000',
  isCollapsed: false,
  data: [account],
  accountIds: [account.id],
};
const liability = { ...account, id: asAccountId('liability-1'), name: 'Liability' };
const liabilities: AccountSectionViewModel = {
  ...assets,
  title: 'Liabilities',
  data: [liability],
  accountIds: [liability.id],
};

it('preserves section order and stable row identities through collapse and expansion', () => {
  const expanded = buildAccountListRows([assets, liabilities]);
  const collapsed = buildAccountListRows([{ ...assets, isCollapsed: true }, liabilities]);
  expect(expanded.map(row => row.key)).toEqual([
    'section:Assets',
    'account:asset-1',
    'section:Liabilities',
    'account:liability-1',
  ]);
  expect(collapsed.map(row => row.key)).toEqual([
    'section:Assets',
    'section:Liabilities',
    'account:liability-1',
  ]);
  expect(buildAccountListRows([assets, liabilities])).toEqual(expanded);
  expect(collapsed[0].section.accountIds).toEqual([account.id]);
});

it('keeps headers when all sections are collapsed and supports an empty list', () => {
  expect(
    buildAccountListRows([
      { ...assets, isCollapsed: true },
      { ...liabilities, isCollapsed: true },
    ]).map(row => row.kind),
  ).toEqual(['section', 'section']);
  expect(buildAccountListRows([])).toEqual([]);
});
