import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { compression } from '../utils/compression';
import { logger } from '../utils/logger';
import { analytics } from './analytics-service';
import { ShareFormat, sharingService } from './SharingService';

export class BugReportService {
  /**
   * Generates a diagnostic ZIP report and opens the share sheet.
   */
  static async shareReport(error?: Error) {
    await this.processReport(error, 'share');
  }

  /**
   * Generates a diagnostic ZIP report and prompts to save it.
   */
  static async saveReport(error?: Error) {
    await this.processReport(error, 'save');
  }

  private static async processReport(error: Error | undefined, mode: 'share' | 'save') {
    const metadata = await this.generateReportMetadata(error);
    const logs = logger.getRecentLogs() || 'No logs recorded yet.';

    const provider = {
      id: 'bug-report',
      title: mode === 'save' ? 'Save Bug Report' : 'Share Bug Report',
      filename: `bug-report-${new Date().toISOString().split('T')[0]}`,
      supportedFormats: [ShareFormat.ZIP, ShareFormat.TEXT],
      getContent: async (format: ShareFormat) => {
        if (format === ShareFormat.ZIP) {
          const archive = await compression.createZipArchive('bug_report', {
            'metadata.txt': metadata,
            'logs.txt': logs,
          });

          try {
            return archive.base64;
          } finally {
            archive.cleanup(); // Clean up temp files immediately after base64 conversion
          }
        }

        return `${metadata}\n\n--- RECENT LOGS ---\n${logs}`;
      },
    };

    if (mode === 'save') {
      await sharingService.save(provider, ShareFormat.ZIP);
    } else {
      await sharingService.share(provider, ShareFormat.ZIP);
    }
  }

  private static async generateReportMetadata(error?: Error): Promise<string> {
    const lines: string[] = [];

    lines.push('=== FULL FRILLS BALANCE BUG REPORT ===');
    lines.push(`Timestamp: ${new Date().toISOString()}`);
    lines.push(`User ID: ${analytics.getDistinctId()}`);

    const lastEventId = Sentry.lastEventId();
    if (lastEventId) {
      lines.push(`Sentry Event ID: ${lastEventId}`);
    }

    lines.push('');

    lines.push('--- Device Info ---');
    lines.push(`OS: ${Platform.OS} ${Device.osVersion}`);
    lines.push(`Model: ${Device.modelName}`);
    lines.push(
      `App Version: ${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`,
    );
    lines.push(`Device Name: ${Device.deviceName}`);
    lines.push('');

    if (error) {
      lines.push('--- Error Details ---');
      lines.push(`Name: ${error.name}`);
      lines.push(`Message: ${error.message}`);
      lines.push(`Stack:\n${error.stack || 'No stack trace available'}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
