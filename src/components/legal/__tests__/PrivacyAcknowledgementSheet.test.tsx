import { render, screen } from '@/src/testing/render';
import { PrivacyAcknowledgementSheet } from '../PrivacyAcknowledgementSheet';

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    ModalSurface: ({ useNativeModal }: { useNativeModal?: boolean }) =>
      useNativeModal ? <View testID="privacy-modal" /> : null,
  };
});

describe('PrivacyAcknowledgementSheet presentation', () => {
  it('uses the default modal host', () => {
    render(
      <PrivacyAcknowledgementSheet
        visible
        onClose={() => {}}
        onOpenFullPolicy={() => {}}
        onAcknowledge={() => {}}
      />,
    );

    expect(screen.getByTestId('privacy-modal')).toBeOnTheScreen();
  });
});
