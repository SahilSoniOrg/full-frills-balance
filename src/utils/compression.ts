import { unzip, zip } from 'react-native-zip-archive';
import { files } from './files';
import { logger } from './logger';

export interface ZipResult {
  uri: string;
  base64: string;
  cleanup: () => void;
}

/**
 * Unified Compression Utility
 * Handles native ZIP operations using the underlying files service.
 */
export const compression = {
  /**
   * Zips a collection of files into a single archive.
   * Handles temp directory creation, file writing, zipping, and cleanup.
   */
  async createZipArchive(
    name: string,
    filesData: Record<string, string | Uint8Array>,
  ): Promise<ZipResult> {
    const timestamp = Date.now();
    const tempDirUri = `${files.cache}zip_${name}_${timestamp}/`;
    const zipUri = `${files.cache}archive_${name}_${timestamp}.zip`;

    try {
      // 1. Setup temp directory
      await files.ensureDirectory(tempDirUri);

      // 2. Write files to temp directory
      for (const [filename, content] of Object.entries(filesData)) {
        const fileUri = `${tempDirUri}${filename}`;
        await files.writeContent(fileUri, content);
      }

      // 3. Perform native compression
      await zip(tempDirUri, zipUri);

      // 4. Read result
      const b64 = await files.readBase64(zipUri);

      return {
        uri: zipUri,
        base64: b64,
        cleanup: () => {
          files.deleteDirectory(tempDirUri);
          files.deleteFile(zipUri);
        },
      };
    } catch (error) {
      // Immediate cleanup on failure
      files.deleteDirectory(tempDirUri);
      files.deleteFile(zipUri);
      logger.error('[Compression] ZIP creation failed', error);
      throw error;
    }
  },

  /**
   * Unzips an archive and returns the content of the first valid file found.
   */
  async extractFirstFile(
    zipBytes: Uint8Array,
    options: { filterMac?: boolean } = { filterMac: true },
  ): Promise<{ bytes: Uint8Array; name: string } | null> {
    const timestamp = Date.now();
    const tempDirUri = `${files.cache}unzip_${timestamp}/`;
    const zipUri = `${files.cache}temp_${timestamp}.zip`;

    try {
      // 1. Write bytes to temp zip
      await files.writeContent(zipUri, zipBytes);

      // 2. Ensure temp directory exists
      await files.ensureDirectory(tempDirUri);

      // 3. Extract natively
      await unzip(zipUri, tempDirUri);

      // 4. List and find valid file
      const contents = await files.listDirectory(tempDirUri);
      const validFile = contents.find(
        f =>
          f.name && // Check if it's a file with a name property
          (!options.filterMac || !f.name.includes('__MACOSX')),
      );

      if (!validFile) return null;

      const bytes = await files.readBytes(validFile.uri);
      const name = validFile.name;

      return {
        bytes,
        name,
      };
    } finally {
      // Cleanup
      files.deleteDirectory(tempDirUri);
      files.deleteFile(zipUri);
    }
  },
};
