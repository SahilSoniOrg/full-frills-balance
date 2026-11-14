const { builtinModules } = require('node:module');

// The checker resolves these paths; ESLint uses the same policy for editor feedback.
const DOMAIN_FORBIDDEN_ROOTS = [
  'app',
  'src/components',
  'src/contexts',
  'src/data',
  'src/design-system',
  'src/features',
  'src/hooks',
  'src/navigation',
  'src/services',
  'src/testing',
  'src/constants/copy',
];

const DOMAIN_FORBIDDEN_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'react-native-*',
  'expo',
  'expo-*',
  '@expo/*',
  '@react-native/*',
  '@react-native-*/*',
  'lucide-react-native',
  '@sentry/react-native',
  '@shopify/flash-list',
  '@nozbe/watermelondb',
  '@testing-library/*',
  'node:*',
  ...builtinModules.filter(name => !name.startsWith('_')),
];

const packagePatterns = DOMAIN_FORBIDDEN_PACKAGES.map(pattern =>
  pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'),
);
const DOMAIN_FORBIDDEN_PACKAGE_REGEX = `^(?:${packagePatterns.join('|')})(?:/.*)?$`;
const packagePattern = new RegExp(DOMAIN_FORBIDDEN_PACKAGE_REGEX);

function isForbiddenDomainPackage(specifier) {
  return packagePattern.test(specifier);
}

module.exports = {
  DOMAIN_FORBIDDEN_ROOTS,
  DOMAIN_FORBIDDEN_PACKAGES,
  DOMAIN_FORBIDDEN_PACKAGE_REGEX,
  isForbiddenDomainPackage,
};
