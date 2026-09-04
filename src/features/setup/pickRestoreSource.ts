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
import { Alert } from 'react-native';
import { generator } from '@/src/data/database/idGenerator';
import type { WorkplaceId } from '@/src/types/ids';

const preparedByFingerprint = new Map<string, PreparedRestore>();
const preparedByOperationId = new Map<string, PreparedRestore>();

export function rememberPreparedRestore(
  prepared: PreparedRestore,
  operationId?: WorkplaceId,
): void {
  if (operationId) preparedByOperationId.set(operationId, prepared);
  else preparedByFingerprint.set(prepared.fingerprint, prepared);
}

export function forgetPreparedRestore(fingerprint: string | undefined): void {
  if (fingerprint) preparedByFingerprint.delete(fingerprint);
}

export function forgetAllPreparedRestores(): void {
  preparedByFingerprint.clear();
  preparedByOperationId.clear();
}

/** Detected format must match the plugin the user selected. */
export function resolveRestorePlugin(
  context: ImportFileContext,
  expectedPluginId: string,
): ImportPlugin {
  const detected = importRegistry.detect(context);
  if (!detected) throw new Error('Could not determine restore file format');
  if (detected.id !== expectedPluginId) {
    throw new Error('Selected restore format does not match this backup');
  }
  return detected;
}

export interface V2Backup {
  format?: unknown;
  formatVersion?: unknown;
  preferences?: unknown;
  workplaces?: {
    workplace?: unknown;
    workplacePreferences?: unknown;
    data?: Record<string, unknown>;
  }[];
}

export function isV2Backup(value: unknown): value is V2Backup {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as V2Backup).format === 'full-frills-backup' &&
    (value as V2Backup).formatVersion === 2 &&
    Array.isArray((value as V2Backup).workplaces)
  );
}

export function normalizeV2Workplace(
  context: ImportFileContext,
  entry: NonNullable<V2Backup['workplaces']>[number],
): ImportFileContext {
  if (!entry.data || typeof entry.workplace !== 'object' || entry.workplace === null) {
    throw new Error('Selected workplace data is invalid');
  }
  const normalized = {
    ...(entry.data as Record<string, unknown>),
    version: '2.0',
    preferences: context.json && isV2Backup(context.json) ? context.json.preferences : undefined,
    workplacePreferences: entry.workplacePreferences,
    workplace: entry.workplace,
  };
  return { ...context, json: normalized, text: JSON.stringify(normalized) };
}

function sourceRefFor(
  file: DocumentPicker.DocumentPickerAsset,
  fingerprint: string,
  workplaceIndex?: number,
) {
  return {
    uri: file.uri,
    name: file.name,
    ...(file.size === undefined ? {} : { size: file.size }),
    fingerprint,
    ...(workplaceIndex === undefined ? {} : { workplaceIndex }),
  };
}

async function selectV2Workplace(context: ImportFileContext): Promise<ImportFileContext> {
  if (!isV2Backup(context.json)) return context;
  const workplaces = context.json.workplaces ?? [];
  if (workplaces.length === 0) throw new Error('This backup contains no workplaces');

  let selectedIndex = 0;
  if (workplaces.length > 1) {
    const choice = await new Promise<number | undefined>(resolve => {
      Alert.alert(
        'Choose workplace to restore',
        'This backup contains multiple workplaces. Restore one at a time.',
        workplaces.map((entry, index) => ({
          text:
            typeof entry.workplace === 'object' && entry.workplace !== null
              ? String((entry.workplace as { name?: unknown }).name ?? `Workplace ${index + 1}`)
              : `Workplace ${index + 1}`,
          onPress: () => resolve(index),
        })),
        { cancelable: true, onDismiss: () => resolve(undefined) },
      );
    });
    if (choice === undefined) throw new Error('Restore cancelled');
    selectedIndex = choice;
  }

  return normalizeV2Workplace(context, workplaces[selectedIndex]);
}

