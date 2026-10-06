import { CANONICAL_IMPORT_VERSION_V1 } from '@/src/types/importContracts';
import type {
  BatchImportData,
  CanonicalImport,
  CanonicalImportMetadata,
  CanonicalImportV1,
} from '@/src/types/importContracts';

export function batchImportDataFromCanonical(canonical: CanonicalImport): BatchImportData {
  const { version, ...data } = canonical;
  if (version !== CANONICAL_IMPORT_VERSION_V1) {
    throw new Error(`Unsupported canonical import version: ${version}`);
  }
  return data;
}

export function canonicalImportFromBatchImportData(
  data: BatchImportData,
  options: {
    sourceFormatVersion?: string;
    importMetadata?: CanonicalImportMetadata;
  } = {},
): CanonicalImportV1 {
  return {
    ...data,
    version: CANONICAL_IMPORT_VERSION_V1,
    sourceFormatVersion: options.sourceFormatVersion ?? data.sourceFormatVersion,
    importMetadata: options.importMetadata ?? data.importMetadata,
  };
}
