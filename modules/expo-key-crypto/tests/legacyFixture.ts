import raw from './fixtures/legacy-v1.json';
import {
  parseLocalUser,
  parseUserRecoveryPackage,
  parseWorkplaceKeys,
} from '@/src/services/backup/keyHierarchyRecords';
import { parseEncryptedSnapshotEnvelope } from '@/src/services/backup/encryptedSnapshot';
import { decodeWorkplaceSnapshot } from '@/src/services/backup/workplaceSnapshot';

export const legacy = {
  ...raw,
  userCredential: raw.userCredential,
  workplaceCredential: raw.workplaceCredential,
  localUser: parseLocalUser(raw.localUser),
  user: parseUserRecoveryPackage(raw.user),
  keys: parseWorkplaceKeys(raw.keys),
  envelope: parseEncryptedSnapshotEnvelope(raw.envelope),
  snapshot: decodeWorkplaceSnapshot(JSON.stringify(raw.snapshot)),
};

if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');
