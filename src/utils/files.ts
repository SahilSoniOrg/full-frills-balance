import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { logger } from './logger';

/**
 * Unified File System Utility
 * Consolidates common Expo SDK 54 File/Directory operations.
 */
export const files = {
  /**
   * Writes content to a destination (file path or content URI).
   * Automatically handles 'file://' vs 'content://' semantics.
   */
  async writeContent(
    pathOrUri: string,
    content: string | Uint8Array,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<string> {
    try {
      if (!pathOrUri) {
        throw new Error('Path or URI cannot be empty');
      }

      // 1. Handle Android SAF (content://) URIs
      if (pathOrUri.startsWith('content://')) {
        let safeContent = content;
        let safeEncoding = encoding;

        // SAF via FileSystemLegacy requires strings.
        // If we have raw bytes, we must convert to base64.
        if (content instanceof Uint8Array) {
          const { bytesToBase64 } = require('./serialization');
          safeContent = bytesToBase64(content);
          safeEncoding = 'base64';
        }

        await FileSystemLegacy.writeAsStringAsync(pathOrUri, safeContent as string, {
          encoding: safeEncoding,
        });
        return pathOrUri;
      }

      // 2. Handle standard filesystem paths
      const isAbsolute = /^(file:\/\/|\/)/.test(pathOrUri);
      let uri = pathOrUri;
      if (isAbsolute) {
        if (pathOrUri.startsWith('/')) {
          uri = `file://${pathOrUri}`;
        }
      } else {
        uri = `${Paths.cache.uri}${pathOrUri}`;
      }

      logger.debug(`[Files] writeContent preparation`, {
        input: pathOrUri.substring(0, 100),
        resolvedUri: uri,
        contentType: typeof content,
        contentLength: content?.length,
        encoding,
      });

      if (content === null || content === undefined) {
        throw new Error('Content cannot be null or undefined');
      }

      const file = new File(uri);
      file.write(content, { encoding });
      return file.uri;
    } catch (error) {
      logger.error(`[Files] Failed to write content to: ${pathOrUri}`, error);
      throw error;
    }
  },

  /**
   * Reads a file as base64 string.
   */
  async readBase64(uri: string): Promise<string> {
    try {
      return new File(uri).base64Sync();
    } catch (error) {
      logger.error(`[Files] Failed to read base64: ${uri}`, error);
      throw error;
    }
  },

  /**
   * Reads a file as Uint8Array bytes.
   */
  async readBytes(uri: string): Promise<Uint8Array> {
    try {
      const bytes = new File(uri).bytesSync();
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch (error) {
      logger.error(`[Files] Failed to read bytes: ${uri}`, error);
      throw error;
    }
  },

  /**
   * Lists contents of a directory.
   */
  async listDirectory(uri: string): Promise<any[]> {
    try {
      return new Directory(uri).list();
    } catch (error) {
      logger.error(`[Files] Failed to list directory: ${uri}`, error);
      throw error;
    }
  },

  /**
   * Safely deletes a file if it exists.
   */
  async deleteFile(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      // Idempotent delete: don't throw if file is already gone or locked
      logger.warn(`[Files] Delete failed for ${uri}`, { error });
    }
  },

  /**
   * Safely deletes a directory and all its contents.
   */
  async deleteDirectory(uri: string): Promise<void> {
    try {
      const dir = new Directory(uri);
      if (dir.exists) {
        dir.delete();
      }
    } catch (error) {
      logger.warn(`[Files] Directory delete failed for ${uri}`, { error });
    }
  },

  /**
   * Ensures a directory exists, creating intermediates if necessary.
   */
  async ensureDirectory(uri: string): Promise<void> {
    try {
      const dir = new Directory(uri);
      dir.create({ intermediates: true, idempotent: true });
    } catch (error) {
      logger.error(`[Files] Failed to ensure directory: ${uri}`, error);
      throw error;
    }
  },

  /**
   * Checks if a file or directory exists.
   */
  async exists(uri: string): Promise<boolean> {
    try {
      const file = new File(uri);
      return file.exists;
    } catch {
      return false;
    }
  },

  /**
   * Copies a file or directory.
   */
  async copy(from: string, to: string): Promise<void> {
    try {
      // Legacy API still handles cross-directory copies better in some edge cases
      await FileSystemLegacy.copyAsync({ from, to });
    } catch (error) {
      logger.error(`[Files] Failed to copy from ${from} to ${to}`, error);
      throw error;
    }
  },

  /**
   * Returns metadata for a path.
   */
  async getInfo(uri: string): Promise<any> {
    return FileSystemLegacy.getInfoAsync(uri);
  },

  /**
   * Root directories
   */
  get cache() {
    return Paths.cache?.uri || '';
  },
  get document() {
    return Paths.document?.uri || '';
  },
  get bundle() {
    return Paths.bundle?.uri || '';
  },
};
