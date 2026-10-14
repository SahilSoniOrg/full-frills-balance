import { useEffect, useState } from 'react';
import { ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';
import { readE2eLaunchConfig } from './e2eLaunchArgs';
import { runNativeRecoveryProof } from './nativeRecoveryProof';
import type { RecoveryProofReport } from './nativeRecoveryProofStages';

export function RecoveryProofScreen() {
  const [status, setStatus] = useState('READY');
  const [message, setMessage] = useState('Disposable demo books. No online service.');
  const [report, setReport] = useState<RecoveryProofReport>();
  useEffect(() => {
    assertE2eHarnessEnabled();
    // This isolated screen intentionally runs without the normal app shell.
    setKeyAccessAllowed(true);
    void SplashScreen.hideAsync();
    return () => setKeyAccessAllowed(false);
  }, []);
  const run = async () => {
    setStatus('RUNNING');
    try {
      const config = readE2eLaunchConfig();
      if (!config?.recoveryAction) throw new Error('Recovery proof capability is unavailable');
      setReport(await runNativeRecoveryProof(config, setMessage));
      setMessage('Native proof completed');
      setStatus('PASS');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Native proof failed');
      setStatus('FAIL');
    }
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Private backup recovery</Text>
          <Text style={styles.caption}>Isolated native simulator proof</Text>
          <Text testID="recovery-proof-state" style={styles.status}>
            {status}
          </Text>
          <Text testID="recovery-proof-message" style={styles.message}>
            {message}
          </Text>
          <Pressable
            testID="recovery-proof-run"
            accessibilityRole="button"
            disabled={status === 'RUNNING'}
            onPress={() => {
              void run();
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Run this stage</Text>
          </Pressable>
          {report && (
            <Text testID="recovery-proof-report" style={styles.report}>
              {JSON.stringify(report, null, 2)}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101218' },
  content: { padding: 24, gap: 20 },
  title: { color: '#fff', fontSize: 30, fontWeight: '600' },
  caption: { color: '#a4adbc', fontSize: 16 },
  status: { color: '#8de2bd', fontSize: 32, fontWeight: '700' },
  message: { color: '#fff', fontSize: 17 },
  button: { backgroundColor: '#dbe7f4', padding: 18, borderRadius: 10 },
  buttonText: { color: '#101218', fontSize: 18, fontWeight: '600' },
  report: { color: '#c9d1e0', fontSize: 14, fontFamily: 'Menlo', lineHeight: 22 },
});
