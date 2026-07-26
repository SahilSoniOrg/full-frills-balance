/**
 * Typed import execution progress (commit 30).
 * Centralizes phase names and overall progress segments for ImportService.
 */

export type ImportPhase =
  | 'parse'
  | 'backup'
  | 'stage'
  | 'init'
  | 'insert'
  | 'staging_check'
  | 'swap'
  | 'rates'
  | 'integrity'
  | 'complete';

export interface ImportPhaseSegment {
  readonly start: number;
  readonly end: number;
}

/** Overall progress (0–1) allocated to each workflow phase. */
export const IMPORT_PHASE_SEGMENTS: Record<Exclude<ImportPhase, 'complete'>, ImportPhaseSegment> = {
  parse: { start: 0, end: 0.15 },
  backup: { start: 0.15, end: 0.22 },
  stage: { start: 0.22, end: 0.28 },
  init: { start: 0.28, end: 0.32 },
  insert: { start: 0.32, end: 0.72 },
  staging_check: { start: 0.72, end: 0.8 },
  swap: { start: 0.8, end: 0.86 },
  rates: { start: 0.86, end: 0.93 },
  integrity: { start: 0.93, end: 1.0 },
};

export interface ImportRunProgress {
  phase: ImportPhase;
  message: string;
  /** Monotonic overall progress in [0, 1]. */
  progress: number;
}

export type ImportRunFailureKind = 'recoverable' | 'fatal';

export interface ImportRunState {
  progress: ImportRunProgress;
  warnings: string[];
}

export type ImportProgressCallback = (message: string, progress?: number) => void;

export interface ImportRunController {
  readonly state: ImportRunProgress;
  readonly warnings: readonly string[];
  report(phase: ImportPhase, message: string, withinPhaseProgress: number): void;
  complete(message: string): void;
  recordWarning(message: string): void;
  phaseReporter(
    phase: Exclude<ImportPhase, 'complete'>,
  ): (message: string, withinPhaseProgress: number) => void;
}

function overallProgressForPhase(
  phase: Exclude<ImportPhase, 'complete'>,
  withinPhaseProgress: number,
): number {
  const segment = IMPORT_PHASE_SEGMENTS[phase];
  const clamped = Math.min(1, Math.max(0, withinPhaseProgress));
  return segment.start + clamped * (segment.end - segment.start);
}

export function beginImportRun(onProgress?: ImportProgressCallback): ImportRunController {
  const warnings: string[] = [];
  let state: ImportRunProgress = {
    phase: 'parse',
    message: '',
    progress: 0,
  };

  const emit = (next: ImportRunProgress) => {
    state = next;
    onProgress?.(next.message, next.progress);
  };

  return {
    get state() {
      return state;
    },
    get warnings() {
      return warnings;
    },
    report(phase, message, withinPhaseProgress) {
      if (phase === 'complete') {
        emit({ phase, message, progress: 1 });
        return;
      }
      emit({
        phase,
        message,
        progress: overallProgressForPhase(phase, withinPhaseProgress),
      });
    },
    complete(message: string) {
      emit({ phase: 'complete', message, progress: 1 });
    },
    recordWarning(message: string) {
      warnings.push(message);
    },
    phaseReporter(phase) {
      return (message: string, withinPhaseProgress: number) => {
        this.report(phase, message, withinPhaseProgress);
      };
    },
  };
}
