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

  it.each([
    { e2e: '0', testId: 'native-privacy-modal' },
    { e2e: '1', testId: 'e2e-privacy-overlay' },
  ])('uses $testId when EXPO_PUBLIC_E2E is $e2e', ({ e2e, testId }) => {
    process.env.EXPO_PUBLIC_E2E = e2e;

    render(
      <PrivacyAcknowledgementSheet
        visible
        onClose={() => {}}
        onOpenFullPolicy={() => {}}
        onAcknowledge={() => {}}
      />,
    );

    expect(screen.getByTestId(testId)).toBeOnTheScreen();
  });
});
