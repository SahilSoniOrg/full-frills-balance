import { AccountType } from '@/src/types/enums';
import { shouldShowAccountMatchersSection } from '../accountMatcherSectionPolicy';

const eligible = {
  featureEnabled: true,
  isEditMode: true,
  isParent: false,
  isCategory: false,
  accountType: AccountType.ASSET,
} as const;

describe('shouldShowAccountMatchersSection', () => {
  it('shows the matcher section for an eligible edited financial leaf account', () => {
    expect(shouldShowAccountMatchersSection(eligible)).toBe(true);
    expect(
      shouldShowAccountMatchersSection({ ...eligible, accountType: AccountType.LIABILITY }),
    ).toBe(true);
  });

  it.each([
    ['feature disabled', { featureEnabled: false }],
    ['account is new', { isEditMode: false }],
    ['account has children', { isParent: true }],
    ['category', { isCategory: true }],
    ['non-financial account', { accountType: AccountType.EQUITY }],
  ])('hides the section when %s', (_label, change) => {
    expect(shouldShowAccountMatchersSection({ ...eligible, ...change })).toBe(false);
  });
});
