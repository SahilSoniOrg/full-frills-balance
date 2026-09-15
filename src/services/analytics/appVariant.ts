import * as Application from 'expo-application';
import Constants from 'expo-constants';

export const APP_VARIANTS = ['development', 'preview', 'production'] as const;
export type AppVariant = (typeof APP_VARIANTS)[number];

function asAppVariant(value: unknown): AppVariant | undefined {
  return typeof value === 'string' && APP_VARIANTS.includes(value as AppVariant)
    ? (value as AppVariant)
    : undefined;
}

function variantFromApplicationId(): AppVariant | undefined {
  try {
    const id = Application.applicationId ?? '';
    if (id.endsWith('.dev')) return 'development';
    if (id.endsWith('.preview')) return 'preview';
    return undefined;
  } catch {
    return undefined;
  }
}

/** Build flavor for this install. Unknown clients default to production. */
export function readAppVariant(): AppVariant {
  const extra = Constants.expoConfig?.extra as { appVariant?: unknown } | undefined;
  return (
    asAppVariant(extra?.appVariant) ??
    asAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT) ??
    asAppVariant(process.env.APP_VARIANT) ??
    variantFromApplicationId() ??
    'production'
  );
}
