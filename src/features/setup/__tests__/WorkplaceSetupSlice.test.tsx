import { render, screen } from '@/src/utils/test-utils';
import { WorkplaceSetupSlice } from '../WorkplaceSetupSlice';

describe('WorkplaceSetupSlice', () => {
  it('restores the parent checkpoint after a remount', () => {
    render(
      <WorkplaceSetupSlice
        books="starters"
        identityMode="editable"
        isCompleting={false}
        onBack={jest.fn()}
        onContinue={jest.fn()}
        resumeStep="currency"
      />,
    );

    expect(screen.getByTestId('selectable-grid-continue-button')).toBeTruthy();
    expect(screen.queryByTestId('workplace-basic-info-continue-button')).toBeNull();
  });
});
