// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const fs = require('fs');
const path = require('path');
const eslintConfigPrettier = require('eslint-config-prettier');
const crossFeatureAllowlist = require('./scripts/cross-feature-boundary-allowlist.json');
const {
  DOMAIN_FORBIDDEN_ROOTS,
  DOMAIN_FORBIDDEN_PACKAGE_REGEX,
} = require('./scripts/lib/domain-boundary-policy.cjs');

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

// Generate ESLint rules per feature. Cross-feature imports must use an explicitly
// approved public barrel; deep imports always remain forbidden.
const featureRules = features.map(feature => ({
  files: [`src/features/${feature}/**/*.{ts,tsx}`],
  ignores: [
    `src/features/${feature}/**/__tests__/**`,
    `src/features/${feature}/**/*.{test,spec}.{ts,tsx}`,
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['app/*', 'app/**', '@/app', '@/app/*', '@/app/**'],
            message: 'Features must not import Expo Router app routes.',
          },
          {
            group: ['@/src/data/repositories', '@/src/data/repositories/**'],
            message:
              'Features must not import data repositories; use service façades instead (FUL-112).',
          },
          {
            // Relative paths like ../../../data/repositories/... bypass the alias group.
            regex: '(^|/)data/repositories(/|$)',
            message:
              'Features must not import data repositories; use service façades instead (FUL-112).',
          },
          ...features
            .filter(f => f !== feature)
            .map(otherFeature => ({
              group: [
                `@/src/features/${otherFeature}/*`,
                ...(crossFeatureAllowlist[feature]?.includes(otherFeature)
                  ? []
                  : [`@/src/features/${otherFeature}`]),
              ],
              message: crossFeatureAllowlist[feature]?.includes(otherFeature)
                ? 'Cross-feature imports must use the public barrel, not deep paths.'
                : 'Cross-feature imports require an allowlist entry and the public barrel.',
            })),
        ],
      },
    ],
  },
}));

// Touchable* imports bypass the shared PressScaleTouchable press primitive.
// Keep this array shared: a later flat-config object replaces the whole
// no-restricted-syntax rule for matching files.
const touchableImportRestrictions = [
  {
    selector:
      "ImportDeclaration[source.value='react-native'] > ImportSpecifier[imported.name=/^Touchable/]",
    message:
      'Use PressScaleTouchable for press feedback (or Pressable for components that own their own animation) instead of react-native Touchable components.',
  },
];

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
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: [
      '**/__tests__/**',
      'src/components/core/PressScaleTouchable.tsx',
      'src/components/core/AppToggle.tsx',
      'src/components/core/ErrorBoundary.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...touchableImportRestrictions],
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
  {
    files: ['src/domain/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
    ignores: [
      'src/domain/**/__tests__/**',
      'src/domain/**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Immediate feedback for package/alias imports. The architecture checker
          // resolves relative imports, barrels, platform variants, and dependency chains.
          patterns: [
            {
              group: [
                'app',
                'app/**',
                ...DOMAIN_FORBIDDEN_ROOTS.flatMap(root => [`@/${root}`, `@/${root}/**`]),
              ],
              message:
                'Domain rules must be independent of presentation, persistence, and orchestration.',
            },
            {
              regex: DOMAIN_FORBIDDEN_PACKAGE_REGEX,
              message: 'Domain rules must be independent of platform and UI packages.',
            },
          ],
        },
      ],
    },
  },
  // Command ownership: feature hooks must not call repository mutations.
  // Reactive observe/find reads remain allowed via import-only usage patterns.
  {
    files: ['src/features/**/hooks/**/*.{ts,tsx}'],
    ignores: ['src/features/**/hooks/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...touchableImportRestrictions,
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="create"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository create(); use domain commands or write services.',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="update"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository update(); use domain commands or write services.',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="delete"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository delete(); use domain commands or write services.',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="batchInsert"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository batchInsert(); use domain commands or write services.',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.property.name="createJournalWithTransactions"][callee.object.type="Identifier"][callee.object.name=/Repository$/]',
          message:
            'Feature hooks must not call repository createJournalWithTransactions(); use journal write commands.',
        },
      ],
    },
  },
  eslintConfigPrettier,
]);
