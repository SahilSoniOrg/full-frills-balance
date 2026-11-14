import { strToU8, unzipSync, zipSync } from 'fflate';
import { fromByteArray } from 'base64-js';
import { logger } from '@/src/services/observability/logger';

import type { CompressionOperations, ZipResult } from '@/src/services/files/compressionContracts';

/**
 * Web Implementation of Unified Compression Utility.
 * Uses fflate because browsers do not provide a general-purpose ZIP API.
 */
export const compression: CompressionOperations = {
  /**
   * Zips a collection of files into a single archive.
   */
  async createZipArchive(
    _name: string,
    filesData: Record<string, string | Uint8Array>,
  ): Promise<ZipResult> {
    const entries = Object.fromEntries(
      Object.entries(filesData).map(([name, content]) => [
        name,
        typeof content === 'string' ? strToU8(content) : content,
      ]),
    );
    const bytes = zipSync(entries);
    const uri = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }));
    return {
      uri,
      base64: fromByteArray(bytes),
      async cleanup() {
        URL.revokeObjectURL(uri);
      },
    };
  },

  /**
   * Unzips an archive and returns the content of the first valid file found.
   */
  async extractFirstFile(
    zipBytes: Uint8Array,
    options: { filterMac?: boolean } = { filterMac: true },
  ): Promise<{ bytes: Uint8Array; name: string } | null> {
    const entries = unzipSync(zipBytes);
    const validEntries = Object.entries(entries).filter(([name, bytes]) => {
      if (!name || name.endsWith('/')) return false;
      if (options.filterMac !== false && name.includes('__MACOSX')) return false;
      return bytes instanceof Uint8Array;
    });
    const entry =
      validEntries.find(([name]) => name.toLowerCase().endsWith('.json')) ?? validEntries[0];

    if (!entry) return null;

    const [name, bytes] = entry;
    logger.debug(`[Compression.web] Extracted ZIP entry`, { name });
    return { name, bytes };
  },
};
