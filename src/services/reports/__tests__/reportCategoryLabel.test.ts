import { formatCategoryLabel } from '@/src/services/reports/reportCategoryLabel';
import { AppConfig } from '@/src/constants/app-config';

describe('formatCategoryLabel', () => {
  it('formats account subtype enums for display', () => {
    expect(formatCategoryLabel('FOOD')).toBe('Food');
    expect(formatCategoryLabel('BANK_CHECKING')).toBe('Bank Checking');
  });

  it('preserves uncategorized display labels', () => {
    expect(formatCategoryLabel(AppConfig.strings.reports.categoryOther)).toBe(
      AppConfig.strings.reports.categoryOther,
    );
  });
});
