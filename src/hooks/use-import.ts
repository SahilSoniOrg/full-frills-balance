import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { analytics } from '@/src/services/analytics';
import {
  decodeContent,
  extractIfZip,
  importRegistry,
  readFileAsBytes,
  sanitizeContent,
} from '@/src/services/import';
import { importService } from '@/src/services/import/ImportService';
import { ImportFileContext } from '@/src/services/import/types';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/ids';
import { confirm, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';

export type ImportFormat = string;

export function useImport() {
  const { requireRestart } = useAppRestart();

  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const handleImport = useCallback(
    async (targetWorkplaceId?: WorkplaceId, expectedType?: ImportFormat) => {
      let didSetImporting = false;

      const processFile = async (file: DocumentPicker.DocumentPickerAsset) => {
        setIsImporting(true);
        setProgress(0);
        setProgressMessage('Initializing...');
        didSetImporting = true;

        try {
          // Resolve target workplace
          let resolvedWorkplaceId = targetWorkplaceId;
          if (!resolvedWorkplaceId) {
            logger.info(
              '[useImport] No active workplace found, ensuring default workplace before import...',
            );
            const defaultWorkplace = await workplaceService.ensureDefaultWorkplace();
            resolvedWorkplaceId = defaultWorkplace.id;
          }

          let rawBytes = await readFileAsBytes(file.uri);
          rawBytes = await extractIfZip(rawBytes);

          const context: ImportFileContext = {
            uri: file.uri,
            name: file.name,
            rawBytes,
          };

          let detectedPlugin = undefined;
          try {
            let text = decodeContent(rawBytes);
            text = sanitizeContent(text);
            context.text = text;

            try {
              logger.info(`[useImport] Parsing JSON content (${text.length} chars)...`);
              const data = JSON.parse(text);
              context.json = data;
              logger.info('[useImport] JSON parsed successfully.');
            } catch (e) {
              logger.warn('[useImport] JSON Parse failed, might be a binary file', {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          } catch (e) {
            logger.warn('[useImport] Text decode failed, processing as raw binary', {
              error: e instanceof Error ? e.message : String(e),
            });
          }

          detectedPlugin = importRegistry.detect(context);

          if (expectedType && detectedPlugin && expectedType !== detectedPlugin.id) {
            analytics.trackFeatureUsage('import', 'format_mismatch', {
              detected: detectedPlugin.id,
              expected: expectedType,
            });

            const continueWithMismatch = await new Promise<boolean>(resolve => {
              confirm.show({
                title: 'Format Mismatch',
                message: `This looks like a ${detectedPlugin.name} file. Import anyway?`,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
              });
            });

            if (!continueWithMismatch) {
              analytics.trackFeatureUsage('import', 'cancelled', { stage: 'mismatch_prompt' });
              setIsImporting(false);
              return;
            }
          }

          const plugin = expectedType ? importRegistry.get(expectedType) : detectedPlugin;

          if (!plugin) {
            analytics.trackFeatureUsage('import', 'failed', { reason: 'undetermined_format' });
            throw new Error('Could not determine file format');
          }

          logger.info(`[useImport] Using plugin: ${plugin.id}`);

          const stats = await importService.executeImport(
            plugin,
            context,
            resolvedWorkplaceId,
            (msg: string, prog?: number) => {
              setProgressMessage(msg);
              if (prog !== undefined) setProgress(prog);
            },
          );

          const finalStats = {
            ...stats,
            skippedItems: stats.skippedItems?.slice(0, 100), // Prevent UI state bloat
          };
          logger.info('[useImport] Import task complete. Requesting restart...');
          analytics.logImportCompleted(plugin.id, finalStats);
          requireRestart({ type: 'IMPORT', stats: finalStats });
        } catch (error) {
          logger.error('[useImport] Import failed', error);
          analytics.trackFeatureUsage('import', 'failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          toast.error('Could not parse or import the selected file.');
        } finally {
          if (didSetImporting) {
            setIsImporting(false);
          }
        }
      };

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            'application/json',
            'application/zip',
            'application/x-zip-compressed',
            'application/octet-stream',
            '*/*',
          ],
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          analytics.trackFeatureUsage('import', 'picker_cancelled');
          return;
        }

        const file = result.assets[0];
        analytics.trackFeatureUsage('import', 'file_selected', {
          file_size: file.size ?? 0,
          mime_type: file.mimeType || 'unknown',
        });

        confirm.show({
          title: 'Import Data',
          message: `This will REPLACE all your current data with content from ${file.name}. This cannot be undone. Are you sure?`,
          confirmText: 'Overwrite Everything',
          destructive: true,
          onConfirm: () => processFile(file),
        });
      } catch (error) {
        logger.error('[useImport] Document pick failed', error);
        analytics.trackFeatureUsage('import', 'picker_error', {
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Could not select file');
      }
    },
    [requireRestart],
  );

  return {
    handleImport,
    isImporting,
    progress,
    progressMessage,
  };
}
