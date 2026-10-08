import { AccountParentPath } from '@/src/features/accounts/components/AccountParentPath';
import { asAccountId } from '@/src/types/ids';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

const ancestor = (id: string, name: string, isArchived = false) => ({
  id: asAccountId(id),
  name,
  isArchived,
});

describe('AccountParentPath', () => {
  it('renders nothing for a top-level account', () => {
    render(<AccountParentPath ancestors={[]} onOpen={jest.fn()} />);

    expect(screen.queryByTestId('account-parent-path')).toBeNull();
  });

  it('opens the tapped parent', () => {
    const onOpen = jest.fn();
    render(
      <AccountParentPath
        ancestors={[ancestor('household', 'Household'), ancestor('bills', 'Bills')]}
        onOpen={onOpen}
      />,
    );

    fireEvent.press(screen.getByLabelText('Open parent account Household'));

    expect(onOpen).toHaveBeenCalledWith('household');
  });

  it('keeps the two closest parents and shortens the rest', () => {
    render(
      <AccountParentPath
        ancestors={[
          ancestor('root', 'Everything'),
          ancestor('household', 'Household'),
          ancestor('bills', 'Bills', true),
        ]}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.queryByText('Everything')).toBeNull();
    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByLabelText('Open parent account Bills, archived')).toBeTruthy();
  });
});
