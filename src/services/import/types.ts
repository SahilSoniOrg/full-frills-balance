/**
 * Import Plugin Types
 *
 * Defines the interface for import plugins and common types.
 */

/**
 * Statistics returned after an import operation.
 */
export interface ImportStats {
    accounts: number;
    journals: number;
    transactions: number;
    auditLogs?: number;
    skippedTransactions: number;
    skippedItems?: { id: string; reason: string; description?: string }[];
}

/**
 * Plugin interface for data import formats.
 *
 * Each plugin handles detection and import for a specific format.
 * To add a new format:
 * 1. Create a new file in plugins/
 * 2. Implement this interface
 * 3. Register in index.ts
 */
export interface ImportPlugin {
    /** Unique identifier for the plugin (e.g., 'native', 'ivy') */
    id: string;

    /** Display name shown in UI */
    name: string;

    /** Short description for UI */
    description: string;

    /** Emoji or icon identifier */
    icon: string;

    /**
     * Quick check on parsed JSON to detect if this plugin can handle it.
     * Should be fast and not throw errors.
     */
    detect(data: unknown): boolean;

    /**
     * Execute the import operation.
     * WARNING: Implementations should wipe existing data before import.
     */
    import(jsonContent: string, onProgress?: (message: string, progress: number) => void): Promise<ImportStats>;
}
