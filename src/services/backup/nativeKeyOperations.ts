import { keyOperationsFromTransport, type NativeKeyOperations } from './nativeKeyApi';

const unavailable = async (): Promise<never> => {
  throw new Error('Key operations require the native Android or iOS crypto module');
};
export const nativeKeyOperations: NativeKeyOperations = {
  ...keyOperationsFromTransport(unavailable),
  importCredential: unavailable,
  writeCredential: unavailable,
  retainCredential: unavailable,
  releaseCredential: unavailable,
  clearCredentials: async () => undefined,
};
