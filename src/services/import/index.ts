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

import { cashewPlugin } from '@/src/services/import/plugins/cashew-plugin';
import { csvPlugin } from '@/src/services/import/plugins/csv-plugin';
import { ivyPlugin } from '@/src/services/import/plugins/ivy-plugin';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { importRegistry } from '@/src/services/import/registry';

// Fast Refresh can re-evaluate this entry point while preserving the registry.
// Refresh built-ins in development; production still rejects duplicate IDs.
for (const plugin of [nativePlugin, ivyPlugin, cashewPlugin, csvPlugin]) {
  importRegistry.register(plugin, { replaceExisting: __DEV__ });
}

// Re-export public API
export {
  decodeContent,
  extractIfZip,
  readFileAsBytes,
  sanitizeContent,
} from '@/src/services/import/orchestrator';
export { importRegistry } from '@/src/services/import/registry';
export type { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
