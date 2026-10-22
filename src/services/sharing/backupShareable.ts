import { exportWorkplacesToJSON } from '@/src/services/export/nativeBackupExporter';
import type { WorkplaceId } from '@/src/types/ids';
import { ShareFormat, type Shareable } from '@/src/types/sharing';
import { throwIfShareAborted } from './sharingCancellation';

export type BackupExportScope = 'all' | 'selected';

/** A cheap backup description. Workplace data and ZIP bytes are loaded only after acceptance. */
export function createBackupShareable(options: {
  id: string;
  title: string;
  filename: string;
  workplaceIds: readonly WorkplaceId[];
  exportScope: BackupExportScope;
}): Shareable {
  const workplaceIds = [...options.workplaceIds];
  return {
    id: options.id,
    title: options.title,
    filename: options.filename,
    mimeType: 'application/zip',
    fileExtension: 'zip',
    supportedFormats: [ShareFormat.ZIP],
    scope: { kind: 'workplaces', workplaceIds },
    requireFile: true,
    async prepare(_format, context) {
      throwIfShareAborted(context.signal);
      if (workplaceIds.length === 0) return null;
      const content = await exportWorkplacesToJSON(
        workplaceIds,
        options.exportScope,
        (message, progress) => {
          throwIfShareAborted(context.signal);
          context.reportProgress(message, progress);
        },
      );
      throwIfShareAborted(context.signal);
      return { kind: 'base64', content };
    },
  };
}
