import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { sharingService } from './SharingService';
import { logger } from '../utils/logger';

export class BugReportService {
  /**
   * Generates a diagnostic report and opens the share sheet.
   */
  static async shareReport(error?: Error) {
    const report = await this.generateReport(error);

    await sharingService.share({
      id: 'bug-report',
      title: 'Bug Report',
      filename: `bug-report-${new Date().toISOString().split('T')[0]}`,
      fileExtension: 'txt',
      getContent: () => report,
    });
  }

  private static async generateReport(error?: Error): Promise<string> {
    const lines: string[] = [];

    lines.push('=== FULL FRILLS BALANCE BUG REPORT ===');
    lines.push(`Timestamp: ${new Date().toISOString()}`);
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

    lines.push('--- Recent Logs ---');
    lines.push(logger.getRecentLogs() || 'No logs recorded yet.');

    return lines.join('\n');
  }
}
