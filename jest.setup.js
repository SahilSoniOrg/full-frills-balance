/* global jest, afterEach */
// Mock Platform before any other imports
import '@testing-library/jest-native/extend-expect';

jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const Platform = {
    OS: 'ios',
    Version: '14.0',
    select: jest.fn(obj => obj.ios || obj.default || obj.native),
    constants: {},
    isPad: false,
    isTVOS: false,
    isTV: false,
  };
  return {
    __esModule: true,
    default: Platform,
    ...Platform, // Also export as named exports
  };
});

// Mock database adapter to use LokiJS for tests
jest.mock('@/src/data/database/adapter', () =>
  jest.requireActual('./src/data/database/adapter.ts'),
);

// Mock AsyncStorage
jest.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: jest.fn(() => ({})),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock MMKV
jest.mock('react-native-mmkv', () => {
  const mmkvMock = {
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    getBuffer: jest.fn(),
    contains: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    getAllKeys: jest.fn().mockReturnValue([]),
    clearAll: jest.fn(),
    recrypt: jest.fn(),
    onValueChanged: jest.fn(),
  };
  return {
    createMMKV: jest.fn().mockImplementation(() => mmkvMock),
  };
});

// Mock Native Modules and Device Info
jest.mock('react-native/Libraries/Utilities/NativeDeviceInfo', () => ({
  default: {
    getConstants: () => ({
      Dimensions: {
        window: { fontScale: 1, height: 1334, scale: 2, width: 750 },
        screen: { fontScale: 1, height: 1334, scale: 2, width: 750 },
      },
    }),
  },
}));

jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  __esModule: true,
  default: {
    get: key => ({ width: 750, height: 1334, scale: 2, fontScale: 1 }),
    set: () => {},
    addEventListener: () => ({ remove: () => {} }),
    removeEventListener: () => {},
  },
}));

jest.mock('react-native/Libraries/Utilities/PixelRatio', () => ({
  __esModule: true,
  default: {
    get: () => 2,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: size => size * 2,
    roundToNearestPixel: size => size,
  },
}));

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock Share API
jest.mock('react-native/Libraries/Share/Share', () => {
  const shareFn = jest.fn().mockImplementation(content => {
    if (!content || (!content.message && !content.url)) {
      return Promise.reject(new Error('Nothing to share'));
    }
    return Promise.resolve({ action: 'sharedAction' });
  });
  return {
    __esModule: true,
    default: { share: shareFn },
    share: shareFn,
  };
});

// Mock StatusBar
jest.mock('react-native/Libraries/Components/StatusBar/StatusBar', () => {
  return {
    __esModule: true,
    default: () => null,
  };
});

// Mock Expo modules
jest.mock('expo-font');
jest.mock('expo-asset');
jest.mock('expo-device', () => ({
  deviceName: 'Test Device',
  modelName: 'Test Model',
  osName: 'iOS',
  osVersion: '14.0',
  deviceType: 1, // PHONE
  DeviceType: {
    UNKNOWN: 0,
    PHONE: 1,
    TABLET: 2,
    TV: 3,
    DESKTOP: 4,
  },
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', currencyCode: 'USD' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));
jest.mock('@react-navigation/native', () => ({
  ThemeProvider: children => children,
  useTheme: () => ({
    colors: {
      primary: '#007AFF',
      background: '#FFFFFF',
      card: '#FFFFFF',
      text: '#000000',
      border: '#E5E5E5',
      notification: '#FF3B30',
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '900' },
    },
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useNavigation: () => ({
    isFocused: () => true,
  }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
}));

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri;
    exists = true;
    constructor(uri) {
      this.uri = uri;
    }
    create() {}
  }
  class MockFile {
    uri;
    exists = true;
    constructor(uri) {
      this.uri = uri;
    }
  }
  return {
    documentDirectory: 'test-dir/',
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    Paths: {
      document: {
        uri: 'test-dir/',
      },
      cache: {
        uri: 'test-cache-dir/',
      },
    },
    Directory: MockDirectory,
    File: MockFile,
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue({}),
}));

// Mock native crypto and nitro modules
jest.mock('react-native-quick-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random(),
  default: {
    randomUUID: () => 'test-uuid-' + Math.random(),
  },
}));

// Mock NitroModules TurboModule
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => ({
  getEnforcing: name => ({}),
  get: name => ({}),
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn().mockReturnValue({}),
  },
  createNitroModule: jest.fn(),
}));

// Mock PostHog
jest.mock('posthog-react-native', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      capture: jest.fn(),
      identify: jest.fn(),
      reset: jest.fn(),
    })),
    PostHogProvider: ({ children }) => children,
    usePostHog: () => ({
      capture: jest.fn(),
    }),
  };
});

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  setContext: jest.fn(),
  reactNavigationIntegration: jest.fn(),
  reactNativeTracingIntegration: jest.fn(),
  mobileReplayIntegration: jest.fn(),
}));

// Global fetch mock to prevent network hangs
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }),
);

// Mock I18nManager
jest.mock('react-native/Libraries/ReactNative/I18nManager', () => ({
  isRTL: false,
  allowRTL: jest.fn(),
  forceRTL: jest.fn(),
  getConstants: () => ({
    isRTL: false,
  }),
}));

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    default: {
      call: jest.fn(),
    },
    useSharedValue: jest.fn(val => ({ value: val })),
    useAnimatedStyle: jest.fn(fn => ({})),
    useAnimatedGestureHandler: jest.fn(handlers => ({})),
    useAnimatedScrollHandler: jest.fn(fn => ({})),
    withTiming: jest.fn((toValue, config, cb) => toValue),
    withSpring: jest.fn((toValue, config, cb) => toValue),
    withDecay: jest.fn((config, cb) => 0),
    cancelAnimation: jest.fn(),
    runOnJS: jest.fn(fn => fn),
    runOnUI: jest.fn(fn => fn),
    interpolate: jest.fn((x, input, output, type) => 0),
    Extrapolation: { CLAMP: 'clamp' },
    View: View,
    Text: View,
    ScrollView: View,
    Image: View,
    createAnimatedComponent: jest.fn(c => c),
    FadeIn: { duration: jest.fn(() => ({ delay: jest.fn() })) },
    FadeOut: { duration: jest.fn(() => ({ delay: jest.fn() })) },
    SlideInRight: { duration: jest.fn(() => ({ delay: jest.fn() })) },
    SlideOutLeft: { duration: jest.fn(() => ({ delay: jest.fn() })) },
  };
});

// Mock Moti
jest.mock('moti', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    View,
    AnimatePresence: ({ children }) => children,
    MotiView: View,
    useAnimationState: () => ({
      transitionTo: jest.fn(),
    }),
    useDynamicAnimation: () => ({
      animateTo: jest.fn(),
    }),
  };
});

// Mock Gesture Handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: ScrollView,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(c => c),
    Directions: {},
  };
});

// Flush rebuild queue and clear all mocks between tests
afterEach(async () => {
  jest.clearAllMocks();
  try {
    // Only require if already loaded to avoid side effects in minimal tests
    const { rebuildQueueService } = require('./src/services/RebuildQueueService');
    if (rebuildQueueService) {
      await rebuildQueueService.flush();
      rebuildQueueService.stop();
    }
  } catch (_e) {
    // Service may not be available in all test contexts
  }
});
