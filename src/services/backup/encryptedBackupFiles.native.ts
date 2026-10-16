import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { EncryptedBackupFiles } from './encryptedBackupFiles';
import { files } from '@/src/utils/files';
async function pickEncryptedBackupZip(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/zip',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return files.readBytes(result.assets[0].uri);
}

async function exportEncryptedBackupZip(archive: Uint8Array): Promise<boolean> {
  const filename = `full-frills-encrypted-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const uri = `${files.cache.replace(/\/?$/, '/')}${filename}`;
  await files.writeContent(uri, archive);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/zip',
    dialogTitle: 'Encrypted backup',
    UTI: Platform.OS === 'ios' ? 'com.pkware.zip-archive' : undefined,
  });
  return true;
}

export const encryptedBackupFiles: EncryptedBackupFiles = {
  pickEncryptedBackupZip,
  exportEncryptedBackupZip,
};
