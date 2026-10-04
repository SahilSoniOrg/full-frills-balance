import { ShareFormat } from '@/src/types/sharing';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { DEFAULT_UI_PREFERENCES } from '../types';

describe('DEFAULT_UI_PREFERENCES', () => {
  it('defines the canonical defaults consumed by scoped preference hooks', () => {
    expect(DEFAULT_UI_PREFERENCES).toMatchObject({
      userName: '',
      theme: 'system',
      themeId: ThemeIds.DEEP_SPACE,
      fontId: FontIds.DEEP_SPACE,
      notificationCadence: 'none',
      notificationHour: 10,
      notificationMinute: 0,
      notificationWeekday: 1,
      defaultShareFormat: ShareFormat.TEXT,
    });
  });
});
