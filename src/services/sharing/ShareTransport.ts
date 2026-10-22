import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { confirm } from '@/src/utils/alerts';
import { files } from '@/src/utils/files';
import { analytics } from '@/src/services/analytics';
import {
  ShareFormat,
  type ShareArtifact,
  type ShareOutcome,
  type ShareRequest,
  type Shareable,
  type ShareWritable,
} from '@/src/types/sharing';
import type { ShareDeliveryContext, ShareTransport } from './SharingRuntime';

export class FileSharingUnavailableError extends Error {
  constructor() {
    super('File sharing is unavailable on this device');
    this.name = 'FileSharingUnavailableError';
  }
}

const FORMATS = {
  [ShareFormat.TEXT]: { extension: 'txt', mime: 'text/plain' },
  [ShareFormat.CSV]: { extension: 'csv', mime: 'text/csv' },
  [ShareFormat.MARKDOWN]: { extension: 'md', mime: 'text/markdown' },
  [ShareFormat.ZIP]: { extension: 'zip', mime: 'application/zip' },
};

type BrowserWriter = {
  write(content: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<BrowserWriter> }>;
};

function metadata(source: Shareable, artifact: ShareArtifact | undefined, format: ShareFormat) {
  const extension = artifact?.fileExtension ?? source.fileExtension ?? FORMATS[format].extension;
  const base = (artifact?.filename ?? source.filename).replace(/[\\/]/g, '-');
  return {
    filename: `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${extension}`,
    mimeType: artifact?.mimeType ?? source.mimeType ?? FORMATS[format].mime,
    extension,
  };
}

function ask(options: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}): Promise<'confirm' | 'cancel' | 'close'> {
  return new Promise(resolve =>
    confirm.show({
      ...options,
      onConfirm: () => resolve('confirm'),
      onCancel: () => resolve('cancel'),
      onClose: () => resolve('close'),
    }),
  );
}

/** Platform delivery only. All retries stay inside the runtime's current operation. */
export class PlatformShareTransport implements ShareTransport {
  private retained = new Map<string, { createdAt: number; cleanup: () => void | Promise<void> }>();

  async init() {
    const now = Date.now();
    for (const [uri, entry] of this.retained) {
      if (now - entry.createdAt < 60_000) continue;
      this.retained.delete(uri);
      try {
        await entry.cleanup();
      } catch {
        /* Best-effort cache maintenance. */
      }
    }
  }

  retain(artifact: ShareArtifact) {
    if (artifact.kind !== 'file') return;
    this.retained.set(artifact.uri, {
      createdAt: Date.now(),
      cleanup: artifact.cleanup ?? (() => files.deleteFile(artifact.uri)),
    });
  }

