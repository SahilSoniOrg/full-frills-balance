import { File, Directory, Paths } from 'expo-file-system';
import * as LegacyFiles from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { MAX_RECOVERY_PACKAGE_BYTES, parseRecoveryCredential } from './localRecoveryPackage';
import type { RecoveryFiles } from './recoveryFiles';
import { nativeKeyOperations } from './nativeKeyOperations';
import { KeyOperationError } from '@/src/utils/keyOperationError';

const SECRET_LIMIT = 4096;
const activeFiles = new Set<string>();
async function cleanup(): Promise<void> {
  for (const entry of new Directory(Paths.cache).list()) {
    if (
      entry instanceof File &&
      /^recovery-(secret|package)-(export|import)-[a-f0-9]{32}\.json$/.test(entry.name) &&
      !activeFiles.has(entry.uri)
    )
      entry.delete();
  }
}
async function savePackage(value: unknown): Promise<boolean> {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).length > MAX_RECOVERY_PACKAGE_BYTES)
    throw new Error('Recovery file is too large');
  await cleanup();
  const suffix = keyHex(snapshotCrypto.randomBytes(16));
  const filename = 'full-frills-encrypted-package.json';
  if (Platform.OS === 'android') {
    // Write directly to the user's chosen destination. No internal plaintext-secret backup.
    const permission = await LegacyFiles.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;
    const destination = await LegacyFiles.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      filename,
      'application/json',
    );
    await LegacyFiles.writeAsStringAsync(destination, json, {
      encoding: LegacyFiles.EncodingType.UTF8,
    });
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('File export is unavailable');
  // iOS requires a temporary source file for its Save to Files sheet. Cache is not a retained secret store.
  const temporary = new File(Paths.cache, `recovery-package-export-${suffix}.json`);
  activeFiles.add(temporary.uri);
  try {
    temporary.create();
    temporary.write(json);
    await Sharing.shareAsync(temporary.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: filename,
    });
    return true; // Dismissal is NOT save confirmation; the workflow requires importing the saved file.
  } finally {
    activeFiles.delete(temporary.uri);
    if (temporary.exists) temporary.delete();
  }
}
async function saveSecret(value: unknown): Promise<boolean> {
  const handle = parseRecoveryCredential(value);
  // The lease authorizes this explicit export across the OS picker/share transition.
  await nativeKeyOperations.retainCredential(handle);
  try {
    await cleanup();
    const filename = `full-frills-${handle.purpose}-secret.json`;
    if (Platform.OS === 'android') {
      const permission =
        await LegacyFiles.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return false;
      const destination = await LegacyFiles.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        filename,
        'application/json',
      );
      await nativeKeyOperations.writeCredential(handle, destination);
      return true;
    }
    if (!(await Sharing.isAvailableAsync())) throw new Error('File export is unavailable');
    const temporary = new File(
      Paths.cache,
      `recovery-secret-export-${keyHex(snapshotCrypto.randomBytes(16))}.json`,
    );
    activeFiles.add(temporary.uri);
    try {
      temporary.create();
      await nativeKeyOperations.writeCredential(handle, temporary.uri);
      await Sharing.shareAsync(temporary.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: filename,
      });
      return true;
    } finally {
      activeFiles.delete(temporary.uri);
      if (temporary.exists) temporary.delete();
    }
  } finally {
    await nativeKeyOperations.releaseCredential(handle);
  }
}
async function pick(limit: number): Promise<unknown | null> {
  await cleanup();
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    multiple: false,
    copyToCacheDirectory: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No recovery file was selected');
  let input = new File(asset.uri);
  let ownedCopy = false;
  if (Platform.OS === 'ios' && limit === SECRET_LIMIT) {
    // The installed iOS picker uses asCopy:true even with copyToCacheDirectory:false.
    // Move ONLY that app-owned temporary copy into our purgeable namespace; never delete a saved source file.
    const document = Paths.document.uri;
    const cache = Paths.cache.uri;
    const temporaryRoot = new URL('../tmp/', document).href;
    const inbox = new URL('Inbox/', document).href;
    const canonicalPath = (uri: string) =>
      new URL(uri).pathname.replace(/^\/private\/var\//, '/var/');
    if (
      !canonicalPath(input.uri).startsWith(canonicalPath(temporaryRoot)) &&
      !canonicalPath(input.uri).startsWith(canonicalPath(inbox)) &&
      !canonicalPath(input.uri).startsWith(canonicalPath(cache))
    )
      throw new Error('The recovery file was not supplied as a temporary copy');
    const destination = new File(
      Paths.cache,
      `recovery-secret-import-${keyHex(snapshotCrypto.randomBytes(16))}.json`,
    );
    input.move(destination);
    input = destination;
    ownedCopy = true;
    activeFiles.add(input.uri);
  }
  try {
    if ((asset.size !== undefined && asset.size > limit) || input.size > limit)
      throw new KeyOperationError('FFB_KEY_INVALID_FILE', 'Recovery file is too large');
    if (limit === SECRET_LIMIT)
      return parseRecoveryCredential(await nativeKeyOperations.importCredential(input.uri));
    const json = await input.text();
    if (new TextEncoder().encode(json).length > limit)
      throw new KeyOperationError('FFB_KEY_INVALID_FILE', 'Recovery file is too large');
    try {
      return JSON.parse(json);
    } catch {
      throw new KeyOperationError('FFB_KEY_INVALID_FILE', 'Choose a valid recovery JSON file');
    }
  } finally {
    if (ownedCopy) {
      activeFiles.delete(input.uri);
      if (input.exists) input.delete();
    }
  }
}
export const recoveryFiles: RecoveryFiles = {
  exportSecret: saveSecret,
  exportPackage: savePackage,
  pickSecret: () => pick(SECRET_LIMIT),
  pickPackage: () => pick(MAX_RECOVERY_PACKAGE_BYTES),
  cleanupTemporarySecrets: async () => {
    await nativeKeyOperations.clearCredentials();
    await cleanup();
  },
};
