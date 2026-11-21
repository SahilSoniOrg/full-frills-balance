import { Platform } from 'react-native';

/** Same visibility rule as the Capture & review Gmail section. */
export function isGmailCaptureSectionVisible(featureEnabled: boolean, connected: boolean): boolean {
  return Platform.OS !== 'web' && (featureEnabled || connected);
}

/** Nested background / automatic toggles render only while Gmail is connected. */
export function isGmailCaptureConnectedControlsVisible(
  featureEnabled: boolean,
  connected: boolean,
): boolean {
  return isGmailCaptureSectionVisible(featureEnabled, connected) && connected;
}

/** Account recognition help renders only while the flag is on and Gmail is connected. */
export function isGmailCaptureAccountHelpVisible(
  featureEnabled: boolean,
  connected: boolean,
): boolean {
  return isGmailCaptureConnectedControlsVisible(featureEnabled, connected) && featureEnabled;
}
