import { storage } from '@/src/utils/storage';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  ONBOARDING_DRAFT_KEY,
  saveOnboardingDraft,
  type OnboardingDraft,
} from '../OnboardingDraftStore';

const mockMemory = new Map<string, string>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: jest.fn((key: string) => mockMemory.get(key)),
    set: jest.fn((key: string, value: string) => mockMemory.set(key, value)),
    remove: jest.fn((key: string) => mockMemory.delete(key)),
  },
}));

const draft: OnboardingDraft = {
  version: 1,
  stage: 'review',
  workplaceStep: 'categories',
  operationId: 'operation-1' as never,
  name: 'Sahil',
  workplaceName: 'Home',
  workplaceIcon: 'briefcase',
  selectedCurrency: 'USD',
  selectedAccounts: ['Cash'],
  customAccounts: [{ name: 'Loan', type: 'LIABILITY', icon: 'wallet' }],
  selectedCategories: ['Salary', 'Bills'],
  customCategories: [{ name: 'Gifts', type: 'EXPENSE', icon: 'tag' }],
  themeId: 'deep-space',
  fontId: 'deep-space',
  returnToReview: true,
};

describe('OnboardingDraftStore', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('round-trips the versioned device draft', () => {
    saveOnboardingDraft(draft);

    expect(loadOnboardingDraft()).toEqual(draft);
    expect(JSON.parse(mockMemory.get(ONBOARDING_DRAFT_KEY)!)).toMatchObject({
      version: 1,
      stage: 'review',
      name: 'Sahil',
      returnToReview: true,
    });
  });

  it('ignores malformed and unsupported draft versions', () => {
    mockMemory.set(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...draft, version: 2 }));
    expect(loadOnboardingDraft()).toBeUndefined();

    mockMemory.set(ONBOARDING_DRAFT_KEY, '{not-json');
    expect(loadOnboardingDraft()).toBeUndefined();
  });

  it('clears the draft without touching other device storage', () => {
    saveOnboardingDraft(draft);
    clearOnboardingDraft();

    expect(loadOnboardingDraft()).toBeUndefined();
    expect(storage.remove).toHaveBeenCalledWith(ONBOARDING_DRAFT_KEY);
  });
});
