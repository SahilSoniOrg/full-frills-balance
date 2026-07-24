import { importService } from '@/src/services/import/ImportService';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { WorkplaceId } from '@/src/types/domain';

export class ImportRunner {
  async runImport(
    plugin: ImportPlugin,
    context: ImportFileContext,
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<ImportStats> {
    return importService.executeImport(plugin, context, workplaceId, onProgress);
  }
}

export const importRunner = new ImportRunner();
