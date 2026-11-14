import { Icon } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import {
  createSetupCoordinator,
  createSetupDraft,
  startFirstRunRestoreFromDeviceName,
} from '../SetupCoordinator';
import type {
  RestoreSetupDraft,
  WorkplaceSetupOutput,
} from '../setupTypes';

const mockCommitDevice = jest.fn();

const operationId = asWorkplaceId('operation');

const workplace: WorkplaceSetupOutput = {
  name: { value: 'Personal', source: 'user_entered' },
  icon: { value: Icon.Briefcase, source: 'defaulted' },
  baseCurrency: { value: 'USD', source: 'user_entered' },
  selectedAccounts: [],
  selectedCategories: [],
  acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
};

const source = {
  source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
  facts: { workplace: { name: 'Imported', defaultCurrencyCode: 'USD' } },
};

function unusedFinish(): Promise<{ kind: 'journey_discarded' }> {
  return Promise.reject(new Error('finish should not run'));
}

function memoryStore() {
  let stored: RestoreSetupDraft | undefined;
  return {
    saves: [] as RestoreSetupDraft[],
    clears: 0,
    save(next: RestoreSetupDraft) {
      stored = next;
      this.saves.push(next);
    },
    clear() {
      stored = undefined;
      this.clears += 1;
    },
    current: () => stored,
  };
}

