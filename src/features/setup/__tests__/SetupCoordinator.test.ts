import { asWorkplaceId } from '@/src/types/ids';
import { createSetupCoordinator } from '../SetupCoordinator';
import { finishDeviceSetup } from '../setupFinishers';
import type {
  FirstRunSetupDraft,
  RestoreSetupDraft,
  SetupDraft,
  SetupOutcome,
  WorkplaceSetupOutput,
} from '../setupTypes';

jest.mock('../setupFinishers', () => ({
  finishDeviceSetup: jest.fn(),
}));

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
  const mockFinishDeviceSetup = finishDeviceSetup as jest.Mock;

  beforeEach(() => {
    mockFinishDeviceSetup.mockReset();
  });

  it('creates a draft, accepts a slice, and persists the checkpoint', async () => {
    const store = memoryStore();
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draftStore: store,
      finish: unusedFinish,
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
    expect(mockFinishDeviceSetup).toHaveBeenCalledWith({
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
  });

  it('does not persist Device output when the checkpoint write fails', async () => {
    mockFinishDeviceSetup.mockImplementation(() => {
      throw new Error('prefs');
    });
    const store = memoryStore();
    const coordinator = createSetupCoordinator({
      journeyId: 'first_run',
      operationId,
      draftStore: store,
      finish: unusedFinish,
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
    });
    expect(await coordinator.advanceAutoAccepted()).toEqual({
      kind: 'run_effect',
      effectId: 'publish_restore',
    });
    expect(coordinator.getDraft().acceptedSlices).toContain('workplace');
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
      effects: { publishRestore },
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
    });
    await firstRun.accept('device', {
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
    expect(firstRun.back()).toEqual({ kind: 'present', sliceId: 'device' });

    const creation = createSetupCoordinator({
      journeyId: 'create_workplace',
      operationId,
      draftStore: memoryStore(),
      finish: unusedFinish,
    });
    expect(creation.back()).toEqual({ kind: 'at_start' });
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
    });
    await expect(coordinator.finish()).rejects.toThrow('retry');
    expect(store.clears).toBe(0);
    await expect(coordinator.finish()).resolves.toEqual({ kind: 'device_registered' });
    expect(store.clears).toBe(1);
    expect(finisher).toHaveBeenCalledTimes(2);
  });
});
