import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ShareArtifact, SharePreparationContext } from '@/src/types/sharing';
import { throwIfShareAborted } from '@/src/services/sharing/sharingCancellation';

/** Stream to a native file or reserved browser destination; buffer only for browser fallback. */
export function createTextExportWriter(
  filename: string,
  mimeType: string,
  context: SharePreparationContext,
) {
  throwIfShareAborted(context.signal);
  const file = Platform.OS === 'web' ? null : new File(Paths.cache, filename);
  const chunks: string[] = [];
  file?.create({ overwrite: true });

  const cleanup = () => {
    try {
      if (file?.exists) file.delete();
    } catch {
      // Best-effort cleanup must preserve the preparation or delivery result.
    }
  };

  return {
    async write(content: string) {
      throwIfShareAborted(context.signal);
      if (file) await file.write(content, { append: true });
      else if (context.destination) await context.destination.write(content);
      else chunks.push(content);
      throwIfShareAborted(context.signal);
    },
    getArtifact(): ShareArtifact {
      throwIfShareAborted(context.signal);
      if (file) return { kind: 'file', uri: file.uri, mimeType, cleanup };
      if (context.destination) return { kind: 'destination' };
      return { kind: 'blob', content: new Blob(chunks, { type: mimeType }), mimeType };
    },
    cleanup,
  };
}
