import { flattenAccountTree } from '../accountTreeProjection';
import { createAccountTreeSnapshot } from '../accountTree';

const id = (value: string) => value as never;

describe('flattenAccountTree', () => {
  it('projects arbitrary depth into one ordered list', () => {
    const rows = flattenAccountTree(
      createAccountTreeSnapshot([
        { id: id('root'), accountType: 'ASSET', orderNum: 0, name: 'Root' },
        { id: id('sibling'), accountType: 'ASSET', orderNum: 1, name: 'Sibling' },
        {
          id: id('child'),
          accountType: 'ASSET',
          parentAccountId: id('root'),
          orderNum: 0,
          name: 'Child',
        },
        {
          id: id('grandchild'),
          accountType: 'ASSET',
          parentAccountId: id('child'),
          orderNum: 0,
          name: 'Grandchild',
        },
        {
          id: id('great-grandchild'),
          accountType: 'ASSET',
          parentAccountId: id('grandchild'),
          orderNum: 0,
          name: 'Great-grandchild',
        },
      ]),
      { expandedAccountIds: new Set([id('root'), id('child'), id('grandchild')]) },
    );

    expect(rows.map(row => row.accountId)).toEqual([
      'root',
      'child',
      'grandchild',
      'great-grandchild',
      'sibling',
    ]);
    expect(rows.map(row => row.depth)).toEqual([0, 1, 2, 3, 0]);
    expect(rows[0]).toMatchObject({
      childCount: 1,
      isExpanded: true,
    });
    expect(rows[2]).toMatchObject({
      childCount: 1,
      isExpanded: true,
    });
  });

  it('omits collapsed descendants while retaining actual child counts', () => {
    const rows = flattenAccountTree(
      createAccountTreeSnapshot([
        { id: id('root'), accountType: 'ASSET', orderNum: 0 },
        { id: id('child'), accountType: 'ASSET', parentAccountId: id('root'), orderNum: 0 },
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      childCount: 1,
      isExpanded: false,
    });
  });

  it('marks the first visible root of each account type as a section', () => {
    const rows = flattenAccountTree(
      createAccountTreeSnapshot([
        { id: id('asset-1'), accountType: 'ASSET', orderNum: 0 },
        { id: id('asset-2'), accountType: 'ASSET', orderNum: 1 },
        { id: id('equity-1'), accountType: 'EQUITY', orderNum: 0 },
      ]),
    );

    expect(rows.map(row => row.sectionLabel)).toEqual(['Assets', undefined, 'Equity']);
  });

  it('keeps a collapsed type section visible while hiding its accounts', () => {
    const rows = flattenAccountTree(
      createAccountTreeSnapshot([
        { id: id('asset'), accountType: 'ASSET', orderNum: 0 },
        { id: id('asset-child'), accountType: 'ASSET', parentAccountId: id('asset'), orderNum: 0 },
        { id: id('equity'), accountType: 'EQUITY', orderNum: 0 },
      ]),
      { collapsedAccountTypes: new Set(['ASSET']) },
    );

    expect(rows.map(row => row.accountId)).toEqual(['asset', 'equity']);
    expect(rows[0]).toMatchObject({ sectionLabel: 'Assets', isSectionCollapsed: true });
  });
});
