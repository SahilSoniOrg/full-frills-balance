import { IMPORT_PHASE_SEGMENTS, beginImportRun } from '@/src/services/import/importRun';

describe('importRun', () => {
  it('maps phase-local progress into overall segment bounds', () => {
    const messages: { message: string; progress: number }[] = [];
    const run = beginImportRun((message, progress) => {
      messages.push({ message, progress: progress ?? 0 });
    });

    run.report('parse', 'Parsing…', 0);
    run.report('parse', 'Parsing…', 1);
    run.report('backup', 'Backing up…', 0.5);

    expect(messages[0]?.progress).toBe(IMPORT_PHASE_SEGMENTS.parse.start);
    expect(messages[1]?.progress).toBe(IMPORT_PHASE_SEGMENTS.parse.end);
    expect(messages[2]?.progress).toBeCloseTo(
      (IMPORT_PHASE_SEGMENTS.backup.start + IMPORT_PHASE_SEGMENTS.backup.end) / 2,
    );
  });

  it('records recoverable warnings without failing the run', () => {
    const run = beginImportRun();
    run.recordWarning('rate sync failed');
    expect(run.warnings).toEqual(['rate sync failed']);
  });

  it('completes at progress 1', () => {
    let finalProgress = 0;
    const run = beginImportRun((_message, progress) => {
      if (progress !== undefined) {
        finalProgress = progress;
      }
    });
    run.complete('Done');
    expect(run.state.phase).toBe('complete');
    expect(finalProgress).toBe(1);
  });
});
