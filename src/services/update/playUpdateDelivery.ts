import { PlayInstallStatus, type PlayUpdateEvent, type PlayUpdateInfo } from './playUpdateTypes';

/** An active delivery always identifies the artifact it is downloading or installing. */
export type PlayUpdateDelivery =
  | { phase: 'idle' | 'starting'; info: PlayUpdateInfo | null }
  | { phase: 'downloading'; info: PlayUpdateInfo; progress?: number }
  | { phase: 'downloaded' | 'installing'; info: PlayUpdateInfo };

export type PlayDeliveryEvent =
  | PlayUpdateEvent
  | { kind: 'checked'; info: PlayUpdateInfo | null }
  | { kind: 'starting' }
  | { kind: 'installing'; info: PlayUpdateInfo }
  | { kind: 'install-failed'; info: PlayUpdateInfo }
  | { kind: 'idle' };

/** Checks, native callbacks and user actions share the same delivery transitions. */
export function reducePlayDelivery(
  state: PlayUpdateDelivery,
  event: PlayDeliveryEvent,
): PlayUpdateDelivery {
  switch (event.kind) {
    case 'starting':
      return { phase: 'starting', info: state.info };
    case 'installing':
      return { phase: 'installing', info: event.info };
    case 'install-failed':
      return { phase: 'downloaded', info: event.info };
    case 'idle':
    case 'cancelled':
      return { phase: 'idle', info: state.info };
    case 'accepted':
      return state.phase === 'starting' && state.info
        ? { phase: 'downloading', info: state.info }
        : state;
    case 'checked': {
      const info = event.info;
      if (!info) return { phase: 'idle', info: null };
      if (info.installStatus === PlayInstallStatus.Unknown) {
        return { phase: state.phase === 'starting' ? 'starting' : 'idle', info };
      }
      return reducePlayDelivery(
        { phase: 'idle', info },
        { kind: 'status', status: info.installStatus },
      );
    }
    case 'status': {
      if (event.status === PlayInstallStatus.Installed) return { phase: 'idle', info: null };
      // A callback without target metadata cannot authorize an install or advertise readiness.
      if (!state.info) return state;
      const info = { ...state.info, installStatus: event.status };
      switch (event.status) {
        case PlayInstallStatus.Downloaded:
          return { phase: 'downloaded', info };
        case PlayInstallStatus.Pending:
        case PlayInstallStatus.Downloading:
          return { phase: 'downloading', info, progress: event.progress };
        case PlayInstallStatus.Installing:
          return { phase: 'installing', info };
        case PlayInstallStatus.Cancelled:
        case PlayInstallStatus.Failed:
          return { phase: 'idle', info };
        default:
          return state;
      }
    }
  }
}
