import { Icon } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import { selectPreparedRestoreSources } from '../pickRestoreSource';
import { sameRestoreSources, type RestoreSourceOutput } from '../setupTypes';

function source(name: string, index: number): RestoreSourceOutput {
  return {
    source: {
      uri: 'file:///backup.json',
      name: 'backup.json',
      fingerprint: `fingerprint-${index}`,
      workplaceIndex: index,
    },
    facts: { workplace: { name, icon: Icon.Briefcase, defaultCurrencyCode: 'USD' } },
    stats: { accounts: index + 1, journals: 0, transactions: 0, skippedTransactions: 0 },
    warnings: [],
    ...(index === 0 ? {} : { operationId: asWorkplaceId(`operation-${index}`) }),
  };
}

const sources = [source('Personal', 0), source('Work', 1), source('Side project', 2)];

describe('selectPreparedRestoreSources', () => {
  it('keeps any selected subset in source order', () => {
    const selected = selectPreparedRestoreSources(sources, [2, 0]);

    expect(selected?.map(item => item.facts.workplace.name)).toEqual(['Personal', 'Side project']);
  });

  it('promotes a selected secondary workplace when the original primary is discarded', () => {
    const selected = selectPreparedRestoreSources(sources, [1]);

    expect(selected?.map(item => item.facts.workplace.name)).toEqual(['Work']);
  });

  it('returns no publication plan when every workplace is discarded', () => {
    expect(selectPreparedRestoreSources(sources, [])).toBeUndefined();
  });
});

describe('sameRestoreSources', () => {
  it('treats URI-only changes as the same publication plan', () => {
    expect(
      sameRestoreSources(sources, [
        { ...sources[0], source: { ...sources[0].source, uri: 'file:///other.json' } },
        sources[1],
        sources[2],
      ]),
    ).toBe(true);
  });

  it('treats a different selected set as a new publication plan', () => {
    expect(sameRestoreSources(sources, [sources[0], sources[2]])).toBe(false);
  });
});
