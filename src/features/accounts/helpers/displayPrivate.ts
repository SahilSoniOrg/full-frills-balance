import { AppConfig } from '@/src/constants/app-config';

/** Masks a sender or account name while privacy mode is on. */
export function displayPrivate(
  privateMode: boolean,
  value: string | null | undefined,
  fallback = '',
): string {
  if (privateMode) return AppConfig.privacyMask;
  return value || fallback;
}
