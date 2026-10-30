import { describe, expect, it } from 'vitest';
import { contactNameFindings, fixContactNames } from '../roster/contactNames';

const own = ['Novák Jan', 'Dvořák Petr', 'Černý Martin'];
const others = ['Svoboda Tomáš', 'Martin Pavel'];
const ct = (name: string, role = 'kapitan') => ({ role, name });

describe('contactNameFindings', () => {
  it('accepts names in the roster order and unknown people', () => {
    expect(contactNameFindings([ct('Novák Jan'), ct('NOVAK jan'), ct('Kopecký Jiří', 'rozhodci'), ct('Ing. Dvořák Petr'), ct('')], own, others)).toEqual([]);
  });

  it('finds names swapped against the own or another roster', () => {
    const f = contactNameFindings([ct('Jan Novák'), ct('Tomáš Svoboda', 'rozhodci')], own, others);
    expect(f.map((x) => [x.index, x.suggestion])).toEqual([[0, 'Novák Jan'], [1, 'Svoboda Tomáš']]);
    expect(f[0].text).toContain('na soupisce „Novák Jan“');
    expect(f[1].text).toContain('jiného družstva');
    expect(f.map((x) => x.kind)).toEqual(['swapped', 'swapped']);
  });

  it('fixes every contact with the same wrong name', () => {
    const list = [ct('Jan Novák'), ct('Jan Novák', 'rozhodci'), ct('Petr Kopecký', 'rozhodci')];
    const f = contactNameFindings(list, own, others).filter((x) => x.kind === 'swapped');
    expect(fixContactNames(list, f).map((x) => x.name)).toEqual(['Novák Jan', 'Novák Jan', 'Petr Kopecký']);
  });

  it('flags "Jméno Příjmení" of people not on any roster by the first names on the rosters', () => {
    const f = contactNameFindings([ct('Petr Kopecký', 'rozhodci'), ct('Ing. Tomáš Malý', 'rozhodci')], own, others);
    expect(f.map((x) => x.suggestion)).toEqual(['Kopecký Petr', null]);
  });

  it('does not guess when the first word is also a surname or the last one a first name', () => {
    // Martin is a surname on a roster; Jan Petr ends with a first name
    expect(contactNameFindings([ct('Martin Kos'), ct('Jan Petr')], own, others)).toEqual([]);
  });
});
