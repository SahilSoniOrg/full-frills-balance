import { asWorkplaceId } from '@/src/types/ids';
import {
  createSetupCoordinator,
  createSetupDraft,
  startFirstRunRestoreFromDeviceName,
} from '../SetupCoordinator';
import type {
  FirstRunSetupDraft,
  RestoreSetupDraft,
  SetupDraft,
  SetupOutcome,
  WorkplaceSetupOutput,
} from '../setupTypes';

const mockCommitDevice = jest.fn();

const operationId = asWorkplaceId('operation');

const workplace: WorkplaceSetupOutput = {
  name: { value: 'Personal', source: 'user_entered' },
  icon: { value: 'briefcase', source: 'defaulted' },
  baseCurrency: { value: 'USD', source: 'user_entered' },
  selectedAccounts: [],
  selectedCategories: [],
  acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
};

const source = {
  source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
  facts: { workplace: { name: 'Imported', defaultCurrencyCode: 'USD' } },
};

function unusedFinish(): Promise<SetupOutcome> {
  return Promise.reject(new Error('finish should not run'));
}

function memoryStore() {
  let stored: SetupDraft | undefined;
  return {
    saves: [] as SetupDraft[],
    clears: 0,
    save(next: SetupDraft) {
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

  it('creates a draft, accepts a slice, and persists the checkpoint', async () => {
    const store = memoryStore();
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'device' });
    coordinator.present('device');
    await coordinator.accept('device', {
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
    expect(coordinator.getDraft()).toMatchObject({
      acceptedSlices: ['device'],
      presentedHistory: ['device'],
      device: { displayName: { value: 'Sahil' } },
    });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'workplace' });
    expect(mockCommitDevice).toHaveBeenCalledWith({
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
  });

  it('does not persist Device output when the checkpoint write fails', async () => {
    mockCommitDevice.mockImplementation(() => {
      throw new Error('prefs');
    });
    const store = memoryStore();
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    await expect(
      coordinator.accept('device', {
        displayName: { value: 'Sahil', source: 'user_entered' },
      }),
    ).rejects.toThrow('prefs');
    expect(coordinator.getDraft().acceptedSlices).toEqual([]);
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
      restore: { source },
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
    expect(await coordinator.advanceAutoAccepted()).toEqual({
      kind: 'run_effect',
      effectId: 'publish_restore',
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
        source,
        summary: { intent: 'continue' },
        handoff: {
          operationId,
          workplaceId: operationId,
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
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
      acceptedSlices: ['restore_source'],
      restore: { source },
    };
    const publishRestore = jest.fn().mockResolvedValue({
      operationId,
      workplaceId: asWorkplaceId('published'),
      fingerprint: 'abc',
      facts: { workplace: {} },
      stats: { accounts: 1, journals: 2, transactions: 3, skippedTransactions: 0 },
      warnings: [],
    });
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
    expect(await coordinator.runPendingEffect()).toMatchObject({
      kind: 'present',
      sliceId: 'restore_summary',
    });
    expect(publishRestore).toHaveBeenCalledTimes(1);
    expect(coordinator.getDraft()).toMatchObject({
      restore: { handoff: { workplaceId: 'published' } },
    });
  });

  it('resumes restore publication from the stored handoff after a crash', async () => {
    const store = memoryStore();
    const draft: RestoreSetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace'],
      restore: {
        source,
        handoff: {
          operationId,
          workplaceId: asWorkplaceId('published'),
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
          warnings: [],
        },
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
    expect(await coordinator.runPendingEffect()).toMatchObject({
      kind: 'present',
      sliceId: 'restore_summary',
    });
    expect(publishRestore).not.toHaveBeenCalled();
  });

  it('returns to summary after editing an accepted slice', async () => {
    const store = memoryStore();
    const draft: FirstRunSetupDraft = {
      schemaVersion: 1,
      kind: 'first_run',
      journeyId: 'first_run',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['device', 'workplace', 'appearance', 'summary'],
      acceptedSlices: ['device', 'workplace', 'appearance', 'summary'],
      device: { displayName: { value: 'Old', source: 'user_entered' } },
      workplace,
      appearance: {
        themeId: { value: 'deep-space', source: 'defaulted' },
        fontId: { value: 'deep-space', source: 'defaulted' },
      },
      summary: { confirmed: true },
    };
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draft,
      draftStore: store,
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.edit('device');
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'device' });
    await coordinator.accept('device', { displayName: { value: 'New', source: 'user_entered' } });
    expect(coordinator.next()).toMatchObject({ kind: 'present', sliceId: 'summary' });
    expect(coordinator.getDraft().activeSlice).toBe('summary');
  });

  it('derives Back from the recipe instead of entering a slice the journey does not own', async () => {
    const firstRun = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draftStore: memoryStore(),
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    firstRun.present('device');
    await firstRun.accept('device', {
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
    expect(firstRun.back()).toEqual({ kind: 'present', sliceId: 'device' });

    const creation = createSetupCoordinator({
      journeyId: 'create_workplace',
      operationId,
      draftStore: memoryStore(),
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    expect(creation.back()).toEqual({ kind: 'at_start' });
  });

  it('returns at_start when backing from the first presented slice', () => {
    const coordinator = createSetupCoordinator({
      journeyId: 'create_workplace',
      operationId,
      draftStore: memoryStore(),
      finish: unusedFinish,
      effects: { commitDevice: mockCommitDevice },
    });
    coordinator.present('workplace');

    expect(coordinator.back()).toEqual({ kind: 'at_start' });
  });

  it('keeps the draft when a finisher fails and clears only after success', async () => {
    const store = memoryStore();
    const draft: FirstRunSetupDraft = {
      schemaVersion: 1,
      kind: 'first_run',
      journeyId: 'first_run',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: ['device', 'workplace', 'appearance', 'summary'],
      acceptedSlices: ['device', 'workplace', 'appearance', 'summary'],
      device: { displayName: { value: 'Sahil', source: 'user_entered' } },
      workplace,
      appearance: {
        themeId: { value: 'deep-space', source: 'defaulted' },
        fontId: { value: 'deep-space', source: 'defaulted' },
      },
      summary: { confirmed: true },
    };
    const finisher = jest
      .fn()
      .mockRejectedValueOnce(new Error('retry'))
      .mockResolvedValue({ kind: 'device_registered' });
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draft,
      draftStore: store,
      finish: finisher,
      effects: { commitDevice: mockCommitDevice },
    });
    await expect(coordinator.finish()).rejects.toThrow('retry');
    expect(store.clears).toBe(0);
    await expect(coordinator.finish()).resolves.toEqual({ kind: 'device_registered' });
    expect(store.clears).toBe(1);
    expect(finisher).toHaveBeenCalledTimes(2);
  });

  it('takes entry policy from the recipe', () => {
    expect(createSetupDraft('settings_restore', operationId).entryPolicy).toBe('optional');
    expect(createSetupDraft('create_workplace', operationId).entryPolicy).toBe('optional');
    expect(createSetupDraft('empty_device_workplace', operationId).entryPolicy).toBe('blocking');
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
      restore: { source },
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
    await coordinator.accept('restore_source', {
      source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
      facts: { workplace: { name: 'Other' } },
    });
    const next = coordinator.getDraft();
    expect(next.acceptedSlices).toEqual(['restore_source']);
    expect(next.kind === 'restore' && next.restore.handoff).toBeUndefined();
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
        source,
        handoff: {
          operationId,
          workplaceId: asWorkplaceId('published'),
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
          warnings: [],
        },
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
    await coordinator.accept('restore_source', {
      ...source,
      source: { ...source.source, uri: 'file:///reselected.json' },
    });
    expect(coordinator.getDraft()).toMatchObject({
      restore: {
        source: { source: { uri: 'file:///reselected.json', fingerprint: 'abc' } },
        handoff: { workplaceId: 'published' },
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
      icon: { value: 'briefcase', source: 'imported' },
      baseCurrency: { value: 'USD', source: 'imported' },
      selectedAccounts: [],
      selectedCategories: [],
      acceptedCheckpoints: ['identity', 'currency'],
    };
    const draft: SetupDraft = {
      schemaVersion: 1,
      kind: 'restore',
      journeyId: 'empty_device_restore',
      operationId,
      entryPolicy: 'blocking',
      presentedHistory: ['restore_source'],
      acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
      restore: {
        source,
        handoff: {
          operationId,
          workplaceId: asWorkplaceId('published'),
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
          warnings: [],
        },
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
    await coordinator.accept('restore_source', {
      source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
      facts: { workplace: { name: 'Other' } },
    });
    expect(coordinator.getDraft()).toMatchObject({
      acceptedSlices: ['restore_source'],
      restore: {
        source: {
          source: { uri: 'file:///other.json', name: 'other.json', fingerprint: 'other' },
        },
      },
    });
    const updatedDraft = coordinator.getDraft();
    expect(
      updatedDraft.kind === 'restore' ? updatedDraft.restore.handoff : undefined,
    ).toBeUndefined();
    expect(updatedDraft.workplace).toBeUndefined();
    expect(discardRestorePublication).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        restore: expect.objectContaining({ handoff: draft.restore.handoff }),
      }),
    );
  });
});
