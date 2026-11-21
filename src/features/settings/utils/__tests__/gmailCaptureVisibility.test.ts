import {
  isGmailCaptureAccountHelpVisible,
  isGmailCaptureConnectedControlsVisible,
  isGmailCaptureSectionVisible,
} from '@/src/features/settings/utils/gmailCaptureVisibility';
import { Platform } from 'react-native';

describe('gmail capture visibility', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('matches the Capture & review section rule on native', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    expect(isGmailCaptureSectionVisible(true, false)).toBe(true);
    expect(isGmailCaptureSectionVisible(false, true)).toBe(true);
    expect(isGmailCaptureSectionVisible(false, false)).toBe(false);
  });

  it('shows nested controls only while connected on native', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    expect(isGmailCaptureConnectedControlsVisible(true, true)).toBe(true);
    expect(isGmailCaptureConnectedControlsVisible(false, true)).toBe(true);
    expect(isGmailCaptureConnectedControlsVisible(true, false)).toBe(false);
    expect(isGmailCaptureAccountHelpVisible(true, true)).toBe(true);
    expect(isGmailCaptureAccountHelpVisible(false, true)).toBe(false);
  });

  it('stays hidden on web even when the flag or binding is on', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

    expect(isGmailCaptureSectionVisible(true, true)).toBe(false);
    expect(isGmailCaptureConnectedControlsVisible(true, true)).toBe(false);
    expect(isGmailCaptureAccountHelpVisible(true, true)).toBe(false);
  });
});
