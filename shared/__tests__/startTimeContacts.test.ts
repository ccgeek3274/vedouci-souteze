import { describe, it, expect } from 'vitest';
import { normTime, parseStartTime, shortTime } from '../startTime';
import { parseContactPaste } from '../contacts';

describe('start time', () => {
  it('parses captains\' free text', () => {
    expect(parseStartTime('10hod')).toEqual({ time: '10:00', side: 'home' });
    expect(parseStartTime('10:00')).toEqual({ time: '10:00', side: 'home' });
    expect(parseStartTime('10')).toEqual({ time: '10:00', side: 'home' });
    expect(parseStartTime('9.30')).toEqual({ time: '09:30', side: 'home' });
    expect(parseStartTime('domácí zápasy od 10 h')).toEqual({ time: '10:00', side: 'home' });
    expect(parseStartTime('venku nejdříve v 10:00')).toEqual({ time: '10:00', side: 'away' });
    expect(parseStartTime('jako hosté 10 hod')).toEqual({ time: '10:00', side: 'away' });
    expect(parseStartTime('protičíslo ke Kralupy A (KP)')).toBeNull();
    expect(parseStartTime('')).toBeNull();
  });
  it('normalizes', () => {
    expect(normTime('9:00')).toBe('09:00');
    expect(normTime('25:00')).toBe('');
    expect(shortTime('09:00')).toBe('9:00');
  });
});

describe('contact paste', () => {
  it('three Excel cells in any order', () => {
    expect(parseContactPaste('Huja Matěj\t604409805\tmatej@example.cz')).toEqual([{ name: 'Huja Matěj', phone: '604 409 805', email: 'matej@example.cz' }]);
    expect(parseContactPaste('a@b.cz\tNovák Jan\t+420 777 466 606\n')).toEqual([{ name: 'Novák Jan', phone: '777 466 606', email: 'a@b.cz' }]);
  });
  it('several rows', () => {
    expect(parseContactPaste('A B\t111222333\ta@x.cz\r\nC D\t\tc@x.cz')).toHaveLength(2);
  });
  it('free-text line', () => {
    expect(parseContactPaste('Petr Pavel Kolman, petr@example.cz, Tel.777 466 606')).toEqual([{ name: 'Petr Pavel Kolman', phone: '777 466 606', email: 'petr@example.cz' }]);
  });
  it('leaves a plain value to the input', () => {
    expect(parseContactPaste('Novák Jan')).toBeNull();
    expect(parseContactPaste('604 409 805')).toBeNull();
  });
});
