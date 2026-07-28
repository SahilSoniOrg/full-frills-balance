/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testTimeout: 180000,
  setupFilesAfterEnv: ['<rootDir>/e2e/config.js'],
};
