import { BulkActionModalSurface } from '@/src/components/common/BulkActionModalSurface';
import { fireEvent, render } from '@/src/utils/test-utils';
import { Text } from 'react-native';

describe('BulkActionModalSurface', () => {
  it('renders modal title, count badge, and children', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    const { getByText, getByTestId } = render(
      <BulkActionModalSurface
        visible={true}
        onClose={onClose}
        title="Edit Items"
        itemCount={3}
        onConfirm={onConfirm}
        confirmLabel="Apply"
        testID="test-modal"
      >
        <Text>Modal Inner Content</Text>
      </BulkActionModalSurface>,
    );

    expect(getByText('Edit Items')).toBeTruthy();
    expect(getByText('3 items')).toBeTruthy();
    expect(getByText('Modal Inner Content')).toBeTruthy();

    const confirmBtn = getByTestId('test-modal-confirm');
    expect(confirmBtn).toBeTruthy();
    fireEvent.press(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancelBtn = getByTestId('test-modal-cancel');
    fireEvent.press(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
