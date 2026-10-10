import fs from 'fs';
import path from 'path';

/**
 * Tappable rows with a trailing chevron must be ListRow (`chevron` / ListRow.Chevron).
 * Files below are not list rows: steppers, collapsible headers, chips, rich cards.
 */
const ALLOWED = new Set([
  'components/core/ListRow.tsx',
  'components/filters/DateRangeTrigger.tsx',
  'components/filters/CustomDateTimePicker/DateView.tsx',
  'components/journal/JournalDayHeader.tsx',
  'components/shared/PeriodStepper.tsx',
  'components/shared/SelectionActionBar.tsx',
  'components/account-selection/AccountPickerList.tsx',
  'components/forms/schedule/ScheduleField.tsx',
  'features/accounts/components/AccountParentPath.tsx',
  'features/accounts/components/AccountsListView.tsx',
  'features/accounts/components/AccountSummaryCard.tsx',
  'features/accounts/components/CurrencySelector.tsx',
  'features/accounts/components/hierarchy/AccountManagementTreeRow.tsx',
  'features/dashboard/components/SafeToSpendLedger.tsx',
  'features/hub/components/HubWidget.tsx',
  'features/journal/components/details/JournalEntries.tsx',
  'features/reports-v2/screen/components/ReportsV2Breakdown.tsx',
  'features/reports-v2/screen/components/ReportsV2QualityBanner.tsx',
  'features/settings/components/DataExportSection.tsx',
  'features/setup/first-run/conversationUi.tsx',
]);

const SRC = path.resolve(__dirname, '../../..');
const TOUCHABLE = /<(PressScaleTouchable|TouchableOpacity|TouchableHighlight|Pressable)\b/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('chevron rows', () => {
  it('builds tappable chevron rows with ListRow, not raw touchables', () => {
    const offenders = walk(SRC)
      .map(file => path.relative(SRC, file).split(path.sep).join('/'))
      .filter(rel => !ALLOWED.has(rel))
      .filter(rel => {
        const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
        return source.includes('Icon.ChevronRight') && TOUCHABLE.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
