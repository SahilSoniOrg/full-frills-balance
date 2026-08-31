import { FontIds, ThemeIds, type FontId, type ThemeId } from '@/src/constants';
import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import type { WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';
import type { OnboardingStage, OnboardingWorkplaceStep } from '../domain/onboardingTypes';

export type { OnboardingStage, OnboardingWorkplaceStep } from '../domain/onboardingTypes';

export const ONBOARDING_DRAFT_KEY = 'onboarding_draft_v1';
export const ONBOARDING_DRAFT_VERSION = 1 as const;

export interface OnboardingCustomCategory {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon: IconName;
}

export interface OnboardingCustomAccount {
  name: string;
  type: 'ASSET' | 'LIABILITY';
  icon: IconName;
}

export interface OnboardingDraft {
  version: typeof ONBOARDING_DRAFT_VERSION;
  stage: OnboardingStage;
  workplaceStep: OnboardingWorkplaceStep;
  operationId: WorkplaceId;
  name: string;
  workplaceName: string;
  workplaceIcon: IconName;
  selectedCurrency: string;
  selectedAccounts: string[];
  customAccounts: OnboardingCustomAccount[];
  selectedCategories: string[];
  customCategories: OnboardingCustomCategory[];
  /** Appearance is global preference data, not onboarding draft state. */
  themeId?: ThemeId;
  fontId?: FontId;
  /** True when the user entered a setup step from the final review. */
  returnToReview?: boolean;
  importedWorkplaceId?: WorkplaceId;
}

const STAGES: readonly OnboardingStage[] = [
  'user_profile',
  'workplace_setup',
  'appearance',
  'review',
  'post_import',
  'complete',
];
const WORKPLACE_STEPS: readonly OnboardingWorkplaceStep[] = [
  'identity',
  'currency',
  'accounts',
  'categories',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined;
  return value;
}

function customItems<T extends OnboardingCustomAccount | OnboardingCustomCategory>(
  value: unknown,
  types: readonly string[],
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(isRecord).map(item => ({
    name: item.name,
    type: item.type,
    icon: item.icon,
  }));
  if (
    items.length !== value.length ||
    !items.every(
      item =>
        typeof item.name === 'string' &&
        typeof item.type === 'string' &&
        types.includes(item.type) &&
        typeof item.icon === 'string' &&
        isValidIconName(item.icon),
    )
  ) {
    return undefined;
  }
  return items as T[];
}

/** Read and validate the device-local draft. Invalid or older drafts are ignored. */
export function loadOnboardingDraft(): OnboardingDraft | undefined {
  try {
    const raw = storage.getString(ONBOARDING_DRAFT_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== ONBOARDING_DRAFT_VERSION) return undefined;

    const selectedAccounts = stringArray(value.selectedAccounts);
    const customAccounts = customItems<OnboardingCustomAccount>(value.customAccounts, [
      'ASSET',
      'LIABILITY',
    ]);
    const selectedCategories = stringArray(value.selectedCategories);
    const customCategories = customItems<OnboardingCustomCategory>(value.customCategories, [
      'INCOME',
      'EXPENSE',
    ]);
    if (
      typeof value.stage !== 'string' ||
      !STAGES.includes(value.stage as OnboardingStage) ||
      typeof value.workplaceStep !== 'string' ||
      !WORKPLACE_STEPS.includes(value.workplaceStep as OnboardingWorkplaceStep) ||
      typeof value.operationId !== 'string' ||
      !value.operationId ||
      typeof value.name !== 'string' ||
      typeof value.workplaceName !== 'string' ||
      typeof value.workplaceIcon !== 'string' ||
      !isValidIconName(value.workplaceIcon as string) ||
      typeof value.selectedCurrency !== 'string' ||
      !value.selectedCurrency ||
      !selectedAccounts ||
      !customAccounts ||
      !selectedCategories ||
      !customCategories ||
      (value.themeId !== undefined &&
        (typeof value.themeId !== 'string' ||
          !Object.values(ThemeIds).includes(value.themeId as ThemeId))) ||
      (value.fontId !== undefined &&
        (typeof value.fontId !== 'string' ||
          !Object.values(FontIds).includes(value.fontId as FontId)))
    ) {
      return undefined;
    }

    return {
      version: ONBOARDING_DRAFT_VERSION,
      stage: value.stage as OnboardingStage,
      workplaceStep: value.workplaceStep as OnboardingWorkplaceStep,
      operationId: value.operationId as WorkplaceId,
      name: value.name,
      workplaceName: value.workplaceName,
      workplaceIcon: value.workplaceIcon as IconName,
      selectedCurrency: value.selectedCurrency,
      selectedAccounts,
      customAccounts,
      selectedCategories,
      customCategories,
      ...(typeof value.themeId === 'string' ? { themeId: value.themeId as ThemeId } : {}),
      ...(typeof value.fontId === 'string' ? { fontId: value.fontId as FontId } : {}),
      ...(typeof value.returnToReview === 'boolean'
        ? { returnToReview: value.returnToReview }
        : {}),
      ...(typeof value.importedWorkplaceId === 'string' && value.importedWorkplaceId
        ? { importedWorkplaceId: value.importedWorkplaceId as WorkplaceId }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
}

export function clearOnboardingDraft(): void {
  storage.remove(ONBOARDING_DRAFT_KEY);
}
