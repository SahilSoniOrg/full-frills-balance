import { readAppVariant, type AppVariant } from './appVariant';
import { generator } from '@/src/data/database/idGenerator';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const ANONYMIZED_IDENTITY_KINDS = ['e2e', 'dev', 'preview', 'sim', 'anon'] as const;
export type AnonymizedIdentityKind = (typeof ANONYMIZED_IDENTITY_KINDS)[number];

export type AnonymizedIdentitySignals = {
  readonly isE2eHarness: boolean;
  readonly isDevRuntime: boolean;
  readonly appVariant: AppVariant;
  readonly isNativeSimulator: boolean;
};

/** Pick a telemetry-id prefix so non-prod installs are filterable from store users. */
export function anonymizedIdentityKind(signals: AnonymizedIdentitySignals): AnonymizedIdentityKind {
  if (signals.isE2eHarness) return 'e2e';
  if (signals.isDevRuntime || signals.appVariant === 'development') return 'dev';
  if (signals.appVariant === 'preview') return 'preview';
  if (signals.isNativeSimulator) return 'sim';
  return 'anon';
}

export function formatAnonymizedId(kind: AnonymizedIdentityKind, entropy: string): string {
  return `${kind}_${entropy}`;
}

export function resolveAnonymizedIdentityKind(): AnonymizedIdentityKind {
  return anonymizedIdentityKind({
    isE2eHarness: process.env.EXPO_PUBLIC_E2E === '1',
    isDevRuntime: __DEV__,
    appVariant: readAppVariant(),
    isNativeSimulator:
      (Platform.OS === 'ios' || Platform.OS === 'android') && Device.isDevice === false,
  });
}

export function ensureAnonymizedIdForKind(
  existing: string | undefined,
  kind: AnonymizedIdentityKind,
  entropy: string,
): string {
  if (existing?.startsWith(`${kind}_`)) return existing;
  if (kind === 'anon' && existing) return existing;
  return formatAnonymizedId(kind, entropy);
}

/** Keep store ids stable; remint non-prod installs that still look like production. */
export function ensureAnonymizedId(existing: string | undefined): string {
  return ensureAnonymizedIdForKind(existing, resolveAnonymizedIdentityKind(), generator());
}
