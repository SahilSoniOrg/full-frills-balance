import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/services/preferences';
import type { PrivacyPolicyAcknowledgement } from '@/src/services/preferences';

export type { PrivacyPolicyAcknowledgement };

export function subscribeToPrivacyPolicyAcknowledgement(listener: () => void): () => void {
  const subscription = preferences.privacy
    .observePrivacyPolicyAcknowledgement()
    .subscribe(() => listener());
  return () => subscription.unsubscribe();
}

export function readPrivacyPolicyAcknowledgement(): PrivacyPolicyAcknowledgement | undefined {
  return preferences.privacy.privacyPolicyAcknowledgement;
}

export function hasAcknowledgedCurrentPrivacyPolicy(): boolean {
  return readPrivacyPolicyAcknowledgement()?.version === AppConfig.legal.privacyPolicyVersion;
}

export function formatPrivacyPolicyEffectiveDate(
  version: string = AppConfig.legal.privacyPolicyVersion,
): string {
  const [year, month, day] = version.split('-');
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (!year || monthIndex < 0 || monthIndex > 11 || !Number.isInteger(dayNumber)) return version;
  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(year), monthIndex, 1)));
  return `${monthName} ${dayNumber}, ${year}`;
}

export function acknowledgeCurrentPrivacyPolicy(now: Date = new Date()): void {
  preferences.privacy.setPrivacyPolicyAcknowledgement({
    version: AppConfig.legal.privacyPolicyVersion,
    acknowledgedAt: now.toISOString(),
  });
}
