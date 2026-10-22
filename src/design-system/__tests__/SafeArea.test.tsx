import { Text, StyleSheet, View } from 'react-native';
import { SafeAreaView, type EdgeInsets } from 'react-native-safe-area-context';
import { render, screen } from '@/src/utils/test-utils';
import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import { AppCard } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Page } from '../Page';
import {
  SafeAreaFrame,
  SafeAreaScope,
  useSafeAreaLayout,
  useWindowSafeAreaLayout,
} from '../SafeArea';

let mockInsets: EdgeInsets = { top: 24, right: 0, bottom: 34, left: 0 };
let mockKeyboardVisible = false;

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('../Keyboard', () => ({
  useKeyboard: () => ({
    isKeyboardVisible: mockKeyboardVisible,
    keyboardHeight: 0,
    dismiss: jest.fn(),
  }),
}));

function Probe({ id = 'probe' }: { id?: string }) {
  const layout = useSafeAreaLayout();
  const window = useWindowSafeAreaLayout();
  return (
    <Text testID={id}>
      {JSON.stringify({ insets: layout.insets, windowInsets: window.insets })}
    </Text>
  );
}

function footerPadding() {
  const footer = screen.UNSAFE_getByType(SubmitFooter).findAllByType(View)[0];
  return StyleSheet.flatten(footer.props.style).paddingBottom;
}

const footer = <SubmitFooter label="Save" onPress={jest.fn()} disabled={false} />;

describe('root safe-area ownership', () => {
  beforeEach(() => {
    mockInsets = { top: 24, right: 0, bottom: 34, left: 0 };
    mockKeyboardVisible = false;
  });

  it('applies the home-indicator inset once when the page already pads its footer', () => {
    render(
      <Page footer={footer}>
        <Probe />
      </Page>,
    );
    expect(footerPadding()).toBe(16);
    expect(JSON.parse(screen.getByTestId('probe').props.children).insets.bottom).toBe(0);
  });

  it('includes safe-area padding in the initial render of a newly mounted tab', () => {
    function Tab({ name }: { name: string }) {
      return (
        <SafeAreaScope consumedEdges={['bottom']}>
          <Page key={name}>
            <Text>{name}</Text>
          </Page>
        </SafeAreaScope>
      );
    }
    const { rerender } = render(<Tab name="Activity" />);
    const padding = () =>
      StyleSheet.flatten(screen.UNSAFE_getByType(SafeAreaFrame).findAllByType(View)[0].props.style);
    expect(padding()).toMatchObject({ paddingTop: 24, paddingBottom: 0 });
    rerender(<Tab name="Commitments" />);
    expect(padding()).toMatchObject({ paddingTop: 24, paddingBottom: 0 });
    rerender(<Tab name="Accounts" />);
    expect(padding()).toMatchObject({ paddingTop: 24, paddingBottom: 0 });
    expect(screen.UNSAFE_queryAllByType(SafeAreaView)).toHaveLength(0);
  });

  it('does not pad the same native edges again inside a nested page', () => {
    render(
      <Page>
        <Page>
          <Probe />
        </Page>
      </Page>,
    );
    const containers = screen.UNSAFE_getAllByType(SafeAreaFrame);
    expect(containers[0].props.edges).toEqual(['top', 'bottom', 'left', 'right']);
    expect(containers[1].props.edges).toEqual([]);
  });

  it('lets an edge-to-edge form footer own its bottom inset', () => {
    render(
      <Page edges={['top', 'left', 'right']} footer={footer}>
        <Probe />
      </Page>,
    );
    expect(footerPadding()).toBe(46);
  });

  it('removes home-indicator padding while the keyboard is open', () => {
    mockKeyboardVisible = true;
    render(
      <Page keyboardAvoiding footer={footer}>
        <Probe />
      </Page>,
    );
    expect(footerPadding()).toBe(12);
  });

  it('does not add system bottom padding above a tab bar that already owns it', () => {
    render(
      <SafeAreaScope consumedEdges={['bottom']}>
        <Page footer={footer}>
          <Probe />
        </Page>
      </SafeAreaScope>,
    );
    expect(footerPadding()).toBe(16);
  });

  it('keeps full window insets for an overlay opened from a padded page', () => {
    render(
      <Page>
        <SafeAreaScope window>
          <Probe />
        </SafeAreaScope>
      </Page>,
    );
    expect(JSON.parse(screen.getByTestId('probe').props.children).insets.bottom).toBe(34);
  });

  it('gives a bottom sheet its own inset and prevents its children from adding it again', () => {
    render(
      <Page>
        <ModalSurface
          visible
          title="Edit"
          onClose={jest.fn()}
          position="bottomSheet"
          useNativeModal={false}
        >
          <Probe />
        </ModalSurface>
      </Page>,
    );
    const card = screen.UNSAFE_getByType(AppCard);
    expect(StyleSheet.flatten(card.props.style).paddingBottom).toBe(50);
    const probe = JSON.parse(screen.getByTestId('probe').props.children);
    expect(probe.insets.bottom).toBe(0);
    expect(probe.windowInsets.bottom).toBe(34);
  });

  it('updates the shared layout for rotation and navigation-mode changes', () => {
    const { rerender } = render(
      <Page edges={['top']} footer={footer}>
        <Probe />
      </Page>,
    );
    expect(footerPadding()).toBe(46);
    mockInsets = { top: 0, right: 44, bottom: 0, left: 44 };
    rerender(
      <Page edges={['top']} footer={footer}>
        <Probe />
      </Page>,
    );
    expect(footerPadding()).toBe(16);
    expect(JSON.parse(screen.getByTestId('probe').props.children).insets).toEqual({
      top: 0,
      right: 44,
      bottom: 0,
      left: 44,
    });
  });

  it('shares the same precomputed layout between consumers with the same inset ownership', () => {
    const values: ReturnType<typeof useSafeAreaLayout>[] = [];
    function Capture() {
      values.push(useSafeAreaLayout());
      return null;
    }
    render(
      <>
        <Capture />
        <Capture />
      </>,
    );
    expect(values[0]).toBe(values[1]);
  });
});
