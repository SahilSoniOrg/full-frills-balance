import type { EncryptedSnapshot } from './encryptedSnapshot';

/** Supplied only by a future adapter that verifies the pinned User key and registered Device. */
export interface TrustedBackupIdentity {
  readonly userId: string;
  readonly accessToken: string;
  readonly userKeyFingerprint: string;
  readonly registeredDeviceId: string;
  readonly userKeyAnchorVerified: true;
  readonly deviceRegistrationVerified: true;
  readonly signRequest: (canonicalRequest: string) => Promise<string>;
}

export interface WorkplaceBackupConsent {
  readonly userId: string;
  readonly workplaceId: string;
  readonly userKeyFingerprint: string;
  readonly registeredDeviceId: string;
  readonly consentedAt: number;
  readonly revokedAt?: number;
}

export interface PendingManualBackup {
  readonly userId: string;
  readonly workplaceId: string;
  readonly userKeyFingerprint: string;
  readonly registeredDeviceId: string;
  readonly consentAcceptedAt: number;
  readonly envelope: EncryptedSnapshot;
}

export interface ManualBackupStateStore {
  loadConsent(userId: string, workplaceId: string): Promise<WorkplaceBackupConsent | null>;
  saveConsent(consent: WorkplaceBackupConsent): Promise<void>;
  loadPending(userId: string, workplaceId: string): Promise<PendingManualBackup | null>;
  savePending(pending: PendingManualBackup): Promise<void>;
  clearPending(userId: string, workplaceId: string, expectedSnapshotId: string): Promise<void>;
}

export interface ManualBackupTransport {
  readonly configured: boolean;
  upload(input: {
    readonly identity: TrustedBackupIdentity;
    readonly workplaceId: string;
    readonly envelope: EncryptedSnapshot;
    readonly contentHash: string;
    readonly idempotencyKey: string;
    readonly assertAuthorized: () => Promise<void>;
    readonly assertDispatchAllowed: () => void;
  }): Promise<{ snapshotId: string; contentHash: string }>;
  downloadLatest(input: {
    readonly identity: TrustedBackupIdentity;
    readonly workplaceId: string;
    readonly assertAuthorized: () => Promise<void>;
    readonly assertDispatchAllowed: () => void;
  }): Promise<{
    readonly ownerUserId: string;
    readonly workplaceId: string;
    readonly userKeyFingerprint: string;
    readonly envelope: EncryptedSnapshot;
    readonly contentHash: string;
  }>;
}
