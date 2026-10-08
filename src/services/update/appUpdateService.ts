import { Linking, Platform } from 'react-native';
import { AppConfig } from '@/src/constants/app-config';
import { playUpdateService } from './playUpdateService';
import {
  ANDROID_STORE_URL,
  PlayInstallStatus,
  type PlayUpdateAdapter,
  type PlayUpdateEvent,
  type PlayUpdateInfo,
} from './playUpdateTypes';
import { checkVersion, getCurrentBuild, isVersionPolicyConfigured } from './versionPolicyService';
import { isUpdateRestartBlocked } from './updateRestartGuard';
import type { VersionCheckResult, VersionPolicy } from './types';
import {
  reducePlayDelivery,
  type PlayDeliveryEvent,
  type PlayUpdateDelivery,
} from './playUpdateDelivery';

export type AppUpdateSnapshot = {
  access: 'checking' | 'allowed' | 'required';
  policy?: VersionPolicy;
  notice?: VersionPolicy;
  phase: 'idle' | 'starting' | 'downloading' | 'downloaded' | 'installing';
  progress?: number;
  error?: 'store' | 'install' | 'unsaved';
};

export type AppUpdateDependencies = {
  play: PlayUpdateAdapter;
  policyCheck: () => Promise<VersionCheckResult>;
  currentBuild: () => number | null;
  openStore: (url: string) => Promise<void>;
  restartBlocked: () => boolean;
};

/** Owns device-wide delivery. Remote policy alone decides whether access is required. */
export class AppUpdateService {
  private state: AppUpdateSnapshot;
  private policy: VersionCheckResult = { kind: 'allowed', source: 'remote' };
  private delivery: PlayUpdateDelivery = { phase: 'idle', info: null };
  private error: AppUpdateSnapshot['error'];
  private listeners = new Set<() => void>();
  private checking: Promise<void> | null = null;
  private checkingPlay: Promise<void> | null = null;
  private acting: Promise<void> | null = null;
  private stopPlay: (() => void) | null = null;
  private connections = 0;
  private policyResolved: boolean;
  private nativeRevision = 0;
  private interruptedBuild: number | null = null;

  constructor(
    private readonly deps: AppUpdateDependencies,
    configured = false,
  ) {
    this.state = { access: configured ? 'checking' : 'allowed', phase: 'idle' };
    this.policyResolved = !configured;
  }

  getSnapshot = (): AppUpdateSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect = (): (() => void) => {
    if (this.connections++ === 0) this.stopPlay = this.deps.play.subscribe(this.onPlayEvent);
    return () => {
      if (--this.connections === 0) {
        this.nativeRevision++;
        this.stopPlay?.();
        this.stopPlay = null;
      }
    };
  };

  private meetsMinimum(info: PlayUpdateInfo): boolean {
    const current = this.deps.currentBuild();
    const minimum = this.policy.kind === 'required' ? this.policy.policy.minimumBuild : 0;
    return current !== null && info.build > current && info.build >= minimum;
  }

  private transition(event: PlayDeliveryEvent, error?: AppUpdateSnapshot['error']) {
    this.nativeRevision++;
    this.delivery = reducePlayDelivery(this.delivery, event);
    this.error = error;
    this.publish();
  }

  private publish() {
    const required = this.policy.kind === 'required';
    const disabled = this.policy.kind === 'allowed' && this.policy.disabled;
    const current = this.deps.currentBuild();
    const remote = this.policy.kind === 'allowed' ? this.policy.available : undefined;
    const native = this.delivery.info;
    const phase = native && !this.meetsMinimum(native) ? 'idle' : this.delivery.phase;
    const hasNativeTarget =
      current !== null &&
      native &&
      native.build > current &&
      (native.availability !== 'none' || phase === 'downloaded' || phase === 'downloading');
    let notice =
      current !== null && remote?.latestBuild !== undefined && remote.latestBuild > current
        ? remote
        : undefined;
    // A ready notice describes the downloaded artifact, even if the remote recommendation is newer.
    if (hasNativeTarget && (phase === 'downloaded' || native.build >= (remote?.latestBuild ?? 0))) {
      notice =
        remote?.latestBuild === native.build
          ? remote
          : {
              minimumBuild: 0,
              latestBuild: native.build,
              storeUrl: ANDROID_STORE_URL,
              availableMessage: AppConfig.strings.update.availableMessage,
            };
    }
    if (required || (disabled && phase !== 'downloaded')) notice = undefined;
    this.state = {
      phase,
      progress:
        phase === 'downloaded'
          ? 1
          : this.delivery.phase === 'downloading' && phase === 'downloading'
            ? this.delivery.progress
            : undefined,
      error: this.error,
      access: required ? 'required' : this.policyResolved ? 'allowed' : 'checking',
      policy: this.policy.kind === 'required' ? this.policy.policy : undefined,
      notice,
    };
    this.listeners.forEach(listener => listener());
  }

  check = (): Promise<void> => {
    // Play runs independently and never extends the policy's startup timeout.
    void this.refreshPlay();
    if (this.checking) return this.checking;
    this.checking = this.deps
      .policyCheck()
      .then(result => {
        this.policy = result;
        this.policyResolved = true;
        this.publish();
        this.resumeIfNeeded();
      })
      .catch(() => {
        this.policyResolved = true;
        this.publish();
      })
      .finally(() => {
        this.checking = null;
      });
    return this.checking;
  };

  private refreshPlay(): Promise<void> {
    if (this.acting) return Promise.resolve();
    if (this.checkingPlay) return this.checkingPlay;
    const revision = this.nativeRevision;
    this.checkingPlay = this.deps.play
      .check()
      .then(info => {
        if (this.applyCheck(info, revision)) this.resumeIfNeeded();
      })
      .catch(() => {
        /* Unsupported/offline Play must not interrupt app access. */
      })
      .finally(() => {
        this.checkingPlay = null;
      });
    return this.checkingPlay;
  }

