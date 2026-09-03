export type VersionPolicy = {
  minimumBuild: number;
  latestBuild?: number;
  storeUrl: string;
  message?: string;
  availableMessage?: string;
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