describe('SetupCoordinator', () => {
  beforeEach(() => {
    mockCommitDevice.mockReset();
  });

  it('seeds first-run restore from the entered device name', () => {
    const store = memoryStore();

    startFirstRunRestoreFromDeviceName('  Sahil  ', store);

    expect(store.current()).toMatchObject({
      journeyId: 'first_run_restore',
      kind: 'restore',
      restore: { deviceCandidate: { value: 'Sahil', source: 'user_entered' } },
    });
  });

  it('creates a restore draft, accepts a slice, and persists the checkpoint', async () => {
    const store = memoryStore();
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'restore_source' });
    coordinator.present('restore_source');
    await coordinator.accept('restore_source', [source]);
    expect(coordinator.getDraft()).toMatchObject({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source'],
      restore: { sources: [source] },
    });
    expect(store.current()).toMatchObject({ acceptedSlices: ['restore_source'] });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'workplace' });
  });

  it('does not persist Device output when the checkpoint write fails', async () => {
    mockCommitDevice.mockImplementation(() => {
      throw new Error('prefs');
    });
    const store = memoryStore();
    const published: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'first_run_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source', 'restore_summary'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [source],
        summary: { intent: 'continue' },
        handoffs: [
          {
            operationId,
            workplaceId: operationId,
            fingerprint: 'abc',
            facts: source.facts,
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run_restore',
      operationId,
      draft: published,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'device' });
    await expect(
      coordinator.accept('device', {
        displayName: { value: 'Sahil', source: 'user_entered' },
      }),
    ).rejects.toThrow('prefs');
    expect(coordinator.getDraft().acceptedSlices).toEqual(published.acceptedSlices);
    expect(coordinator.getDraft()).not.toHaveProperty('device');
  });

  it('runs authoritative auto-acceptance one checkpoint at a time', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'first_run_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace'],
      restore: { sources: [source] },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run_restore',
      operationId,
      draft,
      draftStore: store,
      resolution: { getAutoOutput: sliceId => (sliceId === 'workplace' ? workplace : undefined) },
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    expect(await coordinator.advanceAutoAccepted()).toMatchObject({
      kind: 'present',
      sliceId: 'restore_summary',
    });
    expect(coordinator.getDraft().acceptedSlices).toContain('workplace');
  });

  it('runs the device finisher for an auto-accepted device slice', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'first_run_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [source],
        summary: { intent: 'continue' },
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
      },
      workplace,
    };
    const device = { displayName: { value: 'Imported', source: 'imported' as const } };
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run_restore',
      operationId,
      draft,
      draftStore: store,
      resolution: { getAutoOutput: sliceId => (sliceId === 'device' ? device : undefined) },
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });

    await coordinator.advanceAutoAccepted();

    expect(mockCommitDevice).toHaveBeenCalledWith(device);
  });

  it('persists the restore handoff only after the injected publication effect succeeds', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'settings_restore',
      entryPolicy: 'optional',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: { sources: [source], summary: { intent: 'open' } },
      workplace,
    };
    const publishRestore = jest.fn().mockResolvedValue([
      {
        operationId,
        workplaceId: asWorkplaceId('published'),
        fingerprint: 'abc',
        facts: { workplace: {} },
        stats: { accounts: 1, journals: 2, transactions: 3, skippedTransactions: 0 },
        warnings: [],
      },
    ]);
    const coordinator = createSetupCoordinator({
      journeyId: 'settings_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      resolution: {
        getAutoOutput: sliceId => (sliceId === 'workplace' ? workplace : undefined),
      },
      effects: { publishRestore, commitDevice: mockCommitDevice },
    });
    expect(await coordinator.runPendingEffect()).toEqual({ kind: 'finish' });
    expect(publishRestore).toHaveBeenCalledTimes(1);
    expect(coordinator.getDraft()).toMatchObject({
      restore: {
        handoffs: [{ workplaceId: 'published' }],
      },
    });
  });

  it('advances automatic setup steps after restore publication', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'first_run_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: { sources: [source], summary: { intent: 'continue' } },
      workplace,
    };
    const device = { displayName: { value: 'Imported', source: 'imported' as const } };
    const publishRestore = jest.fn().mockResolvedValue([
      {
        operationId,
        workplaceId: operationId,
        fingerprint: 'abc',
        facts: { workplace: {} },
        stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
        warnings: [],
      },
    ]);
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run_restore',
      operationId,
      draft,
      draftStore: store,
      resolution: { getAutoOutput: sliceId => (sliceId === 'device' ? device : undefined) },
      finish: unusedFinish,
      effects: { publishRestore, commitDevice: mockCommitDevice },
    });

    await expect(coordinator.runPendingEffect()).resolves.toEqual({ kind: 'finish' });
    expect(mockCommitDevice).toHaveBeenCalledWith(device);
    expect(coordinator.getDraft().acceptedSlices).toContain('device');
  });

  it('persists every batch restore handoff after publication', async () => {
    const store = memoryStore();
    const secondOperationId = asWorkplaceId('operation-2');
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'settings_restore',
      entryPolicy: 'optional',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [
          source,
          {
            source: { ...source.source, workplaceIndex: 1 },
            facts: { workplace: { name: 'Books 2' } },
            operationId: secondOperationId,
          },
        ],
        summary: { intent: 'open' },
      },
      workplace,
    };
    const secondary = {
      operationId: secondOperationId,
      workplaceId: secondOperationId,
      fingerprint: 'abc',
      facts: { workplace: { name: 'Books 2' } },
      stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
      warnings: [],
    };
    const publishRestore = jest.fn().mockResolvedValue([
      {
        operationId,
        workplaceId: asWorkplaceId('published'),
        fingerprint: 'abc',
        facts: { workplace: {} },
        stats: { accounts: 1, journals: 2, transactions: 3, skippedTransactions: 0 },
        warnings: [],
      },
      secondary,
    ]);
    const coordinator = createSetupCoordinator({
      journeyId: 'settings_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      resolution: {
        getAutoOutput: sliceId => (sliceId === 'workplace' ? workplace : undefined),
      },
      effects: { publishRestore, commitDevice: mockCommitDevice },
    });
    await coordinator.runPendingEffect();
    expect(coordinator.getDraft()).toMatchObject({
      restore: {
        handoffs: [{ workplaceId: 'published' }, { workplaceId: secondOperationId }],
      },
    });
  });

  it('skips republication when stored handoffs already complete the effect', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [source],
        summary: { intent: 'open' },
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('published'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
      workplace,
    };
    const publishRestore = jest.fn();
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { publishRestore, commitDevice: mockCommitDevice },
    });
    expect(await coordinator.runPendingEffect()).toEqual({ kind: 'finish' });
    expect(publishRestore).not.toHaveBeenCalled();
  });

  it('returns to restore summary after editing an accepted workplace slice', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source', 'workplace', 'restore_summary'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      workplace,
      restore: { sources: [source], summary: { intent: 'open' } },
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.edit('workplace');
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'workplace' });
    await coordinator.accept('workplace', {
      ...workplace,
      name: { value: 'Renamed', source: 'user_entered' },
    });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'restore_summary' });
    expect(coordinator.getDraft().activeSlice).toBe('restore_summary');
  });

  it('returns at_start when backing from the first restore slice', () => {
    const coordinator = createSetupCoordinator({
      journeyId: 'picker_restore',
      operationId,
      draftStore: memoryStore(),
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.present('restore_source');

    expect(coordinator.back()).toEqual({ kind: 'at_start' });
  });

  it('keeps a published restore draft when finishing fails and clears only after success', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source', 'workplace', 'restore_summary'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      workplace,
      restore: {
        sources: [source],
        summary: { intent: 'open' },
        handoffs: [
          {
            operationId,
            workplaceId: operationId,
            fingerprint: 'abc',
            facts: source.facts,
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
    };
    const finisher = jest
      .fn()
      .mockRejectedValueOnce(new Error('retry'))
      .mockResolvedValue({ kind: 'restore_accepted', workplaceId: operationId, next: 'open' });
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draft,
      draftStore: store,
      finish: finisher,
      effects: { commitDevice: mockCommitDevice },
    });
    await expect(coordinator.finish()).rejects.toThrow('retry');
    expect(store.clears).toBe(0);
    await expect(coordinator.finish()).resolves.toEqual({
      kind: 'restore_accepted',
      workplaceId: operationId,
      next: 'open',
    });
    expect(store.clears).toBe(1);
    expect(finisher).toHaveBeenCalledTimes(2);
  });

  it('takes entry policy from the recipe', () => {
    expect(createSetupDraft('settings_restore', operationId).entryPolicy).toBe('optional');
    expect(createSetupDraft('first_run_restore', operationId).entryPolicy).toBe('blocking');
    expect(createSetupDraft('empty_device_restore', operationId).entryPolicy).toBe('blocking');
  });

  it('drops restore publication when a different source is accepted', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'settings_restore',
      entryPolicy: 'optional',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace'],
      restore: { sources: [source] },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'settings_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.edit('restore_source');
    await coordinator.accept('restore_source', [
      {
        source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
        facts: { workplace: { name: 'Other' } },
      },
    ]);
    const next = coordinator.getDraft();
    expect(next.acceptedSlices).toEqual(['restore_source']);
    expect(next.kind === 'restore' && next.restore.handoffs).toBeUndefined();
    expect(next.workplace).toBeUndefined();
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'workplace' });
  });

  it('keeps a published handoff when the same backup is reselected', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source', 'restore_summary'],
      acceptedSlices: ['restore_source', 'workplace'],
      restore: {
        sources: [source],
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('published'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.edit('restore_source');
    await coordinator.accept('restore_source', [
      {
        ...source,
        source: { ...source.source, uri: 'file:///reselected.json' },
      },
    ]);
    expect(coordinator.getDraft()).toMatchObject({
      restore: {
        sources: [{ source: { uri: 'file:///reselected.json', fingerprint: 'abc' } }],
        handoffs: [{ workplaceId: 'published' }],
      },
    });
  });

  it('resets downstream state when switching to a different backup source', async () => {
    const store = memoryStore();
    const discardRestorePublication = jest.fn().mockResolvedValue(undefined);
    const source = {
      source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
      facts: { workplace: { name: 'Initial' } },
    };
    const workplace: WorkplaceSetupOutput = {
      name: { value: 'Workplace', source: 'imported' },
      icon: { value: Icon.Briefcase, source: 'imported' },
      baseCurrency: { value: 'USD', source: 'imported' },
      selectedAccounts: [],
      selectedCategories: [],
      acceptedCheckpoints: ['identity', 'currency'],
    };
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      operationId,
      entryPolicy: 'blocking',
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [source],
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('published'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'empty_device_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice, discardRestorePublication },
    });
    coordinator.edit('restore_source');
    await coordinator.accept('restore_source', [
      {
        source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
        facts: { workplace: { name: 'Other' } },
      },
    ]);
    expect(coordinator.getDraft()).toMatchObject({
      acceptedSlices: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
          },
        ],
      },
    });
    const updatedDraft = coordinator.getDraft();
    expect(
      updatedDraft.kind === 'restore' ? updatedDraft.restore.handoffs : undefined,
    ).toBeUndefined();
    expect(updatedDraft.workplace).toBeUndefined();
    expect(discardRestorePublication).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        restore: expect.objectContaining({ handoffs: draft.restore.handoffs }),
      }),
    );
  });

  it('discards publication when the selected workplace set changes', async () => {
    const store = memoryStore();
    const secondOperationId = asWorkplaceId('operation-2');
    const secondary = {
      source: { ...source.source, workplaceIndex: 1, fingerprint: 'abc-2' },
      facts: { workplace: { name: 'Books 2' } },
      operationId: secondOperationId,
    };
    const discardRestorePublication = jest.fn().mockResolvedValue(undefined);
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'settings_restore',
      entryPolicy: 'optional',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        sources: [source, secondary],
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('published'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
            warnings: [],
          },
          {
            operationId: secondOperationId,
            workplaceId: secondOperationId,
            fingerprint: 'abc-2',
            facts: { workplace: { name: 'Books 2' } },
            stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
      workplace,
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'settings_restore',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice, discardRestorePublication },
    });
    coordinator.edit('restore_source');
    await coordinator.accept('restore_source', [source]);
    expect(discardRestorePublication).toHaveBeenCalledTimes(1);
    const next = coordinator.getDraft();
    expect(next).toMatchObject({
      acceptedSlices: ['restore_source'],
      restore: { sources: [source] },
    });
    expect(next.kind === 'restore' ? next.restore.handoffs : undefined).toBeUndefined();
  });
});
