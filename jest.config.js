module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/react-native|native-base|react-native-svg|@nozbe/watermelondb|moti)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/.worktrees/'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/babel.config.js',
    '!**/jest.setup.js',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^lucide-react-native/dist/esm/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1',
    '^@/src/data/database/adapter$': '<rootDir>/src/data/database/adapter.ts',
    idGenerator$: '<rootDir>/src/data/database/idGenerator.ts',
    '^@/src/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/jest.platform-mock.js'],
  coverageThreshold: {
    './src/services/accounting/*.ts': {
      branches: 0,
      statements: 0,
    },
    './src/services/accounting/BalanceEffects.ts': {
      branches: 80,
      statements: 90,
    },
    './src/services/accounting/JournalValidation.ts': {
      branches: 99,
      statements: 99,
    },
    './src/services/accounting/accountingHelpers.ts': {
      branches: 83,
      statements: 99,
    },
    './src/services/accounting/journalPresenter.ts': {
      branches: 81,
      statements: 93,
    },
    './src/services/accounting/JournalCalculator.ts': {
      branches: 38,
      statements: 45,
    },
    './src/utils/money.ts': {
      branches: 27,
      statements: 79,
    },
    './src/services/ledger/ledgerWriteService.ts': {
      branches: 63,
      statements: 78,
    },
  },
};
