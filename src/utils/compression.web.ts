import { unzipSync } from 'fflate';
import { logger } from './logger';

export interface ZipResult {
  uri: string;
  base64: string;
  cleanup: () => void;
}

/**
 * Web Implementation of Unified Compression Utility.
 * Uses fflate because browsers do not provide a general-purpose ZIP API.
 */
export const compression = {
  /**
   * Zips a collection of files into a single archive.
   */
  async createZipArchive(
    name: string,
    _filesData: Record<string, string | Uint8Array>,
  ): Promise<ZipResult> {
    logger.debug(`[Compression.web] createZipArchive (mock)`, { name });
    return {
      uri: `mock://zip/${name}.zip`,
      base64: '',
      cleanup: () => {},
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
    const entry = Object.entries(entries).find(([name, bytes]) => {
      if (!name || name.endsWith('/')) return false;
      if (options.filterMac !== false && name.includes('__MACOSX')) return false;
      return bytes instanceof Uint8Array;
    });

    if (!entry) return null;

    const [name, bytes] = entry;
    logger.debug(`[Compression.web] Extracted ZIP entry`, { name });
    return { name, bytes };
  },
};
