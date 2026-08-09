import { CanonicalImport } from '@/src/services/import/canonicalImport';
import { UIPreferences } from '@/src/utils/preferences';

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
  budgets?: number;
  auditLogs?: number;
  plannedPayments?: number;
  skippedTransactions: number;
  skippedItems?: { id: string; reason: string; description?: string }[];
  /** Local path when a pre-import safety backup was written (ADR-0006). */
  preImportBackupPath?: string;
}

export interface ParsedImportResult {
  /** Canonical plugin output — preferred for all plugins (commit 25+). */
  canonical?: CanonicalImport;
  stats: ImportStats;
  preferences?: Partial<UIPreferences>;
  workplace?: { name?: string; defaultCurrencyCode?: string; icon?: string };
}

/**
 * Context provided to plugins during detection and import.
 */
export interface ImportFileContext {
  /** The URI of the selected file */
  uri: string;
  /** The name of the selected file */
  name: string;
  /** The raw bytes of the file */
  rawBytes: Uint8Array;
  /** The decoded text of the file, if it could be decoded */
  text?: string;
  /** The successfully parsed JSON object, if the text is valid JSON */
  json?: unknown;
}

/**
 * Plugin interface for data import formats.
 *
 * Each plugin handles detection and parsing for a specific format.
 * To add a new format:
 * 1. Create a new file in plugins/
 * 2. Implement this interface
 * 3. Register in index.ts
 */
export interface ImportPlugin {
  /** Unique identifier for the plugin (e.g., 'native', 'ivy', 'cashew') */
  id: string;

  /** Display name shown in UI */
  name: string;

  /** Short description for UI */
  description: string;

  /** Emoji or icon identifier */
  icon: string;

  /**
   * Check if this plugin can handle the given file context.
   * Should be fast and not throw errors.
   */
  detect(context: ImportFileContext): boolean;

  /**
   * Parse the file context and return the extracted data.
   */
  parse(
    context: ImportFileContext,
    options: {
      defaultCurrency: string;
      onProgress?: (message: string, progress: number) => void;
    },
  ): Promise<ParsedImportResult>;
}
