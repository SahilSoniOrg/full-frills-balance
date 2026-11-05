import fs from 'fs';
import path from 'path';

/**
 * Phase 6: the older-message picker must stay read-only against the device inbox.
 * It must not import the SMS sync pipeline, sms-service scan entry points, or journal writers.
 */
describe('accountMatcherOlderMessages isolation', () => {
  it('does not import scan or journal write seams', () => {
    const sourcePath = path.join(__dirname, '..', 'accountMatcherOlderMessages.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const forbidden = [
      'smsSyncPipeline',
      'sms-service',
      'journalPersistenceService',
      'journalPutOperations',
      'transactionInboxImport',
      'AutomaticSmsImportService',
    ];
    for (const needle of forbidden) {
      expect(source).not.toContain(needle);
    }
    expect(source).toContain('smsInboxBridge');
  });
});
