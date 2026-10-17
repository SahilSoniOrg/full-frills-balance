export interface RecoveryFiles {
  exportSecret(value: unknown): Promise<boolean>;
  pickSecret(): Promise<unknown | null>;
  cleanupTemporarySecrets(): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Recovery files require Android or iOS');
};
export const recoveryFiles: RecoveryFiles = {
  exportSecret: unavailable,
  pickSecret: unavailable,
  cleanupTemporarySecrets: async () => undefined,
};
