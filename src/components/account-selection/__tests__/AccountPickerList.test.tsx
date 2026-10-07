import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { SectionList } from 'react-native';
import { AccountPickerList, AccountPickerPill } from '../AccountPickerList';
import { getLayoutPath } from '@/src/testing/layoutAssertions';

jest.mock('@/src/hooks/useAccountDisplayPrefs', () => ({
  useAccountDisplayPrefs: () => ({ useCompactAccountPicker: true }),
}));

const accounts = Array.from({ length: 250 }, (_, index) => ({
  id: asAccountId(`account-${index}`),
  name: `Account ${index}`,
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
})) as AccountFields[];

it('virtualizes compact modal pills in bounded groups without losing accounts or selection', () => {
  const onSelect = jest.fn();
  const view = render(
    <ArchiveVisibilityScopeProvider>
      <AccountPickerList
        accounts={accounts}
        selectedIds={new Set()}
        onSelect={onSelect}
        onClose={jest.fn()}
        isMultiple={false}
      />
    </ArchiveVisibilityScopeProvider>,
  );

  const list = view.UNSAFE_getByType(SectionList);
  const [section] = list.props.sections;
  expect(section.accountCount).toBe(250);
  expect(section.data).toHaveLength(11);
  expect(section.data.every((chunk: AccountFields[]) => chunk.length <= 24)).toBe(true);
  expect(section.data.flat().map((account: AccountFields) => account.id)).toEqual(
    accounts.map(account => account.id),
  );

  fireEvent.press(screen.getByTestId('account-picker-option-account-0'));
  expect(onSelect).toHaveBeenCalledWith(accounts[0].id);
});

it('keeps a single-select pill footprint unchanged when its checkmark appears', () => {
  const item = accounts[0];
  const view = render(<AccountPickerPill item={item} isSelected={false} />);
  const originalLayout = getLayoutPath(view.getByText(item.name));
  const originalSlots = view.getByTestId(`account-picker-option-${item.id}`).children.length;
  view.rerender(<AccountPickerPill item={item} isSelected />);
  expect(getLayoutPath(view.getByText(item.name))).toEqual(originalLayout);
  expect(view.getByTestId(`account-picker-option-${item.id}`).children).toHaveLength(originalSlots);
});
