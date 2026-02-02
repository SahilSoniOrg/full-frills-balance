// Mock Platform before any other imports
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
    OS: 'ios',
    Version: '14.0',
    select: jest.fn((obj) => obj.ios || obj.default),
    constants: {
        getConstants: () => ({
            forceTouchAvailable: false,
            osVersion: '14.0',
            systemName: 'iOS',
            interfaceIdiom: 'phone',
        }),
    },
    isPad: false,
    isTVOS: false,
}));
