/**
 * Import Orchestrator
 *
 * Shared logic for file reading, ZIP extraction, and encoding detection.
 * Platform-agnostic utilities used by the import hook.
 */

import { compression } from '@/src/utils/compression';
import { files } from '@/src/utils/files';
import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';

/**
 * Decode Uint8Array as UTF-16BE (Strict BE as per Ivy Wallet format).
 * Reference: ivyWalletLink/createCategoryAccountsInBackup.js
 */
function decodeUTF16Bytes(bytes: Uint8Array): string {
  // Strip BOM for UTF-16BE (0xFE 0xFF) if present
  let start = 0;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    start = 2;
  }

  // Manual BE Decode (High Byte First)
  let str = '';

  for (let i = start; i < bytes.length; i += 2) {
    const high = bytes[i];
    const low = bytes[i + 1];
    if (low === undefined) break;

    const codePoint = (high << 8) | low;
    str += String.fromCharCode(codePoint);
  }

  return str;
}

/**
 * Check if bytes represent a ZIP file (magic bytes: PK\x03\x04).
 */
function isZipFile(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Read a file from the given URI as raw bytes.
 * Handles platform differences between web and native.
 */
export async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } else {
      return files.readBytes(uri);
    }
  } catch (error) {
    logger.error('[ImportOrchestrator] Failed to read file', error);
    throw new Error('Could not read file from device.');
  }
}

/**
 * Extract content from a ZIP archive.
 * Expects a single valid file inside (ignores __MACOSX metadata).
 * Returns the raw bytes if input is not a ZIP.
 */
export async function extractIfZip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isZipFile(bytes)) {
    return bytes;
  }

  logger.info('[ImportOrchestrator] Detected ZIP file, extracting...');
  // Check for ZIP magic number 'PK' (0x50, 0x4B)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    logger.info('[ImportOrchestrator] Not a ZIP file, processing as raw content');
    return bytes;
  }

  try {
    const extracted = await compression.extractFirstFile(bytes);

    if (!extracted) {
      logger.warn('[ImportOrchestrator] No valid files in ZIP, falling back to raw bytes');
      return bytes;
    }

    logger.info(`[ImportOrchestrator] Extracting: ${extracted.name}`);
    return extracted.bytes;
  } catch (error) {
    logger.error('[ImportOrchestrator] ZIP extraction failed, falling back to raw content', error);
    return bytes;
  }
}

/**
 * Decode raw bytes to string content.
 * Tries UTF-8 first, falls back to UTF-16BE for Ivy Wallet files.
 */
export function decodeContent(bytes: Uint8Array): string {
  try {
    // Try UTF-8 first (fast path for standard JSON)
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const content = utf8Decoder.decode(bytes);

    // Basic check if it looks like JSON
    if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
      throw new Error('Likely encoding issue (not UTF-8)');
    }

    return content;
  } catch {
    logger.info('[ImportOrchestrator] UTF-8 failed, trying UTF-16BE...');
    try {
      return decodeUTF16Bytes(bytes);
    } catch (decodeErr) {
      logger.error('[ImportOrchestrator] UTF-16BE decode failed', decodeErr);
      throw new Error('Unknown file encoding.');
    }
  }
}

/**
 * Sanitize JSON content by removing BOM and other artifacts.
 */
export function sanitizeContent(content: string): string {
  return content.replace(/^\uFEFF/, '');
}
