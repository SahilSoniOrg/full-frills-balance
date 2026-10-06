import type { UIPreferences } from '@/src/services/preferences/types';
import type { WorkplacePreferences } from '@/src/services/preferences/workplaceTypes';
import { hashSmsMetadataFingerprints } from '@/src/utils/smsPrivateMetadata';

export type ExportWorkplaceMetadata = {
  id: string;
  name: string;
  icon: string;
  defaultCurrencyCode: string;
  createdAt: string;
  updatedAt: string;
};

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
  if (field === 'runningBalance') return undefined;
  if (field === 'metadataJson' && typeof value === 'string')
    return hashSmsMetadataFingerprints(value);
  return value;
}
