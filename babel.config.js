module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Decorators first (legacy required by WatermelonDB)
      ['@babel/plugin-proposal-decorators', { legacy: true }],

      // MUST be last
      'react-native-reanimated/plugin',
    ],
  };
};
