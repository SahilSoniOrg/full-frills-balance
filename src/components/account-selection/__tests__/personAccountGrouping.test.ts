import { act, renderHook } from '@testing-library/react-native';
import React from 'react';
import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { buildJournalPickerSections } from '../personAccountGrouping';
import { useAccountPickerList } from '../useAccountPickerList';

const accounts: AccountFields[] = [
  { id: asAccountId('mine'), name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'INR' },
  {
    id: asAccountId('maya'),
    name: 'Maya loan',
    accountType: AccountType.LIABILITY,
    currencyCode: 'INR',
  },
  {
    id: asAccountId('zoe'),
    name: 'Zoe loan',
    accountType: AccountType.LIABILITY,
    currencyCode: 'INR',
  },
];
const people = [
  { personId: 'maya-id', personName: 'Maya', accountIds: [asAccountId('maya')] },
  { personId: 'zoe-id', personName: 'Zoe', archived: true, accountIds: [asAccountId('zoe')] },
] as const;

describe('journal picker person grouping', () => {
  it('preserves standard account sections when people are omitted', () => {
    expect(buildJournalPickerSections(accounts).map(section => section.title)).toEqual([
      'Assets',
      'Liabilities',
    ]);
  });

  it('moves linked accounts into sorted People sections', () => {
    expect(
      buildJournalPickerSections(accounts, people).map(section => [
        section.title,
        section.data.map(a => a.id),
      ]),
    ).toEqual([
      ['Assets', [accounts[0].id]],
      ['People · Maya', [accounts[1].id]],
    ]);
  });

  it('hides archived people by default and includes them on request', () => {
    expect(
      buildJournalPickerSections(accounts, people).some(section => section.title.includes('Zoe')),
    ).toBe(false);
    expect(
      buildJournalPickerSections(accounts, people, true).some(
        section => section.title === 'People · Zoe',
      ),
    ).toBe(true);
  });

  it('searching a person name surfaces their linked accounts', () => {
    jest.useFakeTimers();
    const { result } = renderHook(
      () => useAccountPickerList({ accounts, excludeParentAccounts: false, peopleGroups: people }),
      {
        wrapper: ({ children }) =>
          React.createElement(ArchiveVisibilityScopeProvider, null, children),
      },
    );
    act(() => result.current.setSearchQuery('Maya'));
    act(() => jest.advanceTimersByTime(151));
    expect(
      result.current.sections.flatMap(section => section.data.map(account => account.id)),
    ).toEqual([accounts[1].id]);
    jest.useRealTimers();
  });
});
