import type {
  ShareArtifact,
  ShareOutcome,
  SharePreparationContext,
  ShareRequest,
  ShareScope,
  Shareable,
  ShareWritable,
  SharingSnapshot,
} from '@/src/types/sharing';
import type { WorkplaceId } from '@/src/types/ids';
import { isShareCancellation, throwIfShareAborted } from './sharingCancellation';

export interface SharingLifecycle {
  ready: boolean;
  locked: boolean;
  restartRequired: boolean;
  active?: boolean;
}

export interface ShareDeliveryContext extends SharePreparationContext {
  ensureActive(): void;
  present<T>(
    phase: 'selecting-destination' | 'awaiting-user' | 'delivering',
    operation: () => Promise<T>,
  ): Promise<T>;
}

export interface ShareTransport {
  reserveDestination(
    source: Shareable,
    request: ShareRequest,
    context: ShareDeliveryContext,
  ): Promise<ShareWritable | undefined>;
  deliver(
    source: Shareable,
    artifact: ShareArtifact,
    request: ShareRequest,
    context: ShareDeliveryContext,
  ): Promise<ShareOutcome>;
  retain(artifact: ShareArtifact): void;
}

const IDLE: SharingSnapshot = { operationId: null, sourceId: null, phase: 'idle', progress: null };
type ActiveOperation = {
  id: number;
  scope: ShareScope;
  controller: AbortController;
  presentation: 'selecting-destination' | 'awaiting-user' | 'delivering' | null;
};

/** One operation owner shared by React and recovery callers; never stores payloads in its snapshot. */
export class SharingRuntime {
  private snapshot: SharingSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private active: ActiveOperation | null = null;
  private lifecycle: SharingLifecycle | null = null;
  private transitions = new Map<WorkplaceId, { switches: number; deletions: number }>();

  constructor(private readonly transport: ShareTransport) {}

  getSnapshot = (): SharingSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(snapshot: SharingSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }

  private isAllowed(scope: ShareScope): boolean {
    if (this.lifecycle?.locked) return false;
    if (scope.kind === 'device') return true;
    if (this.lifecycle && (!this.lifecycle.ready || this.lifecycle.restartRequired)) return false;
    if (scope.kind === 'workplace') {
      const transition = this.transitions.get(scope.workplaceId);
      return !transition || (transition.switches === 0 && transition.deletions === 0);
    }
    return !scope.workplaceIds.some(id => (this.transitions.get(id)?.deletions ?? 0) > 0);
  }

  setLifecycle = (lifecycle: SharingLifecycle): void => {
    this.lifecycle = lifecycle;
    if (
      this.active &&
      (!this.isAllowed(this.active.scope) ||
        (lifecycle.active === false &&
          this.active.presentation !== 'selecting-destination' &&
          this.active.presentation !== 'delivering'))
    ) {
      this.active.controller.abort();
    }
  };

  /** Call before a transition starts, including before its first await. */
  beginWorkplaceTransition = (id: WorkplaceId, kind: 'switch' | 'delete'): (() => void) => {
    const counts = this.transitions.get(id) ?? { switches: 0, deletions: 0 };
    if (kind === 'switch') counts.switches++;
    else counts.deletions++;
    this.transitions.set(id, counts);
    const active = this.active;
    const affected =
      active &&
      (active.scope.kind === 'workplace'
        ? active.scope.workplaceId === id
        : kind === 'delete' &&
          active.scope.kind === 'workplaces' &&
          active.scope.workplaceIds.includes(id));
    if (affected) active.controller.abort();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (kind === 'switch') counts.switches--;
      else counts.deletions--;
      if (counts.switches === 0 && counts.deletions === 0) this.transitions.delete(id);
    };
  };

  execute = async (
    source: Shareable,
    request: ShareRequest,
    externalSignal?: AbortSignal,
  ): Promise<ShareOutcome> => {
    if (this.active) return { kind: 'busy' };
    if (!source.supportedFormats.includes(request.format)) {
      return {
        kind: 'failed',
        error: new Error('This content does not support the requested format'),
      };
    }
    if (
      externalSignal?.aborted ||
      this.lifecycle?.active === false ||
      !this.isAllowed(source.scope)
    )
      return { kind: 'cancelled' };

    const scope: ShareScope =
      source.scope.kind === 'workplaces'
        ? { kind: 'workplaces', workplaceIds: [...source.scope.workplaceIds] }
        : { ...source.scope };
    const operation: ActiveOperation = {
      id: ++this.sequence,
      scope,
      controller: new AbortController(),
      presentation: null,
    };
    this.active = operation;
    this.publish({
      operationId: operation.id,
      sourceId: source.id,
      phase: 'preparing',
      progress: null,
    });
    const signal = operation.controller.signal;
    const cancel = () => operation.controller.abort();
    externalSignal?.addEventListener('abort', cancel);
    let artifact: ShareArtifact | null = null;
    let destination: ShareWritable | undefined;
    let retained = false;
    let destinationCommitted = false;
    const ensureActive = () => {
      if (externalSignal?.aborted || !this.isAllowed(scope)) operation.controller.abort();
      throwIfShareAborted(signal);
    };
    const context: ShareDeliveryContext = {
      signal,
      ensureActive,
      reportProgress: (message, progress) => {
        if (signal.aborted || this.active !== operation) return;
        this.publish({ ...this.snapshot, progress: { message, progress } });
        request.onProgress?.(message, progress);
      },
      present: async (phase, present) => {
        ensureActive();
        const previousPhase = this.snapshot.phase;
        operation.presentation = phase;
        this.publish({ ...this.snapshot, phase });
        try {
          const result = await present();
          // A confirmation may authorize more work, so recheck cancellation before continuing.
          // Picker results must reach their caller so reserved destinations can be aborted.
          // A final native handoff has already happened and must retain its outcome.
          if (phase === 'awaiting-user') ensureActive();
          return result;
        } finally {
          operation.presentation = null;
          this.publish({ ...this.snapshot, phase: previousPhase });
        }
      },
    };
    try {
      // Invoked before the first await so browser pickers keep the user's activation.
      const reservation = this.transport.reserveDestination(source, request, context);
      destination = await reservation;
      context.destination = destination;
      ensureActive();
      artifact = await source.prepare(request.format, context);
      ensureActive();
      if (!artifact) return { kind: 'empty' };
      this.publish({ ...this.snapshot, phase: 'delivering' });
      const outcome = await this.transport.deliver(source, artifact, request, context);
      destinationCommitted = artifact.kind === 'destination' && outcome.kind === 'saved';
      if (outcome.kind === 'saved' || outcome.kind === 'handed-off') {
        this.transport.retain(artifact);
        retained = true;
      }
      return outcome;
    } catch (error) {
      return signal.aborted || isShareCancellation(error)
        ? { kind: 'cancelled' }
        : { kind: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      externalSignal?.removeEventListener('abort', cancel);
      if (destination && !destinationCommitted) await destination.abort().catch(() => undefined);
      if (!retained && artifact?.kind === 'file') {
        try {
          await artifact.cleanup?.();
        } catch {
          /* Cleanup must not strand the operation lock. */
        }
      }
      this.active = null;
      this.publish(IDLE);
    }
  };
}
