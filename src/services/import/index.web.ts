/**
 * Import Module (web)
 *
 * Web intentionally excludes native-only SQLite-backed import plugins.
 */

import { ivyPlugin } from '@/src/services/import/plugins/ivy-plugin';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { importRegistry } from '@/src/services/import/registry';

importRegistry.register(nativePlugin);
importRegistry.register(ivyPlugin);

export {
    decodeContent,
    extractIfZip,
    readFileAsBytes,
    sanitizeContent
} from '@/src/services/import/orchestrator';
export { importRegistry } from '@/src/services/import/registry';
export type { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
