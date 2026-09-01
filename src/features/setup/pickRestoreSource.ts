import {
  decodeContent,
  extractIfZip,
  importRegistry,
  readFileAsBytes,
  sanitizeContent,
} from '@/src/services/import';
import { prepareRestore } from '@/src/services/import/prepareRestore';
import type { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import type { PreparedRestore } from '@/src/services/import/restoreTypes';
import type { RestoreSetupDraft, RestoreSourceOutput } from './setupTypes';
import * as DocumentPicker from 'expo-document-picker';

const preparedByFingerprint = new Map<string, PreparedRestore>();

export function rememberPreparedRestore(prepared: PreparedRestore): void {
  preparedByFingerprint.set(prepared.fingerprint, prepared);
}

export async function pickAndPrepareRestore(
  expectedPluginId: string,
  onProgress?: (message: string, progress?: number) => void,
): Promise<RestoreSourceOutput | 'cancelled'> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return 'cancelled';
  const file = result.assets[0];
  const context = await fileContext(file.uri, file.name);
  const plugin = pluginFor(context, expectedPluginId);
  const prepared = await prepareRestore(plugin, context, { onProgress });
  rememberPreparedRestore(prepared);
  return {
    source: {
      uri: file.uri,
      name: file.name,
      ...(file.size === undefined ? {} : { size: file.size }),
      fingerprint: prepared.fingerprint,
    },
    facts: prepared.facts,
  };
}

export async function loadPreparedRestore(draft: RestoreSetupDraft): Promise<PreparedRestore> {
  const source = draft.restore.source;
  if (!source) throw new Error('Restore source is missing');
  const cached = preparedByFingerprint.get(source.source.fingerprint);
  if (cached) return cached;
  const context = await fileContext(source.source.uri, source.source.name);
  const plugin = importRegistry.detect(context);
  if (!plugin) throw new Error('Could not determine restore file format');
  const prepared = await prepareRestore(plugin, context);
  if (prepared.fingerprint !== source.source.fingerprint) {
    throw new Error('Restore source no longer matches the selected backup');
  }
  rememberPreparedRestore(prepared);
  return prepared;
}

async function fileContext(uri: string, name: string): Promise<ImportFileContext> {
  let rawBytes = await readFileAsBytes(uri);
  rawBytes = await extractIfZip(rawBytes);
  const context: ImportFileContext = { uri, name, rawBytes };
  try {
    const text = sanitizeContent(decodeContent(rawBytes));
    context.text = text;
    try {
      context.json = JSON.parse(text);
    } catch {
      // Binary or non-JSON backups are still valid plugin inputs.
    }
  } catch {
    // Raw bytes are enough for plugins that do not need decoded text.
  }
  return context;
}

function pluginFor(context: ImportFileContext, expectedPluginId: string): ImportPlugin {
  const expected = importRegistry.get(expectedPluginId);
  const detected = importRegistry.detect(context);
  if (expected) return expected;
  if (detected) return detected;
  throw new Error('Could not determine restore file format');
}
