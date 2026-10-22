import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { analytics } from '@/src/services/analytics';
import { compression } from '@/src/utils/compression';
import { logger } from '@/src/utils/logger';
import { safeDiagnosticError } from '@/src/utils/observabilityPrivacy';
import { ShareFormat, type Shareable } from '@/src/types/sharing';
import { throwIfShareAborted } from './sharingCancellation';

function getReportMetadata(error?: Error): string {
  const lines = [
    '=== FULL FRILLS BALANCE BUG REPORT ===',
    `Timestamp: ${new Date().toISOString()}`,
    `User ID: ${analytics.getDistinctId()}`,
  ];
  const lastEventId = Sentry.lastEventId();
  if (lastEventId) lines.push(`Sentry Event ID: ${lastEventId}`);

  lines.push('', '--- Device Info ---');
  lines.push(`OS: ${Platform.OS} ${Device.osVersion}`);
  lines.push(`Model: ${Device.modelName}`);
  lines.push(
    `App Version: ${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`,
    '',
  );

  if (error) {
    const safeError = safeDiagnosticError(error);
    lines.push('--- Error Details ---');
    lines.push(`Name: ${safeError.name}`);
    lines.push(`Message: ${safeError.message}`);
    lines.push(`Stack:\n${safeError.stack || 'No safe stack frames available'}`, '');
  }
  return lines.join('\n');
}

/** Device-only diagnostics remain usable outside the normal React provider tree. */
export function createDiagnosticShareable(
  error?: Error,
  action: 'share' | 'save' = 'share',
): Shareable {
  return {
    id: 'bug-report',
    title: action === 'save' ? 'Save Bug Report' : 'Share Bug Report',
    filename: `bug-report-${new Date().toISOString().split('T')[0]}`,
    mimeType: 'application/zip',
    fileExtension: 'zip',
    supportedFormats: [ShareFormat.ZIP, ShareFormat.TEXT],
    scope: { kind: 'device' },
    requireFile: true,
    async prepare(format, context) {
      const metadata = getReportMetadata(error);
      const logs = logger.getRecentLogs() || 'No logs recorded yet.';
      throwIfShareAborted(context.signal);
      if (format === ShareFormat.ZIP) {
        const archive = await compression.createZipArchive('bug_report', {
          'metadata.txt': metadata,
          'logs.txt': logs,
        });
        try {
          return { kind: 'base64', content: archive.base64 };
        } finally {
          archive.cleanup();
        }
      }
      return { kind: 'text', content: `${metadata}\n\n--- RECENT LOGS ---\n${logs}` };
    },
  };
}
