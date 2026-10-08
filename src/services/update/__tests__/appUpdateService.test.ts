import { AppUpdateService } from '../appUpdateService';
import { PlayInstallStatus, type PlayUpdateEvent, type PlayUpdateInfo } from '../playUpdateTypes';
import type { VersionCheckResult } from '../types';

jest.mock('../playUpdateService', () => ({ playUpdateService: {} }));
jest.mock('../versionPolicyService', () => ({
  checkVersion: jest.fn(),
  getCurrentBuild: () => 159,
  isVersionPolicyConfigured: () => false,
}));

const allowed: VersionCheckResult = { kind: 'allowed', source: 'remote' };
const policy = { minimumBuild: 159, latestBuild: 160, storeUrl: 'https://example.com/store' };
const available: PlayUpdateInfo = {
  build: 160,
  availability: 'available',
  flexibleAllowed: true,
  immediateAllowed: true,
  installStatus: PlayInstallStatus.Unknown,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized');
  };
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(
  result: VersionCheckResult = allowed,
  info: PlayUpdateInfo | null = available,
  configured = false,
) {
  let eventListener: (event: PlayUpdateEvent) => void = () => {};
  const stop = jest.fn();
  const play = {
    check: jest.fn(async () => info),
    start: jest.fn(async () => {}),
    install: jest.fn(async () => {}),
    subscribe: jest.fn((listener: typeof eventListener) => {
      eventListener = listener;
      return stop;
    }),
  };
  const deps = {
    play,
    policyCheck: jest.fn(async () => result),
    currentBuild: jest.fn((): number | null => 159),
    openStore: jest.fn(async (_url: string) => {}),
    restartBlocked: jest.fn(() => false),
  };
  const service = new AppUpdateService(deps, configured);
  service.connect();
  return { service, deps, play, stop, emit: (event: PlayUpdateEvent) => eventListener(event) };
}

