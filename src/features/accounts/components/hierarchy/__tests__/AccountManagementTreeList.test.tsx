import { AccountManagementTreeList } from '../AccountManagementTreeList';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));

describe('AccountManagementTreeList', () => {
  it('runs the draft save action when Save is pressed in Organize mode', () => {
    const onSaveDraft = jest.fn();

    render(
      <AccountManagementTreeList
        accounts={[]}
        rows={[]}
        balancesByAccountId={new Map()}
        pendingAccountIds={new Set()}
        pendingPreviews={new Map()}
        isDraftDirty
        pendingChangeCount={1}
        isSavingDraft={false}
        isOrganizing
        onDrop={jest.fn()}
        onSaveDraft={onSaveDraft}
        onDiscardDraft={jest.fn()}
        onSelectAccount={jest.fn()}
        onToggleExpand={jest.fn()}
        onCreateParent={jest.fn()}
        onToggleOrganize={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Save'));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });
});
