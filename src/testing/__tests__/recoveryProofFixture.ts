import type { ProofBundle } from '../nativeRecoveryProofBundle';
import type { KeyEnvelope } from '@/src/services/backup/keyEnvelopes';

/** Public metadata and opaque handles only; these are not usable native keys or credentials. */
export function recoveryProofFixture(): ProofBundle {
  const pin = `sha256:${'11'.repeat(32)}`;
  const publicKey = '22'.repeat(32);
  const envelope = (purpose: KeyEnvelope['context']['purpose']): KeyEnvelope => ({
    format: 'full-frills-key-envelope',
    formatVersion: 1,
    suite: 'HPKE-X25519-HKDF-SHA256-AES256GCM',
    context: { purpose, userId: 'native-proof-user', recipientKeyId: pin },
    encapsulatedKey: publicKey,
    ciphertext: 'opaque-encrypted-envelope',
  });
  const userPackage: ProofBundle['userPackage'] = {
    format: 'full-frills-user-recovery',
    formatVersion: 1,
    userId: 'native-proof-user',
    publicIdentity: {
      format: 'full-frills-user-identity',
      formatVersion: 1,
      userId: 'native-proof-user',
      encryptionAlgorithm: 'X25519',
      encryptionPublicKey: publicKey,
      signingAlgorithm: 'Ed25519',
      signingPublicKey: publicKey,
    },
    userKeyFingerprint: pin,
    recoveryPublicKey: publicKey,
    recoveryEnvelope: envelope('user-recovery'),
  };
  const workplaceKeys: ProofBundle['workplaceKeys'] = {
    format: 'full-frills-workplace-keys',
    formatVersion: 1,
    userId: userPackage.userId,
    workplaceId: 'demo_workspace',
    userKeyFingerprint: pin,
    keyId: pin,
    memberEnvelope: envelope('user-workplace-dek'),
    recoveryPublicKey: publicKey,
    recoveryEnvelope: envelope('workplace-dump'),
    recoveryConfirmed: true,
    writerDeviceId: 'native-proof-source',
    encryptionInvocations: 1,
  };
  const snapshot: ProofBundle['envelope'] = {
    format: 'full-frills-encrypted-snapshot',
    formatVersion: 1,
    algorithm: 'AES-256-GCM',
    workplaceId: 'demo_workspace',
    snapshotId: '33'.repeat(16),
    schemaVersion: 1,
    keyId: pin,
    nonce: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'opaque-encrypted-snapshot',
  };
  return {
    signedPackage: {
      format: 'full-frills-local-recovery',
      formatVersion: 1,
      userRecoveryPackage: userPackage,
      workplaceKeys,
      snapshot,
      signature: '44'.repeat(64),
    },
    envelope: snapshot,
    userPackage,
    workplaceKeys,
    sourceFingerprint: pin,
    userCredential: {
      format: 'full-frills-recovery-handle',
      formatVersion: 1,
      purpose: 'user-recovery',
      identityId: userPackage.userId,
      identityKeyId: pin,
      recoveryKeyId: pin,
      handle: '55'.repeat(32),
    },
    workplaceCredential: {
      format: 'full-frills-recovery-handle',
      formatVersion: 1,
      purpose: 'workplace-dump',
      identityId: workplaceKeys.workplaceId,
      identityKeyId: pin,
      recoveryKeyId: pin,
      handle: '66'.repeat(32),
    },
  };
}
