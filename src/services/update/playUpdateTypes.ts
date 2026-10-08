export const ANDROID_APPLICATION_ID = 'in.sahilsoni.fullfrillsbalance';
export const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APPLICATION_ID}`;

export enum PlayInstallStatus {
  Unknown = 0,
  Pending = 1,
  Downloading = 2,
  Installing = 3,
  Installed = 4,
  Failed = 5,
  Cancelled = 6,
  Downloaded = 11,
}

export type PlayUpdateInfo = {
  build: number;
  availability: 'available' | 'in-progress' | 'none';
  immediateAllowed: boolean;
  flexibleAllowed: boolean;
  installStatus: PlayInstallStatus;
};

export type PlayUpdateEvent =
  | { kind: 'status'; status: PlayInstallStatus; progress?: number }
  | { kind: 'cancelled' }
  | { kind: 'accepted' };

export interface PlayUpdateAdapter {
  check(): Promise<PlayUpdateInfo | null>;
  start(mode: 'flexible' | 'immediate'): Promise<void>;
  install(): Promise<void>;
  subscribe(listener: (event: PlayUpdateEvent) => void): () => void;
}

export function parseBuild(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const build = Number(value);
  return Number.isSafeInteger(build) && build >= 0 ? build : null;
}