  private applyCheck(info: PlayUpdateInfo | null, revision: number): boolean {
    if (revision !== this.nativeRevision) return false;
    const current = this.deps.currentBuild();
    this.transition({
      kind: 'checked',
      info: current !== null && info && info.build > current ? info : null,
    });
    return true;
  }

  private resumeIfNeeded() {
    if (
      this.policyResolved &&
      this.connections > 0 &&
      this.delivery.info?.availability === 'in-progress' &&
      this.meetsMinimum(this.delivery.info) &&
      this.delivery.phase !== 'downloaded' &&
      this.delivery.phase !== 'installing' &&
      this.interruptedBuild !== this.delivery.info.build &&
      this.delivery.info.immediateAllowed &&
      !this.deps.restartBlocked() &&
      !(this.policy.kind === 'allowed' && this.policy.disabled)
    )
      void this.update(true);
  }

  private onPlayEvent = (event: PlayUpdateEvent) => {
    const failed = event.kind === 'status' && event.status === PlayInstallStatus.Failed;
    const cancelled =
      event.kind === 'cancelled' ||
      (event.kind === 'status' && event.status === PlayInstallStatus.Cancelled);
    if (failed || cancelled) this.interruptedBuild = this.delivery.info?.build ?? null;
    this.transition(event, failed ? 'install' : undefined);
  };

  update = (resume = false): Promise<void> => {
    if (this.acting) return this.acting;
    if (
      !resume &&
      (this.delivery.phase === 'starting' ||
        (this.delivery.phase === 'downloading' && this.meetsMinimum(this.delivery.info)) ||
        this.delivery.phase === 'installing')
    )
      return Promise.resolve();
    this.acting = this.performUpdate(resume).finally(() => {
      this.acting = null;
    });
    return this.acting;
  };

  private async performUpdate(resume: boolean) {
    if (!resume) this.interruptedBuild = null;
    if (this.delivery.phase === 'downloaded' && this.meetsMinimum(this.delivery.info)) {
      return this.installDownloaded(this.delivery.info);
    }
    if (this.policy.kind === 'allowed' && this.policy.disabled) return;
    const candidate = this.state.policy ?? this.state.notice;
    if (!candidate && !resume) return;
    this.transition({ kind: 'starting' }, undefined);
    const revision = this.nativeRevision;
    let info: PlayUpdateInfo | null = null;
    try {
      info = await this.deps.play.check();
    } catch {
      /* Use the store fallback. */
    }
    if (!this.applyCheck(info, revision)) return;
    if (this.policy.kind === 'allowed' && this.policy.disabled) {
      if (this.delivery.phase !== 'downloaded') this.transition({ kind: 'idle' });
      return;
    }
    const latestCandidate = this.state.policy ?? this.state.notice;
    const target =
      this.policy.kind === 'required'
        ? this.policy.policy.minimumBuild
        : (latestCandidate?.latestBuild ?? 0);
    const eligible = info && this.meetsMinimum(info) && info.build >= target;
    if (eligible && info) {
      if (info.installStatus === PlayInstallStatus.Downloaded) {
        return;
      }
      const continuing = info.availability === 'in-progress';
      if (continuing && this.deps.restartBlocked()) {
        this.transition({ kind: 'idle' }, 'unsaved');
        return;
      }
      const mode =
        (this.policy.kind === 'required' || resume || continuing) && info.immediateAllowed
          ? 'immediate'
          : info.flexibleAllowed
            ? 'flexible'
            : null;
      if (mode && (info.availability === 'available' || (mode === 'immediate' && continuing))) {
        this.transition({ kind: 'starting' }, undefined);
        const startRevision = this.nativeRevision;
        try {
          await this.deps.play.start(mode);
          return;
        } catch {
          if (startRevision !== this.nativeRevision) return;
          if (resume) {
            this.interruptedBuild = info.build;
            this.transition({ kind: 'idle' }, 'install');
            return;
          }
        }
      }
    }
    if (this.delivery.phase !== 'downloaded') this.transition({ kind: 'idle' });
    if (resume) return;
    try {
      await this.deps.openStore(
        latestCandidate?.storeUrl ?? candidate?.storeUrl ?? ANDROID_STORE_URL,
      );
    } catch {
      this.error = 'store';
      this.publish();
    }
  }

  private async installDownloaded(info: PlayUpdateInfo) {
    if (this.deps.restartBlocked()) {
      this.error = 'unsaved';
      this.publish();
      return;
    }
    this.transition({ kind: 'installing', info });
    try {
      await this.deps.play.install();
    } catch {
      if (this.delivery.phase === 'installing' && this.delivery.info.build === info.build)
        this.transition({ kind: 'install-failed', info }, 'install');
    }
  }
}

const realDependencies: AppUpdateDependencies = {
  play: playUpdateService,
  policyCheck: checkVersion,
  currentBuild: getCurrentBuild,
  restartBlocked: isUpdateRestartBlocked,
  openStore: async url => {
    if (!(await Linking.canOpenURL(url))) throw new Error('Store unavailable');
    await Linking.openURL(url);
  },
};

// The mock transport is reachable only in an authenticated, E2E-capable build.
const e2eDependencies: AppUpdateDependencies | null =
  process.env.EXPO_PUBLIC_E2E === '1'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/src/testing/e2eAppUpdates').createE2eAppUpdateDependencies()
    : null;

export const appUpdateService = new AppUpdateService(
  e2eDependencies ?? realDependencies,
  Boolean(e2eDependencies) || (Platform.OS !== 'web' && isVersionPolicyConfigured()),
);
