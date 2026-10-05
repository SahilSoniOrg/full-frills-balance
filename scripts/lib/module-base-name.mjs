import path from 'node:path';

export function moduleBaseName(moduleName) {
  return path.posix.basename(moduleName).replace(/\.(?:mjs|cjs|js|tsx?|jsx?)$/, '');
}
