import {
  verifyUserMessage,
  parseUserPublicIdentity,
  userIdentityFingerprint,
  type UserPublicIdentity,
} from '@/src/services/backup/userIdentity';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { parseRowManifest, type ManifestScope, type ParsedRowManifest } from './rowEnvelope';

/** The expected fingerprint is pinned outside the untrusted backup/server payload. */
export async function verifyRowManifest(
  value: unknown,
  scope: ManifestScope,
  pinned: UserPublicIdentity,
  expectedFingerprint: string,
): Promise<ParsedRowManifest> {
  const identity = parseUserPublicIdentity(pinned);
  if (
    identity.userId !== scope.authorUserId ||
    (await userIdentityFingerprint(identity)) !== expectedFingerprint
  )
    throw new KeyOperationError('FFB_ROW_INTEGRITY');
  const manifest = parseRowManifest(value, scope);
  try {
    await verifyUserMessage(identity.signingPublicKey, manifest.signedBytes, manifest.signature);
  } catch {
    throw new KeyOperationError('FFB_ROW_INTEGRITY');
  }
  return manifest;
}
