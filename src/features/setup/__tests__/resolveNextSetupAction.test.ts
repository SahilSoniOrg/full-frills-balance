import { Icon } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import { getRestoreAutoOutput } from '../restoreAutoOutput';
import { getSetupRecipe } from '../setupRecipes';
import { resolveNextSetupAction } from '../resolveNextSetupAction';
import type { FirstRunSetupDraft, RestoreSetupDraft, SetupSliceOutput } from '../setupTypes';

const operationId = asWorkplaceId('setup-operation');

function firstRun(overrides: Partial<FirstRunSetupDraft> = {}): FirstRunSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'first_run',
    journeyId: 'first_run',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: [],
    acceptedSlices: [],
    ...overrides,
  };
}

function restore(overrides: Partial<RestoreSetupDraft> = {}): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'first_run_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: [],
    acceptedSlices: [],
    restore: {},
    ...overrides,
  };
}

describe('resolveNextSetupAction', () => {
  it('presents the first required slice and reports recipe progress', () => {
    expect(resolveNextSetupAction(getSetupRecipe('first_run'), firstRun())).toEqual({
      kind: 'present',
      sliceId: 'device',
      progress: { current: 1, total: 4, completed: 0 },
    });
  });

  it('advances past accepted slices', () => {
    const draft = firstRun({
      acceptedSlices: ['device'],
      presentedHistory: ['device'],
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run'), draft)).toMatchObject({
      kind: 'present',
      sliceId: 'workplace',
      progress: { current: 2, total: 4, completed: 1 },
    });
  });

  it('does not count conditional restore screens before they are known to be needed', () => {
    expect(
      resolveNextSetupAction(getSetupRecipe('first_run_restore'), restore(), {
        getAutoOutput: getRestoreAutoOutput,
      }),
    ).toMatchObject({
      kind: 'present',
      sliceId: 'restore_source',
      progress: { current: 1, total: 4 },
    });
  });

  it('presents Workplace when restore facts omit currency', () => {
    const draft = restore({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: { workplace: { name: 'Books', icon: Icon.Briefcase } },
          },
        ],
      },
    });
    expect(
      resolveNextSetupAction(getSetupRecipe('first_run_restore'), draft, {
        getAutoOutput: getRestoreAutoOutput,
      }),
    ).toMatchObject({ kind: 'present', sliceId: 'workplace' });
  });

  it('auto-accepts when_missing only when an authoritative output exists', () => {
    const draft = restore({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source'],
      restore: {},
    });
    const output: SetupSliceOutput = {
      name: { value: 'Imported', source: 'imported' },
      icon: { value: Icon.Briefcase, source: 'imported' },
      baseCurrency: { value: 'USD', source: 'imported' },
      selectedAccounts: [],
      selectedCategories: [],
      acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
    };
    expect(
      resolveNextSetupAction(getSetupRecipe('first_run_restore'), draft, {
        getAutoOutput: sliceId => (sliceId === 'workplace' ? output : undefined),
      }),
    ).toEqual({ kind: 'auto_accept', sliceId: 'workplace', output });
    expect(resolveNextSetupAction(getSetupRecipe('first_run_restore'), draft)).toMatchObject({
      kind: 'present',
      sliceId: 'workplace',
    });
  });

  it('auto-completes Workplace from imported restore facts', () => {
    const draft = restore({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: {
              workplace: { name: 'Books', icon: Icon.Briefcase, defaultCurrencyCode: 'usd' },
            },
          },
        ],
      },
    });
    expect(
      resolveNextSetupAction(getSetupRecipe('first_run_restore'), draft, {
        getAutoOutput: getRestoreAutoOutput,
      }),
    ).toMatchObject({
      kind: 'auto_accept',
      sliceId: 'workplace',
      output: {
        name: { value: 'Books', source: 'imported' },
        baseCurrency: { value: 'USD', source: 'imported' },
      },
    });
  });

  it('always presents Appearance even when facts are available, then finishes accepted recipes', () => {
    const draft = firstRun({
      acceptedSlices: ['device', 'workplace'],
      presentedHistory: ['device', 'workplace'],
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run'), draft)).toMatchObject({
      kind: 'present',
      sliceId: 'appearance',
    });
    const complete = firstRun({
      acceptedSlices: ['device', 'workplace', 'appearance', 'summary'],
      presentedHistory: ['device', 'workplace', 'appearance', 'summary'],
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run'), complete)).toEqual({
      kind: 'finish',
    });
  });

  it('shows review before publication and then publishes after consent', () => {
    const prepared = restore({
      acceptedSlices: ['restore_source', 'workplace'],
      presentedHistory: ['restore_source'],
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run_restore'), prepared)).toMatchObject({
      kind: 'present',
      sliceId: 'restore_summary',
    });
    const accepted = restore({
      ...prepared,
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: { ...prepared.restore, summary: { intent: 'continue' } },
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run_restore'), accepted)).toEqual({
      kind: 'run_effect',
      effectId: 'publish_restore',
    });
    const published = restore({
      ...prepared,
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: { workplace: { name: 'Books' } },
          },
        ],
        summary: { intent: 'continue' },
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('published-workplace'),
            fingerprint: 'fingerprint',
            facts: { workplace: {} },
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run_restore'), published)).toMatchObject({
      kind: 'present',
      sliceId: 'device',
    });
  });

  it('reruns publication when bulk restore handoffs are incomplete', () => {
    const prepared = restore({
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      presentedHistory: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: { workplace: { name: 'Books' } },
          },
          {
            source: {
              uri: 'file:///backup.json',
              name: 'backup.json',
              fingerprint: 'abc',
              workplaceIndex: 1,
            },
            operationId: asWorkplaceId('operation-2'),
            facts: { workplace: { name: 'Books 2' } },
          },
        ],
        handoffs: [
          {
            operationId,
            workplaceId: operationId,
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
        summary: { intent: 'continue' },
      },
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run_restore'), prepared)).toEqual({
      kind: 'run_effect',
      effectId: 'publish_restore',
    });
  });

  it('reopens an explicitly active slice without changing accepted outputs', () => {
    const draft = firstRun({
      acceptedSlices: ['device', 'workplace'],
      presentedHistory: ['device', 'workplace'],
      activeSlice: 'device',
    });
    expect(resolveNextSetupAction(getSetupRecipe('first_run'), draft)).toMatchObject({
      kind: 'present',
      sliceId: 'device',
    });
  });
});
