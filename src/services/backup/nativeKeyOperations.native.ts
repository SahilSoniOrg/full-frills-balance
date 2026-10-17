import { requireOptionalNativeModule } from 'expo';
import { assertKeyAccessAllowed, subscribeKeyAccessPolicy } from './keyAccessPolicy';
import { keyOperationsFromTransport, type NativeKeyOperations } from './nativeKeyApi';

type NativeModule = {
  setAllowed(allowed: boolean): void;
  execute(operation: string, request: string): Promise<string>;
  pickCredential(): Promise<string | null>;
  exportCredential(handle: string): Promise<boolean>;
  retainCredential(handle: string): Promise<void>;
  releaseCredential(handle: string): Promise<void>;
  clearCredentials(): Promise<void>;
};
const installed = requireOptionalNativeModule<NativeModule>('ExpoKeyCrypto');
const module =
  installed && typeof installed.execute === 'function' && typeof installed.setAllowed === 'function'
    ? installed
    : null;
function ready(): NativeModule {
  if (!module)
    throw new Error('The native key module is unavailable; install a build with ExpoKeyCrypto');
  return module;
}
let initiallyAllowed = false;
try {
  assertKeyAccessAllowed();
  initiallyAllowed = true;
} catch {
  /* No mounted/unlocked shell yet. */
}
module?.setAllowed(initiallyAllowed);
subscribeKeyAccessPolicy(allowed => module?.setAllowed(allowed));
export const nativeKeyOperations: NativeKeyOperations = {
  ...keyOperationsFromTransport(async (operation, request) => {
    if (operation !== 'removeKey' && operation !== 'releaseKey' && operation !== 'clearVault')
      assertKeyAccessAllowed();
    const result = await ready().execute(operation, JSON.stringify(request));
    if (operation !== 'removeKey' && operation !== 'releaseKey' && operation !== 'clearVault')
      assertKeyAccessAllowed();
    return JSON.parse(result);
  }),
  async pickCredential() {
    assertKeyAccessAllowed();
    const value = await ready().pickCredential();
    assertKeyAccessAllowed();
    return value === null ? null : JSON.parse(value);
  },
  exportCredential: handle => ready().exportCredential(JSON.stringify(handle)),
  retainCredential: handle => ready().retainCredential(JSON.stringify(handle)),
  releaseCredential: handle => ready().releaseCredential(JSON.stringify(handle)),
  clearCredentials: async () => {
    await module?.clearCredentials();
  },
};
