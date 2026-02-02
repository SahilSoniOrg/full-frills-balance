module.exports = {
    preset: 'jest-expo',
    setupFilesAfterEnv: ['./jest.setup.js'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@nozbe/watermelondb)',
    ],
    testPathIgnorePatterns: ['/node_modules/', '/tests/', '/e2e/'],
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
        '^@/src/data/database/adapter$': '<rootDir>/src/data/database/adapter.ts',
        'idGenerator$': '<rootDir>/src/data/database/idGenerator.ts',
        '^@/src/(.*)$': '<rootDir>/src/$1',
    },
    setupFiles: [
        '<rootDir>/jest.platform-mock.js'
    ],
};
