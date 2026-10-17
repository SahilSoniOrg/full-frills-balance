import { assertKeyAccessAllowed, subscribeKeyAccessPolicy } from './keyAccessPolicy';
import { keyOperationsFromTransport, type NativeKeyOperations } from './nativeKeyApi';
import { executeKeyCryptoWorker, setKeyCryptoWorkerAllowed } from './keyCryptoWorkerClient.web';
import {
  pickRecoveryCredentialFileText,
  saveRecoveryCredentialFileText,
} from './recoveryCredentialFiles.web';

let initiallyAllowed = false;
try {
  assertKeyAccessAllowed();
  initiallyAllowed = true;
} catch {
  /* No mounted/unlocked shell yet. */
}
setKeyCryptoWorkerAllowed(initiallyAllowed);
subscribeKeyAccessPolicy(allowed => setKeyCryptoWorkerAllowed(allowed));

export const nativeKeyOperations: NativeKeyOperations = {
  ...keyOperationsFromTransport(async (operation, request) => {
    if (operation !== 'removeKey' && operation !== 'releaseKey' && operation !== 'clearVault')
      assertKeyAccessAllowed();
    const result = await executeKeyCryptoWorker(operation, request);
    if (operation !== 'removeKey' && operation !== 'releaseKey' && operation !== 'clearVault')
      assertKeyAccessAllowed();
    return result as Record<string, unknown>;
  }),
  async pickCredential() {
    assertKeyAccessAllowed();
    const fileText = await pickRecoveryCredentialFileText();
    if (fileText === null) return null;
    const handle = await executeKeyCryptoWorker('importCredential', { fileText });
    assertKeyAccessAllowed();
    return handle;
  },
  async exportCredential(handle) {
    assertKeyAccessAllowed();
    await executeKeyCryptoWorker('retainCredential', { credential: handle });
    try {
      const result = (await executeKeyCryptoWorker('exportCredential', { credential: handle })) as {
        fileText?: string;
      };
      if (!result?.fileText) return false;
      return saveRecoveryCredentialFileText(result.fileText);
    } finally {
      await executeKeyCryptoWorker('releaseCredential', { credential: handle }).catch(
        () => undefined,
      );
    }
  },
  async retainCredential(handle) {
    await executeKeyCryptoWorker('retainCredential', { credential: handle });
  },
  async releaseCredential(handle) {
    await executeKeyCryptoWorker('releaseCredential', { credential: handle });
  },
  async clearCredentials() {
    await executeKeyCryptoWorker('clearCredentials', {});
  },
};
