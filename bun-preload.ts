// @ts-nocheck
import { mock } from 'bun:test';
import * as ReactNativeWeb from 'react-native-web';

// Define React Native / Expo globals for Bun test runner environment
(globalThis as any).__DEV__ = process.env.NODE_ENV !== 'production';

// Alias react-native to react-native-web for bun test
mock.module('react-native', () => ({
  ...ReactNativeWeb,
  NativeModules: {
    NativeUnimoduleProxy: {
      modulesConstants: {},
    },
    ...ReactNativeWeb.NativeModules,
  },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => null,
  },
}));

// Mock MMKV storage for bun test
mock.module('react-native-mmkv', () => {
  const store = new Map<string, any>();
  return {
    MMKV: class MMKV {},
    createMMKV: () => ({
      getString: (key: string) => store.get(key) || null,
      set: (key: string, val: any) => store.set(key, val),
      getBoolean: (key: string) => !!store.get(key),
      getNumber: (key: string) => Number(store.get(key) || 0),
      contains: (key: string) => store.has(key),
      delete: (key: string) => store.delete(key),
      clearAll: () => store.clear(),
    }),
  };
});

// Mock watermelondb native modules & decorators for bun test
mock.module('@nozbe/watermelondb', () => ({
  Model: class Model {},
  Query: class Query {},
  Database: class Database {
    collections = { get: () => ({ query: () => ({ fetch: async () => [] }) }) };
  },
  appSchema: (schema: any) => schema,
  tableSchema: (schema: any) => schema,
  Q: {
    where: () => ({}),
    eq: () => ({}),
    oneOf: () => ({}),
    asc: 'asc',
    desc: 'desc',
    clause: () => ({}),
  },
}));

mock.module('@nozbe/watermelondb/decorators', () => ({
  field: () => () => {},
  date: () => () => {},
  children: () => () => {},
  relation: () => () => {},
  readonly: () => () => {},
  lazy: () => () => {},
  json: () => () => {},
  experimentalJoinTables: () => () => {},
  on: () => () => {},
  sortBy: () => () => {},
  take: () => () => {},
  observeWithColumns: () => () => {},
}));

mock.module('react-native-nitro-modules', () => ({
  NitroModules: {},
}));

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
