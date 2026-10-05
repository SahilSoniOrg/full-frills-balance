export function createSmsIntegrationStorageMock(): {
  storage: {
    getString: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
    remove: (key: string) => void;
    getBoolean: jest.Mock;
    getNumber: jest.Mock;
    contains: (key: string) => boolean;
    getAllKeys: jest.Mock;
    clearAll: jest.Mock;
  };
  migrateFromAsyncStorage: jest.Mock;
} {
  const store = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
      getBoolean: jest.fn(),
      getNumber: jest.fn(),
      contains: (key: string) => store.has(key),
      getAllKeys: jest.fn(() => Array.from(store.keys())),
      clearAll: jest.fn(() => store.clear()),
    },
    migrateFromAsyncStorage: jest.fn().mockResolvedValue(false),
  };
}

export function createSmsIntegrationExpoInboxMock(): {
  __esModule: true;
  default: { getSmsInbox: jest.Mock };
} {
  return {
    __esModule: true,
    default: {
      getSmsInbox: jest.fn(),
    },
  };
}

export function createSmsIntegrationPlatformMock(): {
  __esModule: true;
  default: Record<string, unknown>;
} {
  return {
    __esModule: true,
    default: {
      OS: 'android',
      Version: '30',
      select: jest.fn((obj: Record<string, unknown>) => obj.android || obj.default),
      constants: {
        getConstants: () => ({
          isTesting: true,
          osVersion: '30',
          systemName: 'Android',
        }),
      },
      isPad: false,
      isTVOS: false,
    },
  };
}

export function createSmsIntegrationPermissionsAndroidMock(): {
  __esModule: true;
  default: Record<string, unknown>;
} {
  return {
    __esModule: true,
    default: {
      check: jest.fn().mockResolvedValue(true),
      request: jest.fn().mockResolvedValue('granted'),
      RESULTS: { GRANTED: 'granted' },
      PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
    },
  };
}
