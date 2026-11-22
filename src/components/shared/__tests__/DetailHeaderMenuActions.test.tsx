import { render, fireEvent, act } from '@/src/testing/render';
import { DetailHeaderMenuActions } from '../DetailHeaderMenuActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Icon, IconButton } from '@/src/components/core';
import { Size } from '@/src/constants';
import { Modal, Platform } from 'react-native';

let mockUseNativeModal = false;

it('puts inline actions first and the privacy toggle last, at header icon size', () => {
  const screen = render(
    <DetailHeaderMenuActions
      leadingActions={[
        {
          name: Icon.Edit,
          onPress: jest.fn(),
          testID: 'edit-action',
          accessibilityLabel: 'Edit',
        },
      ]}
      actions={[{ label: 'Delete', onPress: jest.fn() }]}
    />,
  );
  const buttons = screen.UNSAFE_getAllByType(IconButton);
  expect(buttons.map(button => button.props.testID)).toEqual([
    'edit-action',
    'detail-more-actions',
    'privacy-toggle',
  ]);
  expect(new Set(buttons.map(button => button.props.size))).toEqual(new Set([Size.iconSm]));
  expect(new Set(buttons.map(button => button.props.variant))).toEqual(new Set(['surface']));
  const toggle = screen.getByTestId('privacy-toggle');
  const initialLabel = toggle.props.accessibilityLabel;
  fireEvent.press(toggle);
  expect(screen.getByTestId('privacy-toggle').props.accessibilityLabel).not.toBe(initialLabel);
});

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { ModalSurface: ActualModalSurface } = jest.requireActual<
    typeof import('@/src/components/overlays/ModalSurface')
  >('@/src/components/overlays/ModalSurface');
  return {
    ModalSurface: (props: Parameters<typeof ActualModalSurface>[0]) => (
      <ActualModalSurface {...props} useNativeModal={mockUseNativeModal} />
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
  mockUseNativeModal = true;
  try {
    const edit = jest.fn();
    const screen = render(<DetailHeaderMenuActions actions={[{ label: 'Edit', onPress: edit }]} />);
    fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).not.toHaveBeenCalled();
    const sheet = screen.UNSAFE_getByType(ModalSurface);
    expect(sheet.props.visible).toBe(false);
    const host = screen.UNSAFE_getByType(Modal);
    act(() => host.props.onDismiss?.());
    expect(edit).toHaveBeenCalledTimes(1);
    act(() => host.props.onDismiss?.());
    expect(edit).toHaveBeenCalledTimes(1);
  } finally {
    mockUseNativeModal = false;
  }
});

it('continues after hiding the Android window without a native dismiss event', () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  mockUseNativeModal = true;
  try {
    const edit = jest.fn();
    const screen = render(<DetailHeaderMenuActions actions={[{ label: 'Edit', onPress: edit }]} />);
    fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(edit).toHaveBeenCalledTimes(1);
  } finally {
    mockUseNativeModal = false;
    platform.restore();
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
