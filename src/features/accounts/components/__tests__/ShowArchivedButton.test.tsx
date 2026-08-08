import { ShowArchivedButton } from '@/src/features/accounts/components/ShowArchivedButton';
import {
  ArchiveVisibilityScopeProvider,
  useArchiveVisibility,
} from '@/src/contexts/ArchiveVisibilityScope';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { Pressable, Text } from 'react-native';

function EnableShowArchived() {
  const { setShowArchived } = useArchiveVisibility();
  return (
    <Pressable testID="enable-show-archived" onPress={() => setShowArchived(true)}>
      <Text>Enable</Text>
    </Pressable>
  );
}

const activeOnly = [{ archivedAt: undefined }];
const withArchived = [{ archivedAt: new Date('2026-01-01') }];

describe('ShowArchivedButton', () => {
  it('hides when there are no archived accounts', () => {
    render(
      <ArchiveVisibilityScopeProvider>
        <ShowArchivedButton accounts={activeOnly} />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.queryByTestId('show-archived-button')).toBeNull();
  });

  it('shows when there are archived accounts', () => {
    render(
      <ArchiveVisibilityScopeProvider>
        <ShowArchivedButton accounts={withArchived} />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.getByTestId('show-archived-button')).toBeTruthy();
  });

  it('stays visible while show archived is enabled even with no archived accounts', () => {
    render(
      <ArchiveVisibilityScopeProvider>
        <ShowArchivedButton accounts={activeOnly} />
        <EnableShowArchived />
      </ArchiveVisibilityScopeProvider>,
    );

    expect(screen.queryByTestId('show-archived-button')).toBeNull();

    act(() => {
      fireEvent.press(screen.getByTestId('enable-show-archived'));
    });

    expect(screen.getByTestId('show-archived-button')).toBeTruthy();
  });
});
