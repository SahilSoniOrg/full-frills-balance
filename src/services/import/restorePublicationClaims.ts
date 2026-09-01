import type { WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';

const RESTORE_PUBLICATION_CLAIMS_KEY = 'restore_publication_claims_v1';

interface StringStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

function readClaims(store: StringStorage): Record<string, string> {
  try {
    const raw = store.getString(RESTORE_PUBLICATION_CLAIMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0].trim().length > 0 && typeof entry[1] === 'string' && entry[1].trim().length > 0,
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Claims source identity before database publication. This ordering is fail-closed:
 * a crash can leave a harmless claim without books, never books without a claim.
 */
export class RestorePublicationClaims {
  constructor(private readonly store: StringStorage = storage) {}

  claim(operationId: WorkplaceId, fingerprint: string): void {
    const claims = readClaims(this.store);
    const existing = claims[operationId];
    if (existing !== undefined && existing !== fingerprint) {
      throw new Error('Restore operation ID is already owned by a different backup source');
    }
    if (existing === fingerprint) return;
    this.store.set(
      RESTORE_PUBLICATION_CLAIMS_KEY,
      JSON.stringify({ ...claims, [operationId]: fingerprint }),
    );
  }

  fingerprintFor(operationId: WorkplaceId): string | undefined {
    return readClaims(this.store)[operationId];
  }
}

export const restorePublicationClaims = new RestorePublicationClaims();
