import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { AppConfig } from '@/src/constants/app-config';
import { storage } from '@/src/utils/storage';
import type { VersionCheckResult, VersionPolicy, VersionPolicyManifest } from './types';

const CACHE_KEY = 'full_frills_balance_version_policy_v2';
const E2E_UPDATE_GATE_MODE =
  process.env.EXPO_PUBLIC_E2E === '1' ? process.env.EXPO_PUBLIC_UPDATE_GATE_E2E : undefined;
const REQUEST_TIMEOUT_MS = 5000;

export function isVersionPolicyConfigured(): boolean {
  return Boolean(AppConfig.api.versionPolicyUrl) || Boolean(E2E_UPDATE_GATE_MODE);
}

function isValidPolicy(value: unknown): value is VersionPolicy {
  if (!value || typeof value !== 'object') return false;
  const policy = value as Record<string, unknown>;
  const hasValidStoreUrl = (() => {
    try {
      const url = new URL(String(policy.storeUrl));
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
    } catch {
      return false;
    }
  })();
  return (
    Number.isInteger(policy.minimumBuild) &&
    (policy.minimumBuild as number) >= 0 &&
    (policy.latestBuild === undefined ||
      (Number.isInteger(policy.latestBuild) &&
        (policy.latestBuild as number) >= (policy.minimumBuild as number))) &&
    hasValidStoreUrl &&
    (policy.message === undefined || typeof policy.message === 'string') &&
    (policy.availableMessage === undefined || typeof policy.availableMessage === 'string') &&
    (policy.enabled === undefined || typeof policy.enabled === 'boolean')
  );
}

function isValidManifest(value: unknown): value is VersionPolicyManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Record<string, unknown>;
  return (
    isValidPolicy(manifest.ios) && isValidPolicy(manifest.android) && isValidPolicy(manifest.web)
  );
}

export function getCurrentBuild(): number | null {
  const build = Number.parseInt(Application.nativeBuildVersion ?? '', 10);
  return Number.isInteger(build) && build >= 0 ? build : null;
}

export function readCachedVersionPolicy(): VersionPolicyManifest | null {
  try {
    const raw = storage.getString(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cacheVersionPolicy(manifest: VersionPolicyManifest): void {
  storage.set(CACHE_KEY, JSON.stringify(manifest));
}

export async function fetchVersionPolicy(
  fetchImpl: typeof fetch = fetch,
  endpoint = AppConfig.api.versionPolicyUrl,
): Promise<VersionPolicy | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  if (!endpoint && E2E_UPDATE_GATE_MODE) {
    if (E2E_UPDATE_GATE_MODE === 'available') {
      return {
        minimumBuild: 0,
        latestBuild: Number.MAX_SAFE_INTEGER,
        storeUrl: 'https://example.com/full-frills-balance-update',
        availableMessage: 'A newer version of Full Frills Balance is available.',
      };
    }
    return {
      minimumBuild: Number.MAX_SAFE_INTEGER,
      storeUrl: 'https://example.com/full-frills-balance-update',
      message: 'This is a preview of the mandatory update screen.',
    };
  }
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) throw new Error(`Version policy request failed: ${response.status}`);

  const policy: unknown = await response.json();
  if (!isValidManifest(policy)) throw new Error('Version policy response was invalid');
  cacheVersionPolicy(policy);
  return policy[Platform.OS];
}

export function evaluateVersionPolicy(
  policy: VersionPolicy,
  currentBuild = getCurrentBuild(),
  source: 'remote' | 'cache' = 'remote',
): VersionCheckResult {
  if (policy.enabled === false || currentBuild === null) {
    return { kind: 'allowed', source };
  }
  if (currentBuild >= policy.minimumBuild) {
    return currentBuild < (policy.latestBuild ?? currentBuild)
      ? { kind: 'allowed', source, available: policy }
      : { kind: 'allowed', source };
  }
  return { kind: 'required', policy, source };
}

export async function checkVersion(fetchImpl: typeof fetch = fetch): Promise<VersionCheckResult> {
  try {
    const remotePolicy = await fetchVersionPolicy(fetchImpl);
    if (remotePolicy) return evaluateVersionPolicy(remotePolicy, getCurrentBuild(), 'remote');
  } catch {
    // A cached policy still protects users during a temporary outage.
  }

  const cachedManifest = readCachedVersionPolicy();
  if (cachedManifest && (Platform.OS === 'ios' || Platform.OS === 'android')) {
    return evaluateVersionPolicy(cachedManifest[Platform.OS], getCurrentBuild(), 'cache');
  }

  return { kind: 'allowed', source: 'remote' };
}
