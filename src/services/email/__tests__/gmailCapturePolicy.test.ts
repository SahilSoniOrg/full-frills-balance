import { gmailAutomaticCaptureCutoff } from '../gmailCapturePolicy';

describe('gmailAutomaticCaptureCutoff', () => {
  it('uses the max of capture, automatic-capture, and connection timestamps', () => {
    expect(
      gmailAutomaticCaptureCutoff({
        captureEnabledAt: 100,
        automaticCaptureEnabledAt: 300,
        connectedAt: 200,
      }),
    ).toBe(300);
  });

  it('treats missing optional timestamps as zero', () => {
    expect(gmailAutomaticCaptureCutoff({ connectedAt: 50 })).toBe(50);
  });
});
