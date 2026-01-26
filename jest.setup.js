
// Import Jest Native matchers for better assertions
// Import Jest Native matchers for better assertions
import '@testing-library/jest-native/extend-expect';

// Mock Expo modules
jest.mock('expo-font');
jest.mock('expo-asset');
jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    Link: 'Link',
    Stack: {
        Screen: 'Screen',
    },
}));

// Mock other platform-specific modules that might fail in Node
jest.mock('expo-file-system', () => ({
    documentDirectory: 'test-dir/',
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue({}),
}));

// Ensure rebuild queue is flushed after each test to prevent state leakage
afterEach(async () => {
    try {
        const { rebuildQueueService } = require('./src/data/repositories/RebuildQueue');
        await rebuildQueueService.flush();
    } catch (e) {
        // Service may not be available in all test contexts
    }
});
