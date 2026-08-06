import type { UIPreferences } from '@/src/utils/preferences/types';

export interface ExportMetadata {
  exportDate: string;
  version: string;
  schemaVersion: number;
  preferences: UIPreferences;
  workplace?: {
    id: string;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
    createdAt: string;
    updatedAt: string;
  };
}

export type ExportTable = readonly [key: string, data: readonly unknown[]];

/** Serializes backup format independently from database/table acquisition. */
export async function serializeExportPayload(
  metadata: ExportMetadata,
  tables: readonly ExportTable[],
  onProgress?: (message: string, progress: number) => void,
): Promise<string> {
  const tableCount = tables.length;
  const report = (message: string, progress: number) => onProgress?.(message, progress);

  report('Optimizing data structure...', 0);
  await yieldToEventLoop();
  report('Serializing metadata...', tableCount === 0 ? 1 : 0.05);
  await yieldToEventLoop(16);

  const chunks = [JSON.stringify(metadata).slice(0, -1)];
  for (const [index, [key, data]] of tables.entries()) {
    const progress = tableCount === 0 ? 1 : 0.05 + ((index + 1) / tableCount) * 0.95;
    report(`Serializing ${key}...`, progress);
    await yieldToEventLoop();
    const chunk = JSON.stringify(data, (field, value) => {
      if (field === 'runningBalance' || field === 'originalSmsBody') return undefined;
      return value;
    });
    chunks.push(`,${JSON.stringify(key)}:${chunk}`);
  }

  await yieldToEventLoop(10);
  return `${chunks.join('')}}`;
}

function yieldToEventLoop(delayMs = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}
