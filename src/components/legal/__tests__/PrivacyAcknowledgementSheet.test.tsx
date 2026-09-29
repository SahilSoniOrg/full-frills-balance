import { render, screen } from '@/src/utils/test-utils';
import { PrivacyAcknowledgementSheet } from '../PrivacyAcknowledgementSheet';

jest.mock('@/src/components/overlays/InfoSheet', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    InfoSheet: ({ useNativeModal }: { useNativeModal?: boolean }) => (
      <View testID={useNativeModal ? 'native-privacy-modal' : 'e2e-privacy-overlay'} />
    ),
  };
});

describe('PrivacyAcknowledgementSheet presentation', () => {
  const originalE2eFlag = process.env.EXPO_PUBLIC_E2E;

  afterEach(() => {
    if (originalE2eFlag === undefined) delete process.env.EXPO_PUBLIC_E2E;
    else process.env.EXPO_PUBLIC_E2E = originalE2eFlag;
  });

  it('uses the native modal outside the Detox build', () => {
    process.env.EXPO_PUBLIC_E2E = '0';

    render(
      <PrivacyAcknowledgementSheet
        visible
        onClose={() => {}}
        onOpenFullPolicy={() => {}}
        onAcknowledge={() => {}}
      />,
    );

    expect(screen.getByTestId('native-privacy-modal')).toBeOnTheScreen();
  });

  it('uses the in-tree overlay in Detox to avoid the iOS modal transition stall', () => {
    process.env.EXPO_PUBLIC_E2E = '1';

    render(
      <PrivacyAcknowledgementSheet
        visible
        onClose={() => {}}
        onOpenFullPolicy={() => {}}
        onAcknowledge={() => {}}
      />,
    );

    expect(screen.getByTestId('e2e-privacy-overlay')).toBeOnTheScreen();
  });
});
