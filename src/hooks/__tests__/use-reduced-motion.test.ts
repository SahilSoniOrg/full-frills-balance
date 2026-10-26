import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useDeviceReduceMotionPreference } from '@/src/hooks/useDeviceMotionPrefs';

const mockRemove = jest.fn();
const mockNativeQuery = jest.fn((): Promise<boolean> => Promise.resolve(false));
const mockNativeSubscribe = jest.fn((_: string, _handler: (enabled: boolean) => void) => ({
  remove: mockRemove,
}));

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: () => mockNativeQuery(),
    addEventListener: (event: string, handler: (enabled: boolean) => void) =>
      mockNativeSubscribe(event, handler),
  },
}));

jest.mock('@/src/hooks/useDeviceMotionPrefs', () => ({
  useDeviceReduceMotionPreference: jest.fn(() => false),
}));

describe('useReducedMotion', () => {
  let emitSystemChange: (enabled: boolean) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDeviceReduceMotionPreference).mockReturnValue(false);
    mockNativeSubscribe.mockImplementation((_, handler) => {
      emitSystemChange = handler;
      return { remove: mockRemove };
    });
    mockNativeQuery.mockResolvedValue(false);
  });

  it('shares one native query and listener across mounted consumers and releases the last one', async () => {
    const first = renderHook(useReducedMotion);
    const second = renderHook(useReducedMotion);
    await waitFor(() => expect(first.result.current).toBe(false));

    expect(mockNativeQuery).toHaveBeenCalledTimes(1);
    expect(mockNativeSubscribe).toHaveBeenCalledTimes(1);
    act(() => emitSystemChange(true));
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);

    first.unmount();
    expect(mockRemove).not.toHaveBeenCalled();
    second.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer system event when the initial query resolves late', async () => {
    let resolveInitial: (enabled: boolean) => void = () => undefined;
    mockNativeQuery.mockReturnValue(
      new Promise(resolve => {
        resolveInitial = resolve;
      }),
    );
    const consumer = renderHook(useReducedMotion);
    act(() => emitSystemChange(true));
    await act(async () => resolveInitial(false));
    expect(consumer.result.current).toBe(true);
    consumer.unmount();
  });

  it('combines the live device preference with the system setting', async () => {
    jest.mocked(useDeviceReduceMotionPreference).mockReturnValue(true);
    const consumer = renderHook(useReducedMotion);
    await act(async () => emitSystemChange(false));
    expect(consumer.result.current).toBe(true);
    jest.mocked(useDeviceReduceMotionPreference).mockReturnValue(false);
    consumer.rerender({});
    expect(consumer.result.current).toBe(false);
    consumer.unmount();
  });
});