  reserveDestination(
    source: Shareable,
    request: ShareRequest,
    context: ShareDeliveryContext,
  ): Promise<ShareWritable | undefined> {
    if (Platform.OS !== 'web' || !source.preferStreaming) return Promise.resolve(undefined);
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!picker) return Promise.resolve(undefined);
    const meta = metadata(source, undefined, request.format);
    // present invokes picker synchronously, before the first await in the runtime.
    return context.present('selecting-destination', async () => {
      const handle = await picker.call(window, {
        suggestedName: meta.filename,
        types: [{ description: source.title, accept: { [meta.mimeType]: [`.${meta.extension}`] } }],
      });
      return handle.createWritable();
    });
  }

  async deliver(
    source: Shareable,
    artifact: ShareArtifact,
    request: ShareRequest,
    context: ShareDeliveryContext,
  ): Promise<ShareOutcome> {
    const meta = metadata(source, artifact, request.format);
    analytics.track(request.action === 'save' ? 'save_started' : 'share_started', {
      provider: source.id,
      requested_format: request.format,
      effective_format: request.format,
    });
    context.ensureActive();
    if (artifact.kind === 'destination') {
      if (!context.destination) throw new Error('The export destination is unavailable');
      await context.destination.close();
      return { kind: 'saved' };
    }
    if (Platform.OS === 'web') {
      if (artifact.kind === 'file')
        throw new Error('A local native file cannot be downloaded in the browser');
      let blob: Blob;
      if (artifact.kind === 'blob') {
        blob = artifact.content;
      } else {
        const content =
          artifact.kind === 'base64'
            ? Uint8Array.from(atob(artifact.content), char => char.charCodeAt(0))
            : artifact.content;
        blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], {
          type: meta.mimeType,
        });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = meta.filename;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // Give the browser time to consume the download URL.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return { kind: 'handed-off' };
    }
    if (artifact.kind === 'blob') throw new Error('Browser blobs cannot be shared on native');

    await this.init();
    context.ensureActive();
    if (
      request.action === 'share' &&
      artifact.kind === 'text' &&
      request.format === ShareFormat.TEXT &&
      !source.requireFile &&
      artifact.content.length <= 50_000
    ) {
      const result = await context.present('delivering', () =>
        Share.share({ message: artifact.content, title: source.title }),
      );
      return { kind: result.action === Share.dismissedAction ? 'cancelled' : 'handed-off' };
    }

    let temporaryUri: string | undefined;
    let keepTemporaryFile = false;
    try {
      const uri =
        artifact.kind === 'file'
          ? artifact.uri
          : await files.writeContent(
              request.action === 'save'
                ? `${files.document.replace(/\/$/, '')}/${meta.filename}`
                : meta.filename,
              artifact.content,
              artifact.kind === 'base64' ? 'base64' : 'utf8',
            );
      if (artifact.kind !== 'file') temporaryUri = uri;
      context.ensureActive();

      const shareFile = async (): Promise<ShareOutcome> => {
        if (!(await Sharing.isAvailableAsync())) throw new FileSharingUnavailableError();
        await context.present('delivering', () =>
          Sharing.shareAsync(uri, { mimeType: meta.mimeType, dialogTitle: source.title }),
        );
        keepTemporaryFile = true;
        analytics.track('share_sheet_opened', {
          provider: source.id,
          format: request.format,
          mode: 'file',
        });
        return { kind: 'handed-off' };
      };
      if (request.action === 'share' || Platform.OS === 'ios') return await shareFile();

      // Android save, including retry and optional follow-up share, is one awaited operation.
      while (true) {
        context.ensureActive();
        try {
          if (await this.saveAndroidFile(artifact, uri, meta, context)) break;
        } catch (error) {
          context.ensureActive();
          const choice = await context.present('awaiting-user', () =>
            ask({
              title: 'Save Failed',
              message:
                'There was an error saving the file to your device. Would you like to share it instead?',
              confirmText: 'Share File',
              cancelText: 'Cancel',
            }),
          );
          if (choice === 'confirm') return await shareFile();
          throw error;
        }

        const choice = await context.present('awaiting-user', () =>
          ask({
            title: 'Save Cancelled',
            message:
              "You didn't select a folder. Would you like to try saving again or just share the file?",
            confirmText: 'Try Again',
            cancelText: 'Share File',
          }),
        );
        if (choice === 'confirm') continue;
        return choice === 'cancel' ? await shareFile() : { kind: 'cancelled' };
      }

      // The destination is committed. Optional follow-up failures cannot undo the save.
      try {
        analytics.track('save_to_disk_completed', { provider: source.id, platform: 'android' });
        context.reportProgress('File saved successfully', 1);
        const choice = await context.present('awaiting-user', () =>
          ask({
            title: `${source.title} Ready`,
            message: 'Your file has been saved. Would you like to share or upload it now?',
            confirmText: 'Share File',
            cancelText: 'Just Save',
          }),
        );
        if (choice === 'confirm') await shareFile();
        return { kind: 'saved' };
      } catch {
        return {
          kind: 'saved',
          warning: 'Your file was saved, but the follow-up action did not complete.',
        };
      }
    } finally {
      if (temporaryUri) {
        if (keepTemporaryFile) this.retain({ kind: 'file', uri: temporaryUri });
        else await files.deleteFile(temporaryUri);
      }
    }
  }

  /** Returns false only when folder selection was declined. */
  private async saveAndroidFile(
    artifact: Exclude<ShareArtifact, { kind: 'destination' | 'blob' }>,
    uri: string,
    meta: ReturnType<typeof metadata>,
    context: ShareDeliveryContext,
  ): Promise<boolean> {
    context.reportProgress('Waiting for folder selection...');
    const permission = await context.present('selecting-destination', () =>
      FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(),
    );
    context.ensureActive();
    if (!permission.granted) return false;

    context.reportProgress('Writing to destination...');
    const destination = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      meta.filename,
      meta.mimeType,
    );
    context.ensureActive();
    const content = artifact.kind === 'file' ? await files.readBase64(uri) : artifact.content;
    context.ensureActive();
    await files.writeContent(
      destination,
      content,
      artifact.kind === 'file' || artifact.kind === 'base64' ? 'base64' : 'utf8',
    );
    return true;
  }
}
