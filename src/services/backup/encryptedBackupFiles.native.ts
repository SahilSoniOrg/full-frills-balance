import * as DocumentPicker from 'expo-document-picker';
import { Directory } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
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
  if (Platform.OS === 'android') {
    const selection =
      await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!selection.granted) return false;
    const uri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
      selection.directoryUri,
      filename,
      'application/zip',
    );
    await files.writeContent(uri, archive);
    return true;
  }

  if (Platform.OS === 'ios') {
    let directory: Directory;
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('cancel')) return false;
      throw error;
    }
    const file = directory.createFile(filename, 'application/zip');
    file.write(archive);
    return true;
  }

  throw new Error('Encrypted backup saving is unavailable on this platform');
}

export const encryptedBackupFiles: EncryptedBackupFiles = {
  pickEncryptedBackupZip,
  exportEncryptedBackupZip,
};
