// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const fs = require('fs');
const path = require('path');

// Determine feature directories to enforce boundary rules
const featuresDir = path.join(__dirname, 'src/features');
let features = [];
try {
  features = fs.readdirSync(featuresDir).filter(f => fs.statSync(path.join(featuresDir, f)).isDirectory());
} catch (e) {
  // Ignore if src/features doesn't exist yet
}

// Generate ESLint rules per feature: a feature cannot deep import from other features
const featureRules = features.map(feature => ({
  files: [`src/features/${feature}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          'app/*', 'app/**', '@/app', '@/app/*', '@/app/**',
          ...features.filter(f => f !== feature).map(f => `@/src/features/${f}/*`),
        ],
      },
    ],
  },
}));

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/src/features/*/*',
            '@/src/features/*/**',
            '@/src/components/**',
            '@/src/services/**',
            '@/src/data/**',
            '@/src/utils/**',
            '@/src/hooks/**',
            '@/src/contexts/**',
            '@/src/constants/**',
            '@/src/types/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['app/*', 'app/**', '@/app', '@/app/*', '@/app/**'],
        },
      ],
    },
  },
  ...featureRules,
]);
