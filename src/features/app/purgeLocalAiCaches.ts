import { files } from '@/src/utils/files';
import { logger } from '@/src/utils/logger';

/** iOS `HybridModelStore`: `Library/Caches/litert_models`. */
const IOS_LITERT_MODELS_DIR = 'litert_models';
/** Android `HybridModelStore`: `context.filesDir/models`. */
const ANDROID_LITERT_MODELS_DIR = 'models';

export type LocalAiCacheFileOps = Pick<
  typeof files,
  'cache' | 'document' | 'listDirectory' | 'deleteFile' | 'deleteDirectory'
>;

type DirEntry = { uri?: string; name?: string };

export function joinFsUri(rootUri: string, ...segments: string[]): string {
  const root = rootUri.replace(/\/+$/, '');
  const parts = segments.map(segment => segment.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  return `${root}/${parts.join('/')}`;
}

export function isLiteRtModelArtifact(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.litertlm') || lower.endsWith('.litertlm.tmp');
}

function entryName(entry: DirEntry): string {
  if (typeof entry.name === 'string' && entry.name.length > 0) {
    return entry.name;
  }
  const uri = entry.uri ?? '';
  const trimmed = uri.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? decodeURIComponent(trimmed.slice(slash + 1)) : trimmed;
}

async function listEntries(ops: LocalAiCacheFileOps, directoryUri: string): Promise<DirEntry[]> {
  try {
    return await ops.listDirectory(directoryUri);
  } catch {
    return [];
  }
}

async function deleteMatchingArtifacts(
  ops: LocalAiCacheFileOps,
  directoryUri: string,
): Promise<void> {
  const listed = await listEntries(ops, directoryUri);
  await Promise.all(
    listed
      .filter(entry => isLiteRtModelArtifact(entryName(entry)))
      .map(entry => ops.deleteFile(entry.uri ?? joinFsUri(directoryUri, entryName(entry)))),
  );
}

/**
 * Deletes leftover on-device LiteRT weights after the native stack is gone.
 * Idempotent: missing directories and already-deleted files are ignored.
 */
export async function purgeLocalAiCaches(ops: LocalAiCacheFileOps = files): Promise<void> {
  try {
    const cacheRoot = ops.cache;
    const documentRoot = ops.document;

    if (cacheRoot) {
      await ops.deleteDirectory(joinFsUri(cacheRoot, IOS_LITERT_MODELS_DIR));
      await deleteMatchingArtifacts(ops, cacheRoot);
    }

    if (documentRoot) {
      const androidModels = joinFsUri(documentRoot, ANDROID_LITERT_MODELS_DIR);
      await deleteMatchingArtifacts(ops, androidModels);
      const remaining = await listEntries(ops, androidModels);
      if (remaining.length === 0) {
        await ops.deleteDirectory(androidModels);
      }
    }
  } catch (error) {
    logger.warn('[Bootstrap] Failed to purge leftover local AI model caches', { error });
  }
}

let purgeInFlight: Promise<void> | null = null;

export function purgeLocalAiCachesOnce(ops?: LocalAiCacheFileOps): Promise<void> {
  purgeInFlight ??= purgeLocalAiCaches(ops);
  return purgeInFlight;
}

export function resetLocalAiCachePurgeForTests(): void {
  purgeInFlight = null;
}
