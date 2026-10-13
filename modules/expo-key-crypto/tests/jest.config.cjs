const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
module.exports = {
  ...require(path.join(root, 'jest.config.js')),
  rootDir: root,
  testMatch: ['<rootDir>/modules/expo-key-crypto/tests/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
