import { trackWidgetLaunch, useWidgetLaunchTracking } from '../useWidgetLaunchTracking';
import { analytics } from '@/src/services/analytics';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

jest.mock('@/src/services/analytics', () => ({ analytics: { track: jest.fn() } }));

const mockTrack = analytics.track as jest.Mock;

describe('widget launch tracking', () => {
  beforeEach(() => mockTrack.mockClear());

  it('records widget opens by destination and ignores other links', () => {
    trackWidgetLaunch('fullfrillsbalance://?source=widget');
    trackWidgetLaunch('fullfrillsbalance://journal-entry?mode=simple&type=expense&source=widget');
    trackWidgetLaunch('fullfrillsbalance://journal-entry?mode=simple&type=expense');
    trackWidgetLaunch('fullfrillsbalance://');
    trackWidgetLaunch('fullfrillsbalance://?source=widgets');
    trackWidgetLaunch(null);

    expect(mockTrack.mock.calls).toEqual([
      ['entrypoint_opened', { screen: 'index', entrypoint: 'widget' }],
      ['entrypoint_opened', { screen: 'journal-entry', entrypoint: 'widget' }],
    ]);
  });

  it('tracks the cold-start URL and later widget taps', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('fullfrillsbalance://?source=widget');
    let onUrl: ((event: { url: string }) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => {
      onUrl = listener;
      return { remove } as unknown as ReturnType<typeof Linking.addEventListener>;
    });

    const { unmount } = renderHook(() => useWidgetLaunchTracking());
    await waitFor(() => expect(mockTrack).toHaveBeenCalledTimes(1));
    onUrl?.({ url: 'fullfrillsbalance://?source=widget' });
    expect(mockTrack).toHaveBeenCalledTimes(2);

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
