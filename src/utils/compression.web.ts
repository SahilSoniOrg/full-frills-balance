import { logger } from './logger';

export interface ZipResult {
  uri: string;
  base64: string;
  cleanup: () => void;
}

/**
 * Web Implementation of Unified Compression Utility
 * Mocks native ZIP operations for the browser.
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
    _zipBytes: Uint8Array,
    _options: { filterMac?: boolean } = { filterMac: true },
  ): Promise<{ bytes: Uint8Array; name: string } | null> {
    logger.debug(`[Compression.web] extractFirstFile (mock)`);
    return null;
  },
};
