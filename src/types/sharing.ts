import type { WorkplaceId } from '@/src/types/ids';

export enum ShareFormat {
  TEXT = 'TEXT',
  CSV = 'CSV',
  MARKDOWN = 'MARKDOWN',
  ZIP = 'ZIP',
}

export type ShareScope =
  | { kind: 'device' }
  | { kind: 'workplace'; workplaceId: WorkplaceId }
  | { kind: 'workplaces'; workplaceIds: readonly WorkplaceId[] };

export type ShareAction = 'share' | 'save';
export interface ShareProgress {
  message: string;
  progress?: number;
}

export interface ShareWritable {
  write(content: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface SharePreparationContext {
  signal: AbortSignal;
  reportProgress: (message: string, progress?: number) => void;
  destination?: ShareWritable;
}

type ArtifactMetadata = { filename?: string; mimeType?: string; fileExtension?: string };
export type ShareArtifact = ArtifactMetadata &
  (
    | { kind: 'text'; content: string }
    | { kind: 'bytes'; content: Uint8Array }
    | { kind: 'blob'; content: Blob }
    // Existing ZIP producers already produce base64; keep its encoding explicit.
    | { kind: 'base64'; content: string }
    | { kind: 'file'; uri: string; cleanup?: () => void | Promise<void> }
    | { kind: 'destination' }
  );

/** Cheap, immutable content description. Preparation runs only for an accepted action. */
export interface Shareable {
  id: string;
  title: string;
  filename: string;
  mimeType?: string;
  fileExtension?: string;
  supportedFormats: readonly ShareFormat[];
  scope: ShareScope;
  requireFile?: boolean;
  preferStreaming?: boolean;
  prepare(format: ShareFormat, context: SharePreparationContext): Promise<ShareArtifact | null>;
}

export type ShareOutcome =
  | { kind: 'saved'; warning?: string }
  | { kind: 'handed-off' }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | { kind: 'busy' }
  | { kind: 'failed'; error: Error };

export interface ShareRequest {
  action: ShareAction;
  format: ShareFormat;
  onProgress?: (message: string, progress?: number) => void;
}

export type SharingSnapshot = Readonly<{
  operationId: number | null;
  sourceId: string | null;
  phase: 'idle' | 'preparing' | 'selecting-destination' | 'awaiting-user' | 'delivering';
  progress: ShareProgress | null;
}>;
