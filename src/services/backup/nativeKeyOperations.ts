/** Public metadata/ciphertext only; private keys are never arguments or results. */
export type KeyOperation =
  | 'hasDevice'
  | 'removeDevice'
  | 'createUser'
  | 'checkUser'
  | 'sign'
  | 'enrollWorkplace'
  | 'confirmUser'
  | 'validateRecovery'
  | 'recoverUser'
  | 'validateMember'
  | 'confirmWorkplace'
  | 'encryptSnapshot'
  | 'decryptSnapshot'
  | 'decryptDump';
export interface NativeKeyOperations {
  execute(operation: KeyOperation, request: unknown): Promise<unknown>;
  importCredential(uri: string): Promise<unknown>;
  writeCredential(handle: unknown, uri: string): Promise<void>;
  retainCredential(handle: unknown): Promise<void>;
  releaseCredential(handle: unknown): Promise<void>;
  clearCredentials(): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Key operations require the native Android or iOS crypto module');
};
export const nativeKeyOperations: NativeKeyOperations = {
  execute: unavailable,
  importCredential: unavailable,
  writeCredential: unavailable,
  retainCredential: unavailable,
  releaseCredential: unavailable,
  clearCredentials: async () => undefined,
};
