/**
 * Import Hook
 *
 * Handles UI orchestration for data import.
 * Uses the plugin-based import system for format detection and execution.
 */

import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import {
    decodeContent,
    extractIfZip,
    importRegistry,
    readFileAsBytes,
    sanitizeContent
} from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

export type ImportFormat = string; // Plugin IDs: 'native' | 'ivy' | future formats

export function useImport() {
    const { requireRestart } = useUI();
    const [isImporting, setIsImporting] = useState(false);

    const handleImport = useCallback(async (expectedType?: ImportFormat) => {
        let didSetImporting = false;
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

            const proceed = Platform.OS === 'web'
                ? confirm(`This will REPLACE all your current data with content from ${file.name}. This cannot be undone. Are you sure?`)
                : await new Promise<boolean>(resolve => {
                    Alert.alert(
                        'Import Data',
                        `This will REPLACE all your current data with content from ${file.name}. This cannot be undone. Are you sure?`,
                        [
                            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Overwrite Everything', style: 'destructive', onPress: () => resolve(true) }
                        ]
                    );
                });

            if (!proceed) return;

            setIsImporting(true);
            didSetImporting = true;

            // 1. Read file as bytes
            let rawBytes = await readFileAsBytes(file.uri);

            // 2. Extract from ZIP if needed
            rawBytes = await extractIfZip(rawBytes);

            // 3. Decode content
            let content = decodeContent(rawBytes);
            content = sanitizeContent(content);

            // 4. Parse and detect format
            let detectedPlugin = undefined;
            try {
                const data = JSON.parse(content);
                detectedPlugin = importRegistry.detect(data);
            } catch (e) {
                logger.warn('[useImport] JSON Parse failed', { error: e instanceof Error ? e.message : String(e) });
            }

            // 5. Validate expected vs detected format
            if (expectedType && detectedPlugin) {
                if (expectedType !== detectedPlugin.id) {
                    const confirmMismatch = Platform.OS === 'web'
                        ? confirm(`Warning: You selected "${importRegistry.get(expectedType)?.name || expectedType}" but this looks like a "${detectedPlugin.name}" file. Continue?`)
                        : await new Promise<boolean>(resolve => {
                            Alert.alert(
                                'Format Mismatch',
                                `This looks like a ${detectedPlugin.name} file. Import anyway?`,
                                [
                                    { text: 'Cancel', onPress: () => resolve(false) },
                                    { text: 'Continue', onPress: () => resolve(true) }
                                ]
                            );
                        });
                    if (!confirmMismatch) {
                        return;
                    }
                }
            }

            // 6. Determine which plugin to use
            const plugin = expectedType
                ? importRegistry.get(expectedType)
                : detectedPlugin;

            if (!plugin) {
                throw new Error('Could not determine file format');
            }

            logger.info(`[useImport] Using plugin: ${plugin.id}`);

            // 7. Execute import
            const stats = await plugin.import(content);
            analytics.logImportCompleted(plugin.id, stats);
            requireRestart({ type: 'IMPORT', stats });

        } catch (error) {
            logger.error('[useImport] Import failed', error);
            Alert.alert('Import Failed', 'Could not parse or import the selected file.');
        } finally {
            if (didSetImporting) {
                setIsImporting(false);
            }
        }
    }, [requireRestart]);

    return {
        handleImport,
        isImporting
    };
}
