import { act, render } from '@/src/testing/render';
import { BackHandler, Platform, Text } from 'react-native';
import { ModalHost } from '../ModalHost';

describe('ModalHost', () => {
  it('intercepts Android hardware Back on inline overlays when onRequestClose is set', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    let listeners: (() => boolean)[] = [];
    const spy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, callback) => {
        if (event === 'hardwareBackPress') listeners.push(callback as () => boolean);
        return {
          remove: () => {
            listeners = listeners.filter(item => item !== callback);
          },
        } as never;
      });

    try {
      const onRequestClose = jest.fn();
      const { rerender } = render(
        <ModalHost visible useNativeModal={false} onRequestClose={onRequestClose}>
          <Text>Inline confirm</Text>
        </ModalHost>,
      );

      expect(listeners).toHaveLength(1);
      act(() => {
        expect(listeners[0]()).toBe(true);
      });
      expect(onRequestClose).toHaveBeenCalledTimes(1);

      rerender(
        <ModalHost visible={false} useNativeModal={false} onRequestClose={onRequestClose}>
          <Text>Inline confirm</Text>
        </ModalHost>,
      );
      expect(listeners).toHaveLength(0);
    } finally {
      spy.mockRestore();
      platform.restore();
    }
  });
});
