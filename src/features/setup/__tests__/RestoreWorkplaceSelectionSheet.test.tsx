import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { RestoreWorkplaceSelectionSheet } from '../RestoreWorkplaceSelectionSheet';

describe('RestoreWorkplaceSelectionSheet', () => {
  it('supports selecting a subset and discarding all validated workplaces', () => {
    const onChange = jest.fn();
    const onConfirm = jest.fn();
    const { rerender } = render(
      <RestoreWorkplaceSelectionSheet
        visible
        workplaces={[
          { name: 'Personal', currency: 'USD', accounts: 2, categories: 1, journals: 3 },
          { name: 'Work', currency: 'EUR', accounts: 4, categories: 2, journals: 6 },
        ]}
        selectedIndexes={[0, 1]}
        onChange={onChange}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Save 2 workplaces')).toBeTruthy();
    fireEvent.press(screen.getByTestId('restore-workplace-option-1'));
    expect(onChange).toHaveBeenCalledWith([0]);

    rerender(
      <RestoreWorkplaceSelectionSheet
        visible
        workplaces={[
          { name: 'Personal', currency: 'USD' },
          { name: 'Work', currency: 'EUR' },
        ]}
        selectedIndexes={[]}
        onChange={onChange}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.press(screen.getByText('Discard all'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
