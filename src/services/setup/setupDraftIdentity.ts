export const SETUP_DRAFT_KEY = 'setup_draft_v1';

export const SETUP_JOURNEY_IDS = [
  'first_run',
  'first_run_restore',
  'empty_device_workplace',
  'empty_device_restore',
  'picker_restore',
  'settings_restore',
  'create_workplace',
] as const;

export type SetupJourneyId = (typeof SETUP_JOURNEY_IDS)[number];

export function isSetupJourneyId(value: unknown): value is SetupJourneyId {
  return typeof value === 'string' && (SETUP_JOURNEY_IDS as readonly string[]).includes(value);
}
