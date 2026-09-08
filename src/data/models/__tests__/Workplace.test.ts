import { DEFAULT_WORKPLACE_ICON, toWorkplaceIcon } from '@/src/data/models/Workplace';

describe('toWorkplaceIcon', () => {
  it('keeps registered icons', () => {
    expect(toWorkplaceIcon('home')).toBe('home');
  });

  it('falls back to the default workplace icon', () => {
    expect(toWorkplaceIcon('not-an-icon')).toBe(DEFAULT_WORKPLACE_ICON);
    expect(toWorkplaceIcon(undefined)).toBe(DEFAULT_WORKPLACE_ICON);
  });
});
