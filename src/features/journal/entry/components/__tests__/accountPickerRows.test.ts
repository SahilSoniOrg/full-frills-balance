import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { buildAccountPickerRows } from '../accountPickerRows';

const accounts = Array.from({ length: 250 }, (_, index) => ({
  id: asAccountId(`account-${index}`),
  name: `Account ${index}`,
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
})) as AccountFields[];

describe('buildAccountPickerRows', () => {
  const sections = [{ key: 'assets', title: 'Assets', type: AccountType.ASSET, data: accounts }];

  it('keeps every account accessible through bounded wrapping groups', () => {
    const rows = buildAccountPickerRows(sections, new Set());
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({
      kind: 'section',
      key: 'assets',
      sectionIndex: 0,
      collapsed: false,
    });
    expect(rows.slice(1).every(row => row.kind === 'accounts' && row.accounts.length <= 24)).toBe(
      true,
    );
    expect(
      rows.flatMap(row => (row.kind === 'accounts' ? row.accounts.map(account => account.id) : [])),
    ).toEqual(accounts.map(account => account.id));
  });

  it('keeps section headers available while collapsed', () => {
    expect(buildAccountPickerRows(sections, new Set(['assets']))).toEqual([
      { key: 'assets', kind: 'section', section: sections[0], sectionIndex: 0, collapsed: true },
    ]);
  });
});
