/**
 * Import Module
 *
 * Public API for the import system.
 * Registers all available import plugins on module load.
 *
 * To add a new import format:
 * 1. Create a new plugin file in plugins/
 * 2. Import and register it here
 */

import { ivyPlugin } from '@/src/services/import/plugins/ivy-plugin';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { importRegistry } from '@/src/services/import/registry';

// Register all plugins
importRegistry.register(nativePlugin);
importRegistry.register(ivyPlugin);

// Re-export public API
export {
    decodeContent,
    extractIfZip,
    readFileAsBytes,
    sanitizeContent
} from '@/src/services/import/orchestrator';
export { importRegistry } from '@/src/services/import/registry';
export type { ImportPlugin, ImportStats } from '@/src/services/import/types';

