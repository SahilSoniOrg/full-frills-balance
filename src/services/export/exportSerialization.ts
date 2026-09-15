import type { UIPreferences } from '@/src/services/preferences/types';
import type { WorkplacePreferences } from '@/src/services/preferences/workplaceTypes';

export interface ExportMetadata {
  exportDate: string;
  version: string;
  schemaVersion: number;
  preferences: UIPreferences;
  workplacePreferences?: WorkplacePreferences;
  workplace?: {
    id: string;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface ExportWorkplaceMetadata {
  id: string;
  name: string;
  icon: string;
  defaultCurrencyCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface MultiWorkplaceExportEntry {
  workplace: ExportWorkplaceMetadata;
  workplacePreferences?: WorkplacePreferences;
  data: Record<string, readonly unknown[]>;
}

export interface MultiWorkplaceExportMetadata {
  format: 'full-frills-backup';
  formatVersion: 2;
  exportDate: string;
  exportScope: 'all' | 'selected';
  preferences: UIPreferences;
  workplaces: readonly MultiWorkplaceExportEntry[];
}

/** Legacy eager table shape retained for downstream import compatibility. */
export type ExportTable = readonly [key: string, data: readonly unknown[]];
export type ExportTableSource = readonly [key: string, load: () => Promise<readonly unknown[]>];

/** @deprecated Use serializeExportPayloadFromSources to avoid retaining all tables in memory. */
export async function serializeExportPayload(
  metadata: ExportMetadata,
  tables: readonly ExportTable[],
  onProgress?: (message: string, progress: number) => void,
): Promise<string> {
  return serializeExportPayloadFromSources(
    metadata,
    tables.map(([key, data]) => [key, async () => data] as ExportTableSource),
    onProgress,
  );
}

/** Serialize tables on demand so fetched table arrays do not accumulate. */
export async function serializeExportPayloadFromSources(
  metadata: ExportMetadata,
  tables: readonly ExportTableSource[],
  onProgress?: (message: string, progress: number) => void,
): Promise<string> {
  const tableCount = tables.length;
  const report = (message: string, progress: number) => onProgress?.(message, progress);

  report('Optimizing data structure...', 0);
  await yieldToEventLoop();
  report('Serializing metadata...', tableCount === 0 ? 1 : 0.05);
  await yieldToEventLoop(16);

  const chunks = [JSON.stringify(metadata).slice(0, -1)];
  for (const [index, [key, load]] of tables.entries()) {
    const progress = tableCount === 0 ? 1 : 0.05 + ((index + 1) / tableCount) * 0.95;
    report(`Serializing ${key}...`, progress);
    let data: readonly unknown[] | undefined = await load();
    try {
      await yieldToEventLoop();
      chunks.push(`,${JSON.stringify(key)}:${JSON.stringify(data, exportReplacer)}`);
    } finally {
      data = undefined;
    }
  }

  await yieldToEventLoop(10);
  return `${chunks.join('')}}`;
}

export function serializeMultiWorkplaceExport(
  metadata: MultiWorkplaceExportMetadata,
  onProgress?: (message: string, progress: number) => void,
): string {
  onProgress?.('Serializing multi-workplace backup...', 0.95);
  const result = JSON.stringify(metadata, exportReplacer);
  onProgress?.('Multi-workplace backup serialized.', 1);
  return result;
}

function exportReplacer(field: string, value: unknown): unknown {
  if (field === 'runningBalance' || field === 'originalSmsBody') return undefined;
  return value;
}

function yieldToEventLoop(delayMs = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}
