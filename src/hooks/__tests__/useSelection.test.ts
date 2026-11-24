import { useSelection } from '@/src/hooks/useSelection';
import { act, renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { useNavigation } from 'expo-router';

// Mock expo-router
jest.mock('expo-router', () => ({
  useNavigation: jest.fn(),
}));

describe('useSelection', () => {
  let mockNavigation: any;
  let backPressListeners: (() => boolean)[] = [];
  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    backPressListeners = [];

    // Mock BackHandler addEventListener using spyOn
    addEventListenerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, callback) => {
        if (event === 'hardwareBackPress') {
          backPressListeners.push(callback as () => boolean);
        }
        return {
          remove: jest.fn(() => {
            backPressListeners = backPressListeners.filter(cb => cb !== callback);
          }),
        } as any;
      });

    mockNavigation = {
      isFocused: jest.fn(() => true),
    };
    (useNavigation as jest.Mock).mockReturnValue(mockNavigation);
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
  });

  it('should initialize correctly', () => {
    const { result } = renderHook(() => useSelection<string>());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectionModeActive).toBe(false);
  });

  it('should toggle selection correctly', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => {
      result.current.toggleSelection('1');
    });
    expect(result.current.selectedIds.has('1')).toBe(true);

    act(() => {
      result.current.toggleSelection('1');
    });
    expect(result.current.selectedIds.has('1')).toBe(false);
  });

  it('should activate selection mode on long press', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => {
      result.current.onLongPressItem('1');
    });
    expect(result.current.isSelectionModeActive).toBe(true);
    expect(result.current.selectedIds.has('1')).toBe(true);
  });

  it('clears items without exiting selection mode and exits separately', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.onLongPressItem('a'));
    act(() => result.current.clearItems());

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectionModeActive).toBe(true);

    act(() => result.current.exitSelectionMode());
    expect(result.current.isSelectionModeActive).toBe(false);
  });

  it('selects and deselects a group based on its members', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.onLongPressItem('outside'));
    act(() => result.current.toggleSelection('a'));
    act(() => result.current.toggleMultiple(['a', 'b']));
    expect(result.current.selectedIds).toEqual(new Set(['outside', 'a', 'b']));

    act(() => result.current.toggleMultiple(['a', 'b']));
    expect(result.current.selectedIds).toEqual(new Set(['outside']));
    expect(result.current.isSelectionModeActive).toBe(true);
  });

  it('replaces the selection with the select-all scope', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.onLongPressItem('hidden'));
    act(() => result.current.selectAll(['a', 'b', 'a']));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b']));
    expect(result.current.isSelectionModeActive).toBe(true);
  });

  it('should handle hardware back press when selection is active and screen is focused', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => {
      result.current.onLongPressItem('1');
    });
    expect(result.current.isSelectionModeActive).toBe(true);
    expect(backPressListeners.length).toBe(1);

    // Simulate back button press
    let preventedDefault = false;
    act(() => {
      preventedDefault = backPressListeners[0]();
    });

    expect(preventedDefault).toBe(true);
    expect(result.current.isSelectionModeActive).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('should NOT intercept hardware back press when selection is active but screen is NOT focused', () => {
    const { result } = renderHook(() => useSelection<string>());
    mockNavigation.isFocused.mockReturnValue(false);

    act(() => {
      result.current.onLongPressItem('1');
    });
    expect(result.current.isSelectionModeActive).toBe(true);

    // Simulate back button press
    let preventedDefault = true;
    act(() => {
      preventedDefault = backPressListeners[0]();
    });

    expect(preventedDefault).toBe(false);
    expect(result.current.isSelectionModeActive).toBe(true); // remains active
  });

  it('should not register BackHandler listener when selection is not active', () => {
    renderHook(() => useSelection<string>());
    expect(backPressListeners.length).toBe(0);
  });
});
