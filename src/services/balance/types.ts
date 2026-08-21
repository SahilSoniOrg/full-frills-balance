export interface CachedHierarchy {
  parentIdMap: Map<string, string>;
  depthCache: Map<string, number>;
  levelMap: Map<number, string[]>;
  maxDepth: number;
  fingerprint: string; // 100% Deterministic string hash for cache key
}
