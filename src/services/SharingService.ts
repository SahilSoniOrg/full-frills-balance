import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { logger } from '../utils/logger';
import { toast } from '@/src/utils/alerts';

import { analytics } from './analytics-service';

import { ShareFormat } from '@/src/types/sharing';

export { ShareFormat };

export interface ShareProvider {
  id: string;
  title: string;
  filename: string;
  mimeType?: string;
  fileExtension?: string;
  supportedFormats?: ShareFormat[];
  getContent(format: ShareFormat): string;
}

const MAX_INLINE_SHARE = 50_000; // ~50KB characters (WhatsApp truncation guard)

class SharingService {
  private pendingFiles: { uri: string; createdAt: number }[] = [];

  /**
   * Initialize the sharing service.
   * Performs startup maintenance like cleaning up stale cache files.
   */
  async init(): Promise<void> {
    await this.cleanupOldFiles();
  }

  /**
   * Generic share method that accepts a ShareProvider.
   * Handles platform-specific delivery logic.
   */
  async share(provider: ShareProvider, format: ShareFormat = ShareFormat.TEXT): Promise<void> {
    let fallback_used = false;
    let effectiveFormat = format;
    if (provider.supportedFormats && !provider.supportedFormats.includes(effectiveFormat)) {
      logger.warn(
        `[SharingService] Provider ${provider.id} does not support format ${format}, falling back`,
      );
      effectiveFormat = provider.supportedFormats.includes(ShareFormat.TEXT)
        ? ShareFormat.TEXT
        : provider.supportedFormats[0] || ShareFormat.TEXT;
      fallback_used = true;
      toast.info(`${format} export unsupported here, sharing as ${effectiveFormat} instead.`);
    }

    const content = provider.getContent(effectiveFormat);
    if (!content) {
      const msg = `[SharingService] Provider ${provider.id} returned empty content for ${effectiveFormat}`;
      logger.warn(msg);
      throw new Error('Nothing to share');
    }

    const now = Date.now();
    const randomSuffix = now.toString(36) + Math.random().toString(36).slice(2, 6);
    const fileExtension = provider.fileExtension || this.getFileExtension(effectiveFormat);
    const filename = `${provider.filename}-${randomSuffix}.${fileExtension}`;
    const mimeType = provider.mimeType || this.getMimeType(effectiveFormat);

    analytics.track('share_started', {
      provider: provider.id,
      requested_format: format,
      effective_format: effectiveFormat,
      fallback_used,
      content_size: content.length,
    });

    try {
      if (Platform.OS === 'web') {
        this.downloadAsFileWeb(content, filename, mimeType);
        analytics.track('share_sheet_opened', { provider: provider.id, format, mode: 'web' });
        return;
      }

      // Tier 1: Practical cleanup (run before new share)
      await this.cleanupOldFiles();

      // Native sharing logic
      const isLargeContent = content.length > MAX_INLINE_SHARE;
      const forceFileSharing = effectiveFormat !== ShareFormat.TEXT || isLargeContent;

      if (forceFileSharing) {
        if (await Sharing.isAvailableAsync()) {
          const fileUri = await this.writeToFile(content, filename);
          this.pendingFiles.push({ uri: fileUri, createdAt: now });

          await Sharing.shareAsync(fileUri, {
            mimeType,
            dialogTitle: provider.title,
          });

          analytics.track('share_sheet_opened', {
            provider: provider.id,
            format: effectiveFormat,
            mode: 'file',
          });
          return;
        } else {
          logger.warn(
            `[SharingService] File sharing requested/needed for ${provider.id} but Sharing.isAvailableAsync is false. Falling back to Share.share (truncation risk).`,
          );
        }
      }

      // Fallback or small text sharing
      await Share.share({
        message: content,
        title: provider.title,
      });
      analytics.track('share_sheet_opened', {
        provider: provider.id,
        format: effectiveFormat,
        mode: 'text',
      });
    } catch (error) {
      logger.error(
        `[SharingService] Failed to share provider ${provider.id} in ${effectiveFormat} format`,
        error,
      );
      analytics.track('share_failed', {
        provider: provider.id,
        requested_format: format,
        effective_format: effectiveFormat,
        fallback_used,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async cleanupOldFiles(): Promise<void> {
    const now = Date.now();
    const SIXTY_SECONDS_MS = 60_000;

    // Split files into those to delete and those to keep
    const toDelete: typeof this.pendingFiles = [];
    const toKeep: typeof this.pendingFiles = [];

    for (const file of this.pendingFiles) {
      if (now - file.createdAt > SIXTY_SECONDS_MS) {
        toDelete.push(file);
      } else {
        toKeep.push(file);
      }
    }

    this.pendingFiles = toKeep;

    for (const file of toDelete) {
      try {
        const fileObj = new File(file.uri);
        if (fileObj.exists) {
          // In Expo SDK 54+, file operations are synchronous via JSI
          fileObj.delete();
        }
      } catch (err) {
        logger.debug(`[SharingService] Failed to cleanup ${file.uri}`, err as any);
      }
    }
  }

  private async writeToFile(content: string, filename: string): Promise<string> {
    const cacheDir = Paths.cache;

    if (!cacheDir) {
      throw new Error('[SharingService] No cache directory available for file creation');
    }

    // In Expo SDK 54+, you construct a File and act on it
    const file = new File(cacheDir, filename);

    file.write(content, { encoding: 'utf8' });

    return file.uri;
  }

  private getMimeType(format: ShareFormat): string {
    switch (format) {
      case ShareFormat.CSV:
        return 'text/csv';
      case ShareFormat.MARKDOWN:
        return 'text/markdown';
      case ShareFormat.TEXT:
      default:
        return 'text/plain';
    }
  }

  private getFileExtension(format: ShareFormat): string {
    switch (format) {
      case ShareFormat.CSV:
        return 'csv';
      case ShareFormat.MARKDOWN:
        return 'md';
      case ShareFormat.TEXT:
      default:
        return 'txt';
    }
  }

  private downloadAsFileWeb(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const sharingService = new SharingService();
