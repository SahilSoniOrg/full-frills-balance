import { storage } from '@/src/utils/storage';
import type { VersionPolicy } from './types';

const DISMISSED_KEY = 'full_frills_balance_update_notice_dismissed_v1';
let current: { policy: VersionPolicy; dismissed: boolean } | null = null;
const listeners = new Set<() => void>();

function policyKey(policy: VersionPolicy): string {
  return `${policy.latestBuild ?? ''}:${policy.storeUrl}`;
}

export function publishAvailableUpdate(policy: VersionPolicy): void {
  current = {
    policy,
    dismissed: storage.getString(DISMISSED_KEY) === policyKey(policy),
  };
  listeners.forEach(listener => listener());
}

export function clearAvailableUpdate(): void {
  current = null;
  listeners.forEach(listener => listener());
}

export function dismissAvailableUpdate(policy: VersionPolicy): void {
  storage.set(DISMISSED_KEY, policyKey(policy));
  current = { policy, dismissed: true };
  listeners.forEach(listener => listener());
}

export function readAvailableUpdate(): { policy: VersionPolicy; dismissed: boolean } | null {
  return current;
}

export function subscribeToAvailableUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
