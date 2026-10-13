import { requireOptionalNativeModule } from 'expo';
import { assertKeyAccessAllowed, subscribeKeyAccessPolicy } from './keyAccessPolicy';
import type { NativeKeyOperations } from './nativeKeyOperations';

type NativeModule = {
  setAllowed(allowed: boolean): void;
  execute(operation: string, request: string): Promise<string>;
  importCredential(uri: string): Promise<string>;
  writeCredential(handle: string, uri: string): Promise<void>;
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
  async execute(operation, request) {
    if (operation !== 'removeDevice') assertKeyAccessAllowed();
    const result = await ready().execute(operation, JSON.stringify(request));
    if (operation !== 'removeDevice') assertKeyAccessAllowed();
    return JSON.parse(result);
  },
  async importCredential(uri) {
    assertKeyAccessAllowed();
    const result = await ready().importCredential(uri);
    assertKeyAccessAllowed();
    return JSON.parse(result);
  },
  writeCredential: (handle, uri) => ready().writeCredential(JSON.stringify(handle), uri),
  retainCredential: handle => ready().retainCredential(JSON.stringify(handle)),
  releaseCredential: handle => ready().releaseCredential(JSON.stringify(handle)),
  clearCredentials: async () => {
    await module?.clearCredentials();
  },
};