export async function pickAndPrepareRestore(
  expectedPluginId: string,
  onProgress?: (message: string, progress?: number) => void,
  selectV2Workplaces?: (
    workplaces: NonNullable<V2Backup['workplaces']>[number][],
  ) => Promise<number[]>,
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
  const v2 = isV2Backup(context.json) ? (context.json.workplaces ?? []) : undefined;
  const selectedIndexes =
    v2 && v2.length > 1
      ? await (selectV2Workplaces ? selectV2Workplaces(v2) : Promise.resolve([0]))
      : [0];
  if (selectedIndexes.length === 0) throw new Error('Select at least one workplace to restore');
  const selectedEntries = v2
    ? selectedIndexes.map(index => v2[index]).filter(Boolean)
    : [undefined];
  const preparedSources: RestoreSourceOutput[] = [];
  for (let index = 0; index < selectedEntries.length; index += 1) {
    const selectedContext = selectedEntries[index]
      ? normalizeV2Workplace(context, selectedEntries[index]!)
      : await selectV2Workplace(context);
    const plugin = resolveRestorePlugin(selectedContext, expectedPluginId);
    const prepared = await prepareRestore(plugin, selectedContext, {
      onProgress: (message, progress) =>
        onProgress?.(
          selectedEntries.length > 1
            ? `${message} (${index + 1}/${selectedEntries.length})`
            : message,
          progress === undefined ? undefined : (index + progress) / selectedEntries.length,
        ),
    });
    rememberPreparedRestore(prepared);
    preparedSources.push({
      source: sourceRefFor(
        file,
        prepared.fingerprint,
        selectedEntries[index] ? selectedIndexes[index] : undefined,
      ),
      facts: prepared.facts,
      ...(index === 0 ? {} : { operationId: generator() as WorkplaceId }),
    });
  }
  const [primary, ...batch] = preparedSources;
  return {
    ...primary,
    ...(batch.length > 0 ? { batch } : {}),
  };
}

export async function loadPreparedRestore(draft: RestoreSetupDraft): Promise<PreparedRestore> {
  const source = draft.restore.source;
  if (!source) throw new Error('Restore source is missing');
  const cached = preparedByFingerprint.get(source.source.fingerprint);
  if (cached) return cached;
  const context = await fileContext(source.source.uri, source.source.name);
  const selectedContext = await selectV2WorkplaceAtIndex(context, source.source.workplaceIndex);
  const plugin = importRegistry.detect(selectedContext);
  if (!plugin) throw new Error('Could not determine restore file format');
  const prepared = await prepareRestore(plugin, selectedContext);
  if (prepared.fingerprint !== source.source.fingerprint) {
    throw new Error('Restore source no longer matches the selected backup');
  }
  rememberPreparedRestore(prepared);
  return prepared;
}

export async function loadPreparedRestores(draft: RestoreSetupDraft): Promise<PreparedRestore[]> {
  const sources = [draft.restore.source, ...(draft.restore.source?.batch ?? [])].filter(
    (source): source is RestoreSourceOutput => source !== undefined,
  );
  const prepared: PreparedRestore[] = [];
  for (const source of sources) {
    // A v2 file has one raw fingerprint but multiple workplace payloads. Only the
    // single-workplace path can safely use the fingerprint cache directly.
    const cached = source.operationId
      ? preparedByOperationId.get(source.operationId)
      : source.source.workplaceIndex === undefined
        ? preparedByFingerprint.get(source.source.fingerprint)
        : undefined;
    if (cached) {
      prepared.push(cached);
      continue;
    }
    const context = await fileContext(source.source.uri, source.source.name);
    const selectedContext = await selectV2WorkplaceAtIndex(context, source.source.workplaceIndex);
    const plugin = importRegistry.detect(selectedContext);
    if (!plugin) throw new Error('Could not determine restore file format');
    const item = await prepareRestore(plugin, selectedContext);
    rememberPreparedRestore(item);
    prepared.push(item);
  }
  return prepared;
}

async function selectV2WorkplaceAtIndex(
  context: ImportFileContext,
  index?: number,
): Promise<ImportFileContext> {
  if (index === undefined) return selectV2Workplace(context);
  if (!isV2Backup(context.json)) return context;
  const entry = context.json.workplaces?.[index];
  if (!entry) throw new Error('Selected workplace is missing from the backup');
  return normalizeV2Workplace(context, entry);
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
