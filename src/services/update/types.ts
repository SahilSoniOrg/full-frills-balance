export type VersionPolicy = {
  minimumBuild: number;
  latestBuild?: number;
  storeUrl: string;
  message?: string;
  availableMessage?: string;
  /** Human-readable highlights shown before a required update. */
  changelog?: string[];
  /** Enables this remote policy; Play discovery and delivery remain independent. */
  enabled?: boolean;
};

export type VersionPolicyManifest = {
  ios: VersionPolicy;
  android: VersionPolicy;
  web: VersionPolicy;
};

export type VersionCheckResult =
  | { kind: 'allowed'; source: 'remote' | 'cache'; available?: VersionPolicy }
  | { kind: 'required'; policy: VersionPolicy; source: 'remote' | 'cache' };
