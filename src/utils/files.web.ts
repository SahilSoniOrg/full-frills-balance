import { logger } from './logger';

/**
 * Web Implementation of Unified File System Utility
 * Mocks or stubs native filesystem operations for the browser.
 */
export const files = {
  /**
   * Writes content to a destination.
   * On web, this is usually a no-op unless we want to trigger a download.
   */
  async writeContent(
    pathOrUri: string,
    _content: string | Uint8Array,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<string> {
    logger.debug(`[Files.web] writeContent (mock)`, { pathOrUri, encoding });
    return pathOrUri;
  },

  /**
   * Reads a file as base64 string.
   */
  async readBase64(uri: string): Promise<string> {
    logger.debug(`[Files.web] readBase64 (mock)`, { uri });
    return '';
  },

  /**
   * Reads a file as Uint8Array bytes.
   */
  async readBytes(uri: string): Promise<Uint8Array> {
    logger.debug(`[Files.web] readBytes (mock)`, { uri });
    return new Uint8Array(0);
  },

  /**
   * Lists contents of a directory.
   */
  async listDirectory(uri: string): Promise<any[]> {
    logger.debug(`[Files.web] listDirectory (mock)`, { uri });
    return [];
  },

  /**
   * Safely deletes a file if it exists.
   */
  async deleteFile(uri: string): Promise<void> {
    logger.debug(`[Files.web] deleteFile (mock)`, { uri });
  },

  /**
   * Safely deletes a directory and all its contents.
   */
  async deleteDirectory(uri: string): Promise<void> {
    logger.debug(`[Files.web] deleteDirectory (mock)`, { uri });
  },

  /**
   * Ensures a directory exists.
   */
  async ensureDirectory(uri: string): Promise<void> {
    logger.debug(`[Files.web] ensureDirectory (mock)`, { uri });
  },

  /**
   * Checks if a file or directory exists.
   */
  async exists(_uri: string): Promise<boolean> {
    return false;
  },

  /**
   * Copies a file or directory.
   */
  async copy(from: string, to: string): Promise<void> {
    logger.debug(`[Files.web] copy (mock)`, { from, to });
  },

  /**
   * Returns metadata for a path.
   */
  async getInfo(_uri: string): Promise<any> {
    return { exists: false, isDirectory: false };
  },

  /**
   * Root directories - mocked for web
   */
  get cache() {
    return 'cache://';
  },
  get document() {
    return 'document://';
  },
  get bundle() {
    return 'bundle://';
  },
};
