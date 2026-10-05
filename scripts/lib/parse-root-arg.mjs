import path from 'node:path';

export function parseRootArg(argv, defaultRoot) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') {
      return path.resolve(argv[++index]);
    }
  }
  return defaultRoot;
}
