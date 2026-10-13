import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(path.join(tmpdir(), 'ffb-native-key-test-'));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Native key validation failed');
}
try {
  run('node', ['scripts/prepare-native-key-crypto.mjs']);
  const prefix = process.env.FFB_OPENSSL_PREFIX ?? '/opt/homebrew/opt/openssl@3';
  if (!existsSync(path.join(prefix, 'include/openssl/hpke.h')))
    throw new Error('Set FFB_OPENSSL_PREFIX to an OpenSSL 3.2+ installation with HPKE enabled');
  const binary = path.join(directory, 'native-key-test');
  run(process.env.CXX ?? 'clang++', [
    '-std=c++20',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-I',
    'modules/expo-key-crypto/.generated',
    '-I',
    'modules/expo-key-crypto/cpp',
    '-I',
    path.join(prefix, 'include'),
    'modules/expo-key-crypto/cpp/KeyCrypto.cpp',
    'modules/expo-key-crypto/tests/HostRunner.cpp',
    '-L',
    path.join(prefix, 'lib'),
    '-lcrypto',
    '-o',
    binary,
  ]);
  run(
    'bunx',
    [
      '--no-install',
      'jest',
      '--config',
      'modules/expo-key-crypto/tests/jest.config.cjs',
      '--runInBand',
    ],
    { ...process.env, FFB_NATIVE_CRYPTO_HOST_BIN: binary },
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
