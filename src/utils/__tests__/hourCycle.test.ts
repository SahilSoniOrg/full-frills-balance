import { hour12To24, hour24To12, resolveHourCycle } from '@/src/utils/hourCycle';

describe('hourCycle', () => {
  describe('resolveHourCycle', () => {
    it('honors an explicit 12-hour preference over the OS', () => {
      expect(resolveHourCycle('12-hour', true)).toBe('12-hour');
    });

    it('honors an explicit 24-hour preference over the OS', () => {
      expect(resolveHourCycle('24-hour', false)).toBe('24-hour');
    });

    it('uses the OS 24-hour clock when preference is system', () => {
      expect(resolveHourCycle('system', true)).toBe('24-hour');
      expect(resolveHourCycle('system', false)).toBe('12-hour');
    });

    it('defaults system to 12-hour when the OS does not report a clock', () => {
      expect(resolveHourCycle('system', null)).toBe('12-hour');
    });
  });

  describe('hour conversion', () => {
    it('converts 24-hour hours to 1-12 plus meridiem', () => {
      expect(hour24To12(0)).toEqual({ hour12: 12, meridiem: 'AM' });
      expect(hour24To12(1)).toEqual({ hour12: 1, meridiem: 'AM' });
      expect(hour24To12(12)).toEqual({ hour12: 12, meridiem: 'PM' });
      expect(hour24To12(13)).toEqual({ hour12: 1, meridiem: 'PM' });
      expect(hour24To12(23)).toEqual({ hour12: 11, meridiem: 'PM' });
    });

    it('converts 1-12 plus meridiem back to 0-23', () => {
      expect(hour12To24(12, 'AM')).toBe(0);
      expect(hour12To24(1, 'AM')).toBe(1);
      expect(hour12To24(12, 'PM')).toBe(12);
      expect(hour12To24(1, 'PM')).toBe(13);
      expect(hour12To24(11, 'PM')).toBe(23);
    });
  });
});
