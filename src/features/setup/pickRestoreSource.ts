import {
  decodeContent,
  extractIfZip,
  importRegistry,
  readFileAsBytes,
  sanitizeContent,
} from '@/src/services/import';
import { prepareRestore, type PreparedRestore } from '@/src/services/import/restore';
import type { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { restoreSources, type RestoreSetupDraft, type RestoreSourceOutput } from './setupTypes';
import * as DocumentPicker from 'expo-document-picker';
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

export function forgetAllPreparedRestores(): void {
  preparedByFingerprint.clear();
  preparedByOperationId.clear();
}

export function keepPreparedRestores(sources: readonly RestoreSourceOutput[]): void {
  const fingerprints = new Set(
    sources.filter(source => !source.operationId).map(source => source.source.fingerprint),
  );
  const operationIds = new Set<string>(
    sources.flatMap(source => (source.operationId ? [source.operationId] : [])),
  );
  for (const fingerprint of preparedByFingerprint.keys()) {
    if (!fingerprints.has(fingerprint)) preparedByFingerprint.delete(fingerprint);
  }
  for (const operationId of preparedByOperationId.keys()) {
    if (!operationIds.has(operationId)) preparedByOperationId.delete(operationId);
  }
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

export async function pickAndPrepareRestore(
  expectedPluginId: string,
  onProgress?: (message: string, progress?: number) => void,
): Promise<readonly RestoreSourceOutput[] | 'cancelled'> {
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
  forgetAllPreparedRestores();
  const file = result.assets[0];
  const context = await fileContext(file.uri, file.name);
  const v2 = isV2Backup(context.json) ? (context.json.workplaces ?? []) : undefined;
  if (v2?.length === 0) throw new Error('This backup contains no workplaces');
  const entries = v2 ?? [undefined];
  const preparedSources: RestoreSourceOutput[] = [];
  const preparationErrors: { index: number; error: unknown }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    try {
      const selectedContext = entries[index]
        ? normalizeV2Workplace(context, entries[index]!)
        : context;
      const plugin = resolveRestorePlugin(selectedContext, expectedPluginId);
      const prepared = await prepareRestore(plugin, selectedContext, {
        onProgress: (message, progress) =>
          onProgress?.(
            entries.length > 1 ? `${message} (${index + 1}/${entries.length})` : message,
            progress === undefined ? undefined : (index + progress) / entries.length,
          ),
      });
      const operationId = preparedSources.length === 0 ? undefined : (generator() as WorkplaceId);
      rememberPreparedRestore(prepared, operationId);
      preparedSources.push({
        source: sourceRefFor(file, prepared.fingerprint, entries[index] ? index : undefined),
        facts: prepared.facts,
        stats: prepared.stats,
        warnings: prepared.warnings,
        ...(operationId ? { operationId } : {}),
      });
    } catch (error) {
      // A malformed workplace should be discardable while retaining valid books
      // from the same V2 backup. Keep processing the remaining entries.
      preparationErrors.push({ index, error });
    }
  }
  if (preparedSources.length === 0) {
    const firstError = preparationErrors[0]?.error;
    throw firstError instanceof Error
      ? firstError
      : new Error('No workplaces in this backup could be restored');
  }
  if (preparationErrors.length > 0) {
    const skipped = preparationErrors.map(item => `Workplace ${item.index + 1}`).join(', ');
    preparedSources[0] = {
      ...preparedSources[0],
      warnings: [
        ...(preparedSources[0]?.warnings ?? []),
        `Could not prepare ${skipped}; those workplaces were discarded.`,
      ],
    };
  }
  return preparedSources;
}

/** Keep only the candidates the user chose after validation. */
export function selectPreparedRestoreSources(
  sources: readonly RestoreSourceOutput[],
  selectedIndexes: readonly number[],
): RestoreSourceOutput[] | undefined {
  const selectedSet = new Set(selectedIndexes);
  const selected = sources.filter((_, index) => selectedSet.has(index));
  return selected.length > 0 ? selected : undefined;
}

export async function loadPreparedRestores(draft: RestoreSetupDraft): Promise<PreparedRestore[]> {
  const sources = restoreSources(draft);
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
    rememberPreparedRestore(item, source.operationId);
    prepared.push(item);
  }
  return prepared;
}

async function selectV2WorkplaceAtIndex(
  context: ImportFileContext,
  index?: number,
): Promise<ImportFileContext> {
  if (!isV2Backup(context.json)) return context;
  const workplaces = context.json.workplaces ?? [];
  if (index === undefined && workplaces.length > 1) {
    throw new Error('Restore selection must be restarted for this multi-workplace backup');
  }
  const entry = workplaces[index ?? 0];
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
