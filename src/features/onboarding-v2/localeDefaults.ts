import { AppConfig } from '@/src/constants/app-config';
import { ONBOARDING_V2_STRINGS } from '@/src/constants/copy/domains/onboardingV2Strings';
import * as Localization from 'expo-localization';

export function defaultOnboardingCurrency(): string {
  const code = Localization.getLocales()[0]?.currencyCode;
  return code && code.length === 3 ? code.toUpperCase() : AppConfig.defaultCurrency;
}

export function defaultDeviceDisplayName(): string {
  return 'You';
}

export function defaultWorkplaceName(): string {
  return ONBOARDING_V2_STRINGS.workspaceNameDefault;
}
