/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '.',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testMatch: ['<rootDir>/e2e/specs/**/*.e2e.ts'],
  testTimeout: 300000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/e2e/support/slowEmulatorTimeout.js'],
  moduleNameMapper: {
    // Same `@/` root alias as tsconfig paths. The Detox Jest config does not use jest-expo.
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*)',
  ],
};
