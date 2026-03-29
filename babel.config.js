module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Decorators first (legacy required by WatermelonDB)
      ['@babel/plugin-proposal-decorators', { legacy: true }],

      // React Compiler (must run early)
      ['babel-plugin-react-compiler', { target: '19' }],

      [
        'import',
        {
          libraryName: 'lucide-react-native',
          libraryDirectory: 'dist/esm/icons',
          camel2DashComponentName: false, // Disable default transformation
          customName: name => {
            // Converts PascalCase to kebab-case, including handles for numbers (Trash2 -> trash-2)
            const kebabName = name
              .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
              .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
              .toLowerCase();
            return `lucide-react-native/dist/esm/icons/${kebabName}`;
          },
        },
        'lucide-react-native',
      ],

      // MUST be last
      'react-native-reanimated/plugin',
    ],
    overrides: [
      {
        test: /src\/data\/models\/.*\.ts$/,
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ],
      },
    ],
  };
};
