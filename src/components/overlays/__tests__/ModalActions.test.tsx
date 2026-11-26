import { ModalActions, ModalActionsSurfaceContext } from '../ModalActions';
import { render, screen } from '@/src/testing/render';

describe('ModalActions', () => {
  it('keeps non-secondary actions in the primary column instead of demoting them to dismiss', () => {
    render(
      <ModalActionsSurfaceContext.Provider value="center">
        <ModalActions
          layout="primary"
          actions={[
            { label: 'Delete', role: 'primary', variant: 'destructive', onPress: jest.fn() },
            { label: 'Archive', role: 'primary', onPress: jest.fn() },
            { label: 'Cancel', role: 'secondary', onPress: jest.fn() },
          ]}
        />
      </ModalActionsSurfaceContext.Provider>,
    );

    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('places only role=secondary actions in the dismiss row for primary layout', () => {
    render(
      <ModalActionsSurfaceContext.Provider value="bottomSheet">
        <ModalActions
          layout="primary"
          actions={[
            { label: 'Save', role: 'primary', onPress: jest.fn(), testID: 'save' },
            { label: 'Dismiss', role: 'secondary', onPress: jest.fn(), testID: 'dismiss' },
          ]}
        />
      </ModalActionsSurfaceContext.Provider>,
    );

    expect(screen.getByTestId('save')).toBeTruthy();
    expect(screen.getByTestId('dismiss')).toBeTruthy();
  });
});
