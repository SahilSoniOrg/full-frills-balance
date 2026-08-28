import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const variants = JSON.parse(readFileSync(join(projectRoot, 'app-variants.json'), 'utf8'));
const variantName = process.argv[2] ?? 'development';
const variant = variants[variantName];

if (!variant) {
  throw new Error(
    `Unknown Android variant "${variantName}". Expected one of: ${Object.keys(variants).join(', ')}.`,
  );
}

const buildVariants = {
  development: 'debug',
  preview: 'preview',
  production: 'release',
};
const buildVariant = buildVariants[variantName];
const expo = join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'expo.cmd' : 'expo',
);
const result = spawnSync(
  expo,
  [
    'run:android',
    '--variant',
    buildVariant,
    '--app-id',
    variant.androidApplicationId,
    ...process.argv.slice(3),
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, APP_VARIANT: variantName },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
