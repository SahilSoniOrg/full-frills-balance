import { DEFAULT_ACCOUNTS } from '../defaults';
import { AccountType } from '@/src/types/enums';

describe('onboarding account defaults', () => {
  it('includes liability starters while keeping only assets preselected by the flow', () => {
    expect(DEFAULT_ACCOUNTS.some(account => account.type === AccountType.LIABILITY)).toBe(true);
    expect(DEFAULT_ACCOUNTS.filter(account => account.type === AccountType.ASSET)).toHaveLength(4);
  });
});
