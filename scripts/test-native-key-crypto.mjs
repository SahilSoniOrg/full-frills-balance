import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(path.join(tmpdir(), 'ffb-native-key-test-'));
function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Native key validation failed');
}
try {
  run('node', ['scripts/prepare-native-key-crypto.mjs']);
  const configured = process.env.FFB_OPENSSL_PREFIX;
  const systemPrefix = output('pkg-config', ['--variable=prefix', 'openssl']);
  const brewPrefix =
    process.platform === 'darwin' ? output('brew', ['--prefix', 'openssl@3']) : undefined;
  const prefix =
    configured ??
    [systemPrefix, brewPrefix].find(
      value => value && existsSync(path.join(value, 'include/openssl/hpke.h')),
    );
  if (!prefix || !existsSync(path.join(prefix, 'include/openssl/hpke.h')))
    throw new Error(
      'Install HPKE-enabled OpenSSL 3.2+ development headers (pkg-config/Homebrew), or set FFB_OPENSSL_PREFIX. Native tests are required, not skipped.',
    );
  const libdir =
    !configured && prefix === systemPrefix
      ? output('pkg-config', ['--variable=libdir', 'openssl'])
      : path.join(prefix, existsSync(path.join(prefix, 'lib64')) ? 'lib64' : 'lib');
  const binary = path.join(directory, 'native-key-test');
  run(process.env.CXX ?? 'c++', [
    '-std=c++20',
    '-DFFB_KEY_CRYPTO_TEST',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-I',
    'modules/expo-key-crypto/vendor',
    '-I',
    'modules/expo-key-crypto/cpp',
    '-I',
    path.join(prefix, 'include'),
    'modules/expo-key-crypto/cpp/CryptoPrimitives.cpp',
    'modules/expo-key-crypto/cpp/ProtocolEnvelopes.cpp',
    'modules/expo-key-crypto/cpp/KeyEngine.cpp',
    'modules/expo-key-crypto/tests/HostRunner.cpp',
    '-L',
    libdir ?? path.join(prefix, 'lib'),
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
