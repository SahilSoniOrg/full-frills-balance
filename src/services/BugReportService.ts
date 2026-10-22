import { ShareFormat, type ShareOutcome } from '@/src/types/sharing';
import { toast } from '@/src/utils/alerts';
import { sharingService } from './SharingService';
import { createDiagnosticShareable } from './sharing/diagnosticShareable';

export class BugReportService {
  static shareReport(error?: Error): Promise<ShareOutcome> {
    return this.processReport(error, 'share');
  }

  static saveReport(error?: Error): Promise<ShareOutcome> {
    return this.processReport(error, 'save');
  }

  private static async processReport(
    error: Error | undefined,
    action: 'share' | 'save',
  ): Promise<ShareOutcome> {
    let outcome: ShareOutcome;
    try {
      outcome = await sharingService.execute(createDiagnosticShareable(error, action), {
        action,
        format: ShareFormat.ZIP,
      });
    } catch (cause) {
      outcome = {
        kind: 'failed',
        error: cause instanceof Error ? cause : new Error('Could not prepare diagnostic report'),
      };
    }

    if (outcome.kind === 'busy') {
      toast.error('Another sharing operation is already in progress');
    } else if (outcome.kind === 'failed') {
      toast.error('Could not prepare diagnostic report');
    }
    return outcome;
  }
}
