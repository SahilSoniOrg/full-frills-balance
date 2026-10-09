import { render, fireEvent, act } from '@/src/utils/test-utils';
import { DetailHeaderMenuActions } from '../DetailHeaderMenuActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { IconButton } from '@/src/components/core';

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { ModalSurface: ActualModalSurface } = jest.requireActual<
    typeof import('@/src/components/overlays/ModalSurface')
  >('@/src/components/overlays/ModalSurface');
  return {
    ModalSurface: (props: Parameters<typeof ActualModalSurface>[0]) => (
      <ActualModalSurface {...props} useNativeModal={false} />
    ),
  };
});

it('opens named actions from the overflow and preserves disabled states', () => {
  const edit = jest.fn();
  const remove = jest.fn();
  const screen = render(
    <DetailHeaderMenuActions
      actions={[
        { label: 'Edit', onPress: edit },
        { label: 'Delete', onPress: remove, destructive: true, disabled: true },
      ]}
    />,
  );
  fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  expect(edit).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
});

it('gives overflow and privacy actions the same round surface treatment', () => {
  const screen = render(
    <DetailHeaderMenuActions actions={[{ label: 'Edit', onPress: jest.fn() }]} />,
  );
  const buttons = screen.UNSAFE_getAllByType(IconButton);
  expect(buttons).toHaveLength(2);
  expect(buttons.map(button => button.props.variant)).toEqual(['surface', 'surface']);
});

it('omits the overflow button when there is nothing to put in it', () => {
  const screen = render(<DetailHeaderMenuActions actions={[]} />);
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  expect(screen.UNSAFE_getAllByType(IconButton)).toHaveLength(1);
});

it('waits for the native iOS sheet to dismiss before invoking an action, once only', () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const edit = jest.fn();
    const screen = render(<DetailHeaderMenuActions actions={[{ label: 'Edit', onPress: edit }]} />);
    fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).not.toHaveBeenCalled();
    const sheet = screen.UNSAFE_getByType(ModalSurface);
    expect(sheet.props.visible).toBe(false);
    act(() => sheet.props.onDismiss());
    expect(edit).toHaveBeenCalledTimes(1);
    act(() => sheet.props.onDismiss());
    expect(edit).toHaveBeenCalledTimes(1);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }
});

it('closing the menu dismisses it without invoking an action', () => {
  const edit = jest.fn();
  const screen = render(<DetailHeaderMenuActions actions={[{ label: 'Edit', onPress: edit }]} />);
  fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.press(screen.getAllByRole('button', { name: 'Close actions' })[0]);
  expect(screen.UNSAFE_getByType(ModalSurface).props.visible).toBe(false);
  act(() => screen.UNSAFE_getByType(ModalSurface).props.onDismiss());
  expect(edit).not.toHaveBeenCalled();
});
