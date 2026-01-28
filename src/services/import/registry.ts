/**
 * Import Plugin Registry
 *
 * Central registry for all import plugins.
 * Handles plugin registration and format detection.
 */

import { ImportPlugin } from '@/src/services/import/types';

class ImportRegistry {
    private plugins: Map<string, ImportPlugin> = new Map();

    /**
     * Register a new import plugin.
     * Plugins are registered on app startup.
     */
    register(plugin: ImportPlugin): void {
        if (this.plugins.has(plugin.id)) {
            throw new Error(`Import plugin with id "${plugin.id}" is already registered`);
        }
        this.plugins.set(plugin.id, plugin);
    }

    /**
     * Get a plugin by its ID.
     */
    get(id: string): ImportPlugin | undefined {
        return this.plugins.get(id);
    }

    /**
     * Get all registered plugins.
     * Used by UI to render import options.
     */
    getAll(): ImportPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Auto-detect the format of parsed JSON data.
     * Returns the first plugin whose detect() returns true.
     */
    detect(data: unknown): ImportPlugin | undefined {
        for (const plugin of this.plugins.values()) {
            try {
                if (plugin.detect(data)) {
                    return plugin;
                }
            } catch {
                // Detection should not throw, but if it does, skip this plugin
            }
        }
        return undefined;
    }
}

export const importRegistry = new ImportRegistry();