describe('AppUpdateService', () => {
  it('discovers an optional Play update without a remote policy', async () => {
    const { service } = harness();
    await service.check();
    expect(service.getSnapshot()).toMatchObject({
      access: 'allowed',
      notice: { latestBuild: 160 },
    });
  });

  it('does not wait for Play before resolving the policy startup check', async () => {
    const { service, play } = harness(allowed, null, true);
    const pending = deferred<PlayUpdateInfo | null>();
    play.check.mockReturnValue(pending.promise);
    await service.check();
    expect(service.getSnapshot().access).toBe('allowed');
    pending.resolve(available);
    await pending.promise;
  });

  it('does not bypass the initial policy check when Play answers first', async () => {
    const { service, deps } = harness(allowed, available, true);
    const pending = deferred<VersionCheckResult>();
    deps.policyCheck.mockReturnValue(pending.promise);
    const checking = service.check();
    await Promise.resolve();
    expect(service.getSnapshot().access).toBe('checking');
    pending.resolve({ kind: 'required', source: 'remote', policy });
    await checking;
    expect(service.getSnapshot().access).toBe('required');
  });

  it('keeps supported users allowed on policy and Play failures', async () => {
    const { service, deps, play } = harness(allowed, null, true);
    deps.policyCheck.mockRejectedValue(new Error('offline'));
    play.check.mockRejectedValue(new Error('offline'));
    await service.check();
    expect(service.getSnapshot()).toMatchObject({ access: 'allowed', phase: 'idle' });
  });

  it('suppresses Play notices and new flows for an explicitly disabled cached policy', async () => {
    const { service, play } = harness({ kind: 'allowed', source: 'cache', disabled: true });
    await service.check();
    await service.update();
    expect(service.getSnapshot().notice).toBeUndefined();
    expect(play.start).not.toHaveBeenCalled();
  });

  it('reconciles matching sources into one policy notice and uses generic copy for a newer native target', async () => {
    const { service, play } = harness({ ...allowed, kind: 'allowed', available: policy });
    await service.check();
    expect(service.getSnapshot().notice).toEqual(policy);
    play.check.mockResolvedValue({ ...available, build: 161 });
    await service.check();
    expect(service.getSnapshot().notice).toMatchObject({ latestBuild: 161 });
    expect(service.getSnapshot().notice?.storeUrl).not.toBe(policy.storeUrl);
  });

  it('does not offer an equal/older target or one with unknown installed metadata', async () => {
    const { service, deps, play } = harness();
    play.check.mockResolvedValue({ ...available, build: 159 });
    await service.check();
    expect(service.getSnapshot().notice).toBeUndefined();
    deps.currentBuild.mockReturnValue(null);
    play.check.mockResolvedValue(available);
    await service.check();
    expect(service.getSnapshot().notice).toBeUndefined();
  });

  it('clears the old policy notice when installation updates native metadata', async () => {
    const { service, deps, emit } = harness({
      kind: 'allowed',
      source: 'remote',
      available: policy,
    });
    await service.check();
    deps.currentBuild.mockReturnValue(160);
    emit({ kind: 'status', status: PlayInstallStatus.Installed });
    expect(service.getSnapshot().notice).toBeUndefined();
  });

  it('deduplicates checks and taps and starts an optional flexible flow', async () => {
    const { service, deps, play } = harness();
    const pending = deferred<VersionCheckResult>();
    deps.policyCheck.mockReturnValue(pending.promise);
    const first = service.check();
    expect(service.check()).toBe(first);
    expect(play.check).toHaveBeenCalledTimes(1);
    pending.resolve(allowed);
    await first;
    const action = service.update();
    expect(service.update()).toBe(action);
    await action;
    expect(play.start).toHaveBeenCalledTimes(1);
    expect(play.start).toHaveBeenCalledWith('flexible');
  });

  it('uses immediate delivery for a mandatory floor, even if the latest policy build is higher', async () => {
    const { service, play } = harness({
      kind: 'required',
      source: 'cache',
      policy: { ...policy, latestBuild: 170 },
    });
    await service.check();
    await service.update();
    expect(play.start).toHaveBeenCalledWith('immediate');
    expect(service.getSnapshot().access).toBe('required');
  });

  it('falls back to flexible delivery for a mandatory update when immediate is disallowed', async () => {
    const { service, play } = harness(
      { kind: 'required', source: 'remote', policy },
      { ...available, immediateAllowed: false },
    );
    await service.check();
    await service.update();
    expect(play.start).toHaveBeenCalledWith('flexible');
  });

  it('does not treat an insufficient Play target as satisfying the mandatory minimum', async () => {
    const { service, deps, play } = harness({
      kind: 'required',
      source: 'remote',
      policy: { ...policy, minimumBuild: 161, latestBuild: 161 },
    });
    await service.check();
    await service.update();
    expect(play.start).not.toHaveBeenCalled();
    expect(deps.openStore).toHaveBeenCalledWith(policy.storeUrl);
    expect(service.getSnapshot().access).toBe('required');
  });

  it('falls back once on a launch error and exposes a failed store attempt for retry', async () => {
    const { service, deps, play } = harness();
    play.start.mockRejectedValue(new Error('unavailable'));
    deps.openStore.mockRejectedValue(new Error('no store'));
    await service.check();
    await service.update();
    expect(deps.openStore).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toMatchObject({
      access: 'allowed',
      phase: 'idle',
      error: 'store',
    });
  });

  it('honors a policy disable arriving during an update availability check', async () => {
    const { service, deps, play } = harness();
    await service.check();
    const pending = deferred<PlayUpdateInfo | null>();
    play.check.mockReturnValueOnce(pending.promise);
    const updating = service.update();
    deps.policyCheck.mockResolvedValue({ kind: 'allowed', source: 'remote', disabled: true });
    await service.check();
    pending.resolve(available);
    await updating;
    expect(play.start).not.toHaveBeenCalled();
    expect(deps.openStore).not.toHaveBeenCalled();
    expect(service.getSnapshot().phase).toBe('idle');
  });

  it('does not open the store or restart automatically when the user cancels or accepts', async () => {
    const { service, deps, play, emit } = harness();
    await service.check();
    play.start.mockImplementation(async () => {
      emit({ kind: 'cancelled' });
    });
    await service.update();
    expect(service.getSnapshot().phase).toBe('idle');
    expect(deps.openStore).not.toHaveBeenCalled();
    emit({ kind: 'accepted' });
    expect(play.install).not.toHaveBeenCalled();
  });

  it('recovers downloaded state after a process restart and installs only on request', async () => {
    const { service, play } = harness(allowed, {
      ...available,
      availability: 'none',
      installStatus: PlayInstallStatus.Downloaded,
    });
    await service.check();
    expect(service.getSnapshot().phase).toBe('downloaded');
    expect(play.install).not.toHaveBeenCalled();
    await service.update();
    expect(play.install).toHaveBeenCalledTimes(1);
  });

  it('requires explicit restart when a fresh check discovers a downloaded update', async () => {
    const { service, play } = harness();
    await service.check();
    play.check.mockResolvedValue({ ...available, installStatus: PlayInstallStatus.Downloaded });
    await service.update();
    expect(service.getSnapshot().phase).toBe('downloaded');
    expect(play.install).not.toHaveBeenCalled();
  });

  it('does not overwrite a completed download with an older check response', async () => {
    const { service, play, emit } = harness();
    await service.check();
    const pending = deferred<PlayUpdateInfo | null>();
    play.check.mockReturnValue(pending.promise);
    const checking = service.check();
    emit({ kind: 'status', status: PlayInstallStatus.Downloaded });
    pending.resolve(available);
    await checking;
    expect(service.getSnapshot().phase).toBe('downloaded');
  });

  it('does not install a downloaded artifact below a newly required minimum', async () => {
    const { service, deps, play } = harness(allowed, {
      ...available,
      installStatus: PlayInstallStatus.Downloaded,
    });
    await service.check();
    deps.policyCheck.mockResolvedValue({
      kind: 'required',
      source: 'remote',
      policy: { ...policy, minimumBuild: 170, latestBuild: 170 },
    });
    await service.check();
    expect(service.getSnapshot()).toMatchObject({ access: 'required', phase: 'idle' });
    await service.update();
    expect(play.install).not.toHaveBeenCalled();
    expect(play.start).not.toHaveBeenCalled();
    expect(deps.openStore).toHaveBeenCalledWith(policy.storeUrl);
  });

  it('discards an action check overtaken by a completed download', async () => {
    const { service, play, deps, emit } = harness();
    await service.check();
    const pending = deferred<PlayUpdateInfo | null>();
    play.check.mockReturnValueOnce(pending.promise);
    const updating = service.update();
    emit({ kind: 'status', status: PlayInstallStatus.Downloaded });
    pending.resolve(available);
    await updating;
    expect(service.getSnapshot().phase).toBe('downloaded');
    expect(play.start).not.toHaveBeenCalled();
    expect(play.install).not.toHaveBeenCalled();
    expect(deps.openStore).not.toHaveBeenCalled();
    await service.update();
    expect(play.install).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'failed', 'installed'] as const)(
    'discards an action check overtaken by a native %s event',
    async kind => {
      const { service, play, deps, emit } = harness();
      await service.check();
      const pending = deferred<PlayUpdateInfo | null>();
      play.check.mockReturnValueOnce(pending.promise);
      const updating = service.update();
      if (kind === 'cancelled') emit({ kind });
      else
        emit({
          kind: 'status',
          status: kind === 'failed' ? PlayInstallStatus.Failed : PlayInstallStatus.Installed,
        });
      pending.resolve(available);
      await updating;
      expect(service.getSnapshot()).toMatchObject({
        phase: 'idle',
        error: kind === 'failed' ? 'install' : undefined,
      });
      expect(play.start).not.toHaveBeenCalled();
      expect(play.install).not.toHaveBeenCalled();
      expect(deps.openStore).not.toHaveBeenCalled();
    },
  );

  it('uses the new mandatory minimum when policy changes during an action check', async () => {
    const { service, deps, play } = harness();
    await service.check();
    const pending = deferred<PlayUpdateInfo | null>();
    play.check.mockReturnValueOnce(pending.promise);
    const updating = service.update();
    deps.policyCheck.mockResolvedValue({
      kind: 'required',
      source: 'remote',
      policy: { ...policy, minimumBuild: 170, latestBuild: 170 },
    });
    await service.check();
    pending.resolve({ ...available, installStatus: PlayInstallStatus.Downloaded });
    await updating;
    expect(service.getSnapshot()).toMatchObject({ access: 'required', phase: 'idle' });
    expect(play.install).not.toHaveBeenCalled();
    expect(play.start).not.toHaveBeenCalled();
    expect(deps.openStore).toHaveBeenCalledWith(policy.storeUrl);
  });

  it('offers the actual downloaded build when the optional recommendation is newer', async () => {
    const { service, play } = harness(
      { kind: 'allowed', source: 'remote', available: { ...policy, latestBuild: 170 } },
      { ...available, installStatus: PlayInstallStatus.Downloaded },
    );
    await service.check();
    expect(service.getSnapshot()).toMatchObject({
      phase: 'downloaded',
      notice: { latestBuild: 160 },
    });
    await service.update();
    expect(play.install).toHaveBeenCalledTimes(1);
  });

  it('installs a downloaded build that meets the mandatory floor even below the latest recommendation', async () => {
    const { service, play } = harness(
      {
        kind: 'required',
        source: 'remote',
        policy: { ...policy, minimumBuild: 160, latestBuild: 170 },
      },
      { ...available, installStatus: PlayInstallStatus.Downloaded },
    );
    await service.check();
    expect(service.getSnapshot().phase).toBe('downloaded');
    await service.update();
    expect(play.install).toHaveBeenCalledTimes(1);
  });

  it('does not advertise a downloaded callback without artifact metadata', async () => {
    const { service, play, emit } = harness(allowed, null);
    await service.check();
    emit({ kind: 'status', status: PlayInstallStatus.Downloaded });
    expect(service.getSnapshot()).toMatchObject({ phase: 'idle', notice: undefined });
    await service.update();
    expect(play.install).not.toHaveBeenCalled();
  });

  it('allows retry if native installing status precedes an install rejection', async () => {
    const { service, play, emit } = harness(allowed, {
      ...available,
      installStatus: PlayInstallStatus.Downloaded,
    });
    await service.check();
    play.install.mockImplementationOnce(async () => {
      emit({ kind: 'status', status: PlayInstallStatus.Installing });
      throw new Error('install failed');
    });
    await service.update();
    expect(service.getSnapshot()).toMatchObject({ phase: 'downloaded', error: 'install' });
    await service.update();
    expect(service.getSnapshot()).toMatchObject({ phase: 'installing', error: undefined });
    expect(play.install).toHaveBeenCalledTimes(2);
  });

  it('protects unsaved edits and retries installation failures without losing readiness', async () => {
    const { service, deps, play } = harness(allowed, {
      ...available,
      installStatus: PlayInstallStatus.Downloaded,
    });
    await service.check();
    deps.restartBlocked.mockReturnValue(true);
    await service.update();
    expect(play.install).not.toHaveBeenCalled();
    expect(service.getSnapshot().error).toBe('unsaved');
    deps.restartBlocked.mockReturnValue(false);
    play.install.mockRejectedValue(new Error('install failed'));
    await service.update();
    expect(service.getSnapshot()).toMatchObject({ phase: 'downloaded', error: 'install' });
  });

  it('continues an already-downloaded update after the policy is disabled', async () => {
    const { service, play } = harness(
      { kind: 'allowed', source: 'remote', disabled: true },
      { ...available, installStatus: PlayInstallStatus.Downloaded },
    );
    await service.check();
    await service.update();
    expect(play.install).toHaveBeenCalledTimes(1);
  });

  it('resumes a running immediate update without an optional prompt', async () => {
    const { service, play } = harness(allowed, { ...available, availability: 'in-progress' });
    await service.check();
    await service.update(true);
    expect(play.start).toHaveBeenCalledWith('immediate');
  });

  it('does not resume a cancelled immediate update on foreground checks until the user retries', async () => {
    const { service, play, emit } = harness(allowed, { ...available, availability: 'in-progress' });
    await service.check();
    await service.update(true);
    emit({ kind: 'cancelled' });
    play.start.mockClear();
    await service.check();
    expect(play.start).not.toHaveBeenCalled();
    await service.update();
    expect(play.start).toHaveBeenCalledWith('immediate');
  });

  it('releases the native subscription only when its last lifecycle owner leaves', () => {
    const { service, stop, play } = harness();
    const disconnect = service.connect();
    disconnect();
    expect(stop).not.toHaveBeenCalled();
    expect(play.subscribe).toHaveBeenCalledTimes(1);
  });
});
