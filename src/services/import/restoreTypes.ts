import type { CanonicalImport } from '@/src/types/importContracts';
import type {
  ImportFileContext,
  ImportPlugin,
  ImportStats,
  ParsedImportResult,
} from '@/src/services/import/types';
import type { FontId, ThemeId } from '@/src/constants/design-tokens';
import type { WorkplaceId } from '@/src/types/ids';
import type { UIPreferences } from '@/src/services/preferences';
import type { WorkplacePreferences } from '@/src/services/preferences/workplaceTypes';

/** Facts from a backup that Setup may use to prefill its own slices. */
export interface RestoreFacts {
  readonly user?: {
    readonly name?: string;
  };
  readonly workplace: {
    readonly name?: string;
    readonly icon?: string;
    readonly defaultCurrencyCode?: string;
  };
  readonly appearance?: {
    readonly theme?: UIPreferences['theme'];
    readonly themeId?: ThemeId;
    readonly fontId?: FontId;
  };
  /** Workplace-scoped preferences are safe to restore for Settings/picker imports. */
  readonly workplacePreferences?: Partial<WorkplacePreferences>;
}

/** Result of parsing and validating a source. It contains no database identity or persisted rows. */
export interface PreparedRestore {
  readonly fingerprint: string;
  readonly canonicalData: CanonicalImport;
  readonly facts: RestoreFacts;
  readonly stats: ImportStats;
  readonly warnings: readonly string[];
}

export interface PrepareRestoreOptions {
  /** Currency used only as the parser fallback; it is never treated as imported fact. */
  readonly defaultCurrency?: string;
  readonly onProgress?: (message: string, progress?: number) => void;
}

export interface RestorePublicationCorrections {
  /** Required for a new Workplace. Setup owns the decision; the publisher never invents it. */
  readonly name: string;
  readonly icon: string;
  readonly defaultCurrencyCode: string;
}

export interface PublishRestoreOptions {
  readonly operationId: WorkplaceId;
  readonly corrections: RestorePublicationCorrections;
  readonly onProgress?: (message: string, progress?: number) => void;
}

export interface RestoreHandoff {
  readonly operationId: WorkplaceId;
  readonly workplaceId: WorkplaceId;
  readonly fingerprint: string;
  readonly stats: ImportStats;
  readonly facts: RestoreFacts;
  readonly warnings: readonly string[];
}

/** Internal helper type for the parser seam; exported to keep tests and adapters honest. */
export type RestoreParser = Pick<ImportPlugin, 'parse'>;
export type RestoreSource = Pick<ImportFileContext, 'rawBytes' | 'uri' | 'name'>;
export type ParsedRestore = Pick<
  ParsedImportResult,
  'canonical' | 'preferences' | 'workplacePreferences' | 'workplace' | 'stats'
>;
