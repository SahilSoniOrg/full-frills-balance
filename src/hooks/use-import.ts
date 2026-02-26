import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import {
    decodeContent,
    extractIfZip,
    importRegistry,
    readFileAsBytes,
    sanitizeContent
} from '@/src/services/import';
import { confirm, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';

export type ImportFormat = string;

export function useImport() {
    const { requireRestart } = useUI();
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');

    const handleImport = useCallback(async (expectedType?: ImportFormat) => {
        let didSetImporting = false;

        const processFile = async (file: DocumentPicker.DocumentPickerAsset) => {
            setIsImporting(true);
            setProgress(0);
            setProgressMessage('Initializing...');
            didSetImporting = true;

            try {
                let rawBytes = await readFileAsBytes(file.uri);
                rawBytes = await extractIfZip(rawBytes);

                let content = decodeContent(rawBytes);
                content = sanitizeContent(content);

                let detectedPlugin = undefined;
                try {
                    const data = JSON.parse(content);
                    detectedPlugin = importRegistry.detect(data);
                } catch (e) {
                    logger.warn('[useImport] JSON Parse failed', { error: e instanceof Error ? e.message : String(e) });
                }

                if (expectedType && detectedPlugin && expectedType !== detectedPlugin.id) {
                    const continueWithMismatch = await new Promise<boolean>(resolve => {
                        confirm.show({
                            title: 'Format Mismatch',
                            message: `This looks like a ${detectedPlugin.name} file. Import anyway?`,
                            onConfirm: () => resolve(true),
                            onCancel: () => resolve(false),
                        });
                    });

                    if (!continueWithMismatch) {
                        setIsImporting(false);
                        return;
                    }
                }

                const plugin = expectedType
                    ? importRegistry.get(expectedType)
                    : detectedPlugin;

                if (!plugin) {
                    throw new Error('Could not determine file format');
                }

                logger.info(`[useImport] Using plugin: ${plugin.id}`);

                const stats = await plugin.import(content, (msg, prog) => {
                    setProgressMessage(msg);
                    setProgress(prog);
                });

                analytics.logImportCompleted(plugin.id, stats);
                requireRestart({ type: 'IMPORT', stats });
            } catch (error) {
                logger.error('[useImport] Import failed', error);
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
                    '*/*'
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];

            confirm.show({
                title: 'Import Data',
                message: `This will REPLACE all your current data with content from ${file.name}. This cannot be undone. Are you sure?`,
                confirmText: 'Overwrite Everything',
                destructive: true,
                onConfirm: () => processFile(file),
            });
        } catch (error) {
            logger.error('[useImport] Document pick failed', error);
            toast.error('Could not select file');
        }
    }, [requireRestart]);

    return {
        handleImport,
        isImporting,
        progress,
        progressMessage
    };
}
