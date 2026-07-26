// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const fs = require('fs');
const path = require('path');
const eslintConfigPrettier = require('eslint-config-prettier');

// Determine feature directories to enforce boundary rules
const featuresDir = path.join(__dirname, 'src/features');
let features = [];
try {
  features = fs
    .readdirSync(featuresDir)
    .filter(f => fs.statSync(path.join(featuresDir, f)).isDirectory());
} catch (_) {
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
          'app/*',
          'app/**',
          '@/app',
          '@/app/*',
          '@/app/**',
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
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
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
  {
    files: ['src/services/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/src/features/*',
            '@/src/features/**',
            '@/src/components/*',
            '@/src/components/**',
            '@/src/hooks/*',
            '@/src/hooks/**',
          ],
        },
      ],
    },
  },
  ...featureRules,
  // Command ownership: feature hooks must not call repository mutations (docs/CONVENTIONS.md).
  // Reactive observe/find reads remain allowed via import-only usage patterns.
  {
    files: ['src/features/**/hooks/**/*.{ts,tsx}'],
    ignores: ['src/features/**/hooks/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="create"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository create(); use domain commands or write services (docs/CONVENTIONS.md).',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="update"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository update(); use domain commands or write services (docs/CONVENTIONS.md).',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="delete"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository delete(); use domain commands or write services (docs/CONVENTIONS.md).',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="batchInsert"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository batchInsert(); use domain commands or write services (docs/CONVENTIONS.md).',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="createJournalWithTransactions"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository createJournalWithTransactions(); use journal write commands (docs/CONVENTIONS.md).',
        },
      ],
    },
  },
  eslintConfigPrettier,
]);
