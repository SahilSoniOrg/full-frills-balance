import { confirm, toast } from '@/src/utils/alerts';
import { bytesToBase64 } from '@/src/utils/serialization';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { files } from '../utils/files';
import { logger } from '../utils/logger';

import { analytics } from './analytics';

import { ShareFormat } from '@/src/types/sharing';

export { ShareFormat };

export interface ShareProvider {
  id: string;
  title: string;
  filename: string;
  mimeType?: string;
  fileExtension?: string;
  supportedFormats?: ShareFormat[];
  getContent(format: ShareFormat): string | Uint8Array | Promise<string | Uint8Array>;
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
    const { content, filename, mimeType, effectiveFormat, now } = await this.prepareContent(
      provider,
      format,
    );

    this.track('share_started', provider, {
      requested_format: format,
      effective_format: effectiveFormat,
      content_size: content.length,
    });

    try {
      if (Platform.OS === 'web') {
        this.downloadAsFileWeb(content, filename, mimeType);
        this.track('share_sheet_opened', provider, { format, mode: 'web' });
        return;
      }

      // Tier 1: Practical cleanup (run before new share)
      await this.cleanupOldFiles();

      // Native sharing logic
      const isLargeContent = content.length > MAX_INLINE_SHARE;
      const forceFileSharing = effectiveFormat !== ShareFormat.TEXT || isLargeContent;

      if (forceFileSharing) {
        if (await Sharing.isAvailableAsync()) {
          const encoding = effectiveFormat === ShareFormat.ZIP ? 'base64' : 'utf8';
          const fileUri = await this.writeToFile(content, filename, encoding);
          this.pendingFiles.push({ uri: fileUri, createdAt: now });

          await Sharing.shareAsync(fileUri, {
            mimeType,
            dialogTitle: provider.title,
          });

          this.track('share_sheet_opened', provider, {
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
      this.track('share_sheet_opened', provider, {
        format: effectiveFormat,
        mode: 'text',
      });
    } catch (error) {
      logger.error(
        `[SharingService] Failed to share provider ${provider.id} in ${effectiveFormat} format`,
        error,
      );
      this.track('share_failed', provider, {
        requested_format: format,
        effective_format: effectiveFormat,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generic save method that accepts a ShareProvider.
   * Prompts user for location on Android, shares with save hint on iOS.
   */
  async save(
    provider: ShareProvider,
    format: ShareFormat = ShareFormat.TEXT,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<void> {
    const { content, filename, mimeType, effectiveFormat } = await this.prepareContent(
      provider,
      format,
    );

    this.track('save_started', provider, {
      requested_format: format,
      effective_format: effectiveFormat,
      content_size: content.length,
    });

    try {
      if (Platform.OS === 'web') {
        this.downloadAsFileWeb(content, filename, mimeType);
        return;
      }

      const encoding = effectiveFormat === ShareFormat.ZIP ? 'base64' : 'utf8';
      const base64Content = typeof content === 'string' ? content : bytesToBase64(content);

      // Tier 1: Save to app's persistent storage (internal backup)
      onProgress?.('Creating local backup...', 0.92);
      const sanitizedBase = files.document.endsWith('/')
        ? files.document.slice(0, -1)
        : files.document;
      const fileUri = `${sanitizedBase}/${filename}`;
      await files.writeContent(fileUri, base64Content, encoding === 'base64' ? 'base64' : 'utf8');

      // Tier 2: iOS - Open Share Sheet immediately (provides 'Save to Files')
      if (Platform.OS === 'ios') {
        onProgress?.('Opening share sheet...', 0.98);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType,
            dialogTitle: provider.title,
          });
          onProgress?.('Backup complete!', 1.0);
          this.track('save_to_disk_completed', provider, { platform: 'ios' });
        } else {
          toast.error('Sharing not available on this device');
        }
        return; // iOS flow ends here
      }

      // Tier 2: Android - Use Storage Access Framework for user-controlled location
      if (Platform.OS === 'android') {
        onProgress?.('Waiting for folder selection...', 0.94);
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          onProgress?.('Writing to destination...', 0.97);
          const fileLocation = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            mimeType,
          );
          await files.writeContent(
            fileLocation,
            base64Content,
            encoding === 'base64' ? 'base64' : 'utf8',
          );
          onProgress?.('Backup complete!', 1.0);
          toast.success('File saved successfully');
          this.track('save_to_disk_completed', provider, { platform: 'android' });
        } else {
          this.track('save_to_disk_abandoned', provider, { platform: 'android' });
          confirm.show({
            title: 'Save Cancelled',
            message:
              "You didn't select a folder. Would you like to try saving again or just share the file?",
            confirmText: 'Try Again',
            cancelText: 'Share File',
            onConfirm: () => this.save(provider, format),
            onCancel: () => this.share(provider, format),
            onClose: () => {
              this.track('save_to_disk_cancelled_final', provider);
            },
          });
          return; // Prevent showing the final "Ready" dialog since nothing was saved
        }
      }

      // Tier 3: Android Confirmation (Share or Finish)
      if (Platform.OS === 'android') {
        confirm.show({
          title: provider.title + ' Ready',
          message: 'Your file has been saved. Would you like to share or upload it now?',
          confirmText: 'Share File',
          cancelText: 'Just Save',
          onConfirm: async () => {
            this.track('save_confirm_share', provider);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, {
                mimeType,
                dialogTitle: provider.title,
              });
            }
          },
          onCancel: () => {
            this.track('save_confirm_dismiss', provider);
          },
        });
      }

      this.track('save_completed', provider, { format: effectiveFormat });
    } catch (error) {
      logger.error(`[SharingService] Failed to save provider ${provider.id}`, error);
      confirm.show({
        title: 'Save Failed',
        message:
          'There was an error saving the file to your device. Would you like to share it instead?',
        confirmText: 'Share File',
        cancelText: 'Cancel',
        onConfirm: () => this.share(provider, format),
        onClose: () => {
          this.track('save_failed_dismissed', provider);
        },
      });
      throw error;
    }
  }

  private track(event: string, provider: ShareProvider, extra: Record<string, any> = {}) {
    analytics.track(event, {
      provider: provider.id,
      ...extra,
    });
  }

  private async prepareContent(provider: ShareProvider, format: ShareFormat) {
    let effectiveFormat = format;
    if (provider.supportedFormats && !provider.supportedFormats.includes(effectiveFormat)) {
      effectiveFormat = provider.supportedFormats.includes(ShareFormat.TEXT)
        ? ShareFormat.TEXT
        : provider.supportedFormats[0] || ShareFormat.TEXT;
    }

    const rawContent = await provider.getContent(effectiveFormat);
    if (rawContent === undefined || rawContent === null) {
      throw new Error('Nothing to share/save');
    }

    // Convert to base64 if it's a binary array
    // We use a separate variable to ensure rawContent can be GC'd if it's a large Uint8Array
    const finalContent = typeof rawContent === 'string' ? rawContent : bytesToBase64(rawContent);

    const now = Date.now();
    const randomSuffix = now.toString(36) + Math.random().toString(36).slice(2, 6);
    const fileExtension = provider.fileExtension || this.getFileExtension(effectiveFormat);
    const filename = `${provider.filename}-${randomSuffix}.${fileExtension}`;
    const mimeType = provider.mimeType || this.getMimeType(effectiveFormat);

    return { content: finalContent, filename, mimeType, effectiveFormat, now };
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
      files.deleteFile(file.uri);
    }
  }

  private async writeToFile(
    content: string,
    filename: string,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<string> {
    return files.writeContent(filename, content, encoding);
  }

  private getMimeType(format: ShareFormat): string {
    switch (format) {
      case ShareFormat.CSV:
        return 'text/csv';
      case ShareFormat.MARKDOWN:
        return 'text/markdown';
      case ShareFormat.ZIP:
        return 'application/zip';
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
      case ShareFormat.ZIP:
        return 'zip';
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
