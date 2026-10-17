/** Stores only public metadata and encrypted key envelopes, never readable decryption secrets. */
export interface KeyCiphertextStateStore {
  read(scope: string): Promise<unknown | null>;
  write(scope: string, value: unknown): Promise<void>;
  remove(scope: string): Promise<void>;
  clear(): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Encrypted key storage requires native private file storage');
};
export const keyCiphertextStateStore: KeyCiphertextStateStore = {
  read: unavailable,
  write: unavailable,
  remove: unavailable,
  clear: async () => undefined,
};
