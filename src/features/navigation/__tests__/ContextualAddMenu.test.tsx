import { fireEvent, render, screen, waitFor } from '@/src/testing/render';
import { ContextualAddMenu } from '../ContextualAddMenu';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ activeWorkplace: { id: 'wp-1', name: 'Personal' } }),
}));
jest.mock('@/src/navigation/primaryPageNavigation', () => ({
  usePrimaryPageNavigation: () => undefined,
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: { track: jest.fn() },
}));
jest.mock('@/src/components/overlays/ModalHost', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ModalHost: ({
      visible,
      onDismiss,
      children,
    }: {
      visible: boolean;
      onDismiss?: () => void;
      children: React.ReactNode;
    }) => {
      const wasVisible = React.useRef(false);
      React.useEffect(() => {
        const closed = wasVisible.current && !visible;
        wasVisible.current = visible;
        if (closed) onDismiss?.();
      }, [visible, onDismiss]);
      return visible ? <View>{children}</View> : null;
    },
  };
});

describe('ContextualAddMenu', () => {
  it('closes the modal before dispatching the chosen action on dismiss', async () => {
    const onAction = jest.fn();
    render(<ContextualAddMenu primaryTab="accounts" onAction={onAction} />);

    fireEvent.press(screen.getByTestId('contextual-add-trigger'));
    fireEvent.press(screen.getByTestId('contextual-add-account'));

    await waitFor(() => expect(onAction).toHaveBeenCalledWith('account'));
    expect(screen.queryByTestId('contextual-add-account')).toBeNull();
  });
});
