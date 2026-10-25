// Display helpers that state facts: the storm replay's day/night follows the real clock of 31 Dec 2022 in San Francisco.
import { describe, it, expect } from 'vitest';
import { nightAt, SUNRISE_MIN, SUNSET_MIN } from '../src/ui/campaign/scenes';

describe('storm light follows the real clock', () => {
  const start = '2022-12-31T00:53:00-08:00'; // end of the first hourly reading → hour 0 covers 23:53–00:53
  const hourAt = (hh: number, mm = 0) => (hh * 60 + mm - (23 * 60 + 53) + 1440) % 1440 / 60;
  it('is night before sunrise and after sunset, day in between', () => {
    expect(nightAt(start, hourAt(3))).toBe(1);
    expect(nightAt(start, hourAt(12))).toBe(0);
    expect(nightAt(start, hourAt(19))).toBe(1);
  });
  it('uses sunrise 07:25 and sunset 17:00 with a short twilight', () => {
    expect(SUNRISE_MIN).toBe(7 * 60 + 25); expect(SUNSET_MIN).toBe(17 * 60);
    expect(nightAt(start, hourAt(7, 25))).toBeCloseTo(0.5, 1);
    expect(nightAt(start, hourAt(17, 0))).toBeCloseTo(0.5, 1);
  });
});
