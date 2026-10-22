import { parseRecoveryCredential } from './keyEnvelopes';
import type { RecoveryFiles } from './recoveryFiles';
import { nativeKeyOperations } from './nativeKeyOperations';

export const recoveryFiles: RecoveryFiles = {
  exportSecret: value => nativeKeyOperations.exportCredential(parseRecoveryCredential(value)),
  pickSecret: async () => {
    const value = await nativeKeyOperations.pickCredential();
    return value === null ? null : parseRecoveryCredential(value);
  },
  cleanupTemporarySecrets: () => nativeKeyOperations.clearCredentials(),
};
