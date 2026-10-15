import { requireOptionalNativeModule } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

type NativeKeyCrypto = {
  setAllowed(allowed: boolean): void;
  execute(operation: string, request: string): Promise<string>;
};

type ZstdResult = {
  ok: true;
  version: '1.5.7';
  sourceBytes: 44;
  compressedBytes: number;
  decompressedBytes: 44;
};

type Status =
  | { phase: 'running' }
  | { phase: 'pass'; result: ZstdResult; raw: string }
  | { phase: 'fail'; message: string };

const expectedKeys = [
  'compressedBytes',
  'decompressedBytes',
  'ok',
  'sourceBytes',
  'version',
].sort();

function isZstdResult(value: unknown): value is ZstdResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const result = value as Record<string, unknown>;
  const keys = Object.keys(result).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    result.ok === true &&
    result.version === '1.5.7' &&
    result.sourceBytes === 44 &&
    typeof result.compressedBytes === 'number' &&
    Number.isInteger(result.compressedBytes) &&
    result.compressedBytes > 0 &&
    result.decompressedBytes === 44 &&
    result.sourceBytes === result.decompressedBytes
  );
}

export function ZstdProofScreen() {
  const [status, setStatus] = useState<Status>({ phase: 'running' });

  useEffect(() => {
    let mounted = true;
    void SplashScreen.hideAsync().catch(() => undefined);
    console.info('[ZSTD_PROOF] running');

    const run = async () => {
      const nativeModule = requireOptionalNativeModule<NativeKeyCrypto>('ExpoKeyCrypto');
      if (!nativeModule || typeof nativeModule.execute !== 'function') {
        throw new Error('Native module unavailable');
      }

      let raw: string;
      nativeModule.setAllowed(true);
      try {
        raw = await nativeModule.execute('zstdSelfTest', '{}');
      } finally {
        nativeModule.setAllowed(false);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('Native result was not valid JSON');
      }
      if (!isZstdResult(parsed)) throw new Error('Native result did not match the expected result');
      return { parsed, raw };
    };

    void run().then(
      ({ parsed, raw }) => {
        if (!mounted) return;
        console.info(`[ZSTD_PROOF] ${raw}`);
        setStatus({ phase: 'pass', result: parsed, raw });
      },
      (error: unknown) => {
        if (!mounted) return;
        const message =
          error instanceof Error &&
          (error.message === 'Native module unavailable' ||
            error.message === 'Native result was not valid JSON' ||
            error.message === 'Native result did not match the expected result')
            ? error.message
            : 'Native self-test failed';
        console.error(`[ZSTD_PROOF] ${message}`);
        setStatus({ phase: 'fail', message });
      },
    );

    return () => {
      mounted = false;
    };
  }, []);

  if (status.phase === 'running') {
    return (
      <View testID="zstd-proof-running">
        <Text>Zstandard proof: running</Text>
      </View>
    );
  }

  if (status.phase === 'pass') {
    return (
      <View testID="zstd-proof-pass">
        <Text>Zstandard proof: pass</Text>
        <Text>{JSON.stringify(status.result)}</Text>
      </View>
    );
  }

  return (
    <View testID="zstd-proof-fail">
      <Text>Zstandard proof: fail</Text>
      <Text>{status.message}</Text>
    </View>
  );
}
