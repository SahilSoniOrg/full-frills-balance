export interface EncryptedBackupFiles {
  pickEncryptedBackupZip(): Promise<Uint8Array | null>;
  exportEncryptedBackupZip(archive: Uint8Array): Promise<boolean>;
}

const unavailable = async (): Promise<never> => {
  throw new Error('Encrypted backup files require a supported platform build');
};

export const encryptedBackupFiles: EncryptedBackupFiles = {
  pickEncryptedBackupZip: unavailable,
  exportEncryptedBackupZip: unavailable,
};
