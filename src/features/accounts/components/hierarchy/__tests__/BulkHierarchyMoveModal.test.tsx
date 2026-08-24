import { BulkHierarchyMoveModal } from '../BulkHierarchyMoveModal';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { act, fireEvent, render } from '@/src/utils/test-utils';

const mockCandidates = [
  {
    id: 'parent-1' as AccountId,
    name: 'Parent Asset Account',
    accountType: AccountType.ASSET,
    icon: 'folder' as const,
  },
  {
    id: 'parent-2' as AccountId,
    name: 'Parent Bank Account',
    accountType: AccountType.ASSET,
    icon: 'bank' as const,
  },
];

describe('BulkHierarchyMoveModal', () => {
  it('renders destination options and fires onAssignParent when selected', async () => {
    const onAssignParent = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <BulkHierarchyMoveModal
        visible={true}
        selectedCount={2}
        parentCandidates={mockCandidates as any}
        onClose={onClose}
        onAssignParent={onAssignParent}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText('None (Root Level)'));
    });
    expect(onAssignParent).toHaveBeenCalledWith(null);

    await act(async () => {
      fireEvent.press(getByText('Parent Bank Account'));
    });
    expect(onAssignParent).toHaveBeenCalledWith('parent-2');
  });
});
