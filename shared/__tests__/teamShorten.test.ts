import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDictIndex, buildGazIndex, parseTeamName, resolveCompetition, restoreDiacritics } from '../teamShorten';

// Same reference data as the Worker (worker/lib/teamShortData.ts).
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'worker', 'data', 'team-shorten');
const readJson = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')) as [string, string][];
const data = {
  dict: buildDictIndex(readJson('dict.json').map(([label, clubName]) => ({ label, clubName }))),
  gaz: buildGazIndex(readJson('gazetteer.json').map(([full, core]) => ({ full, core }))),
};
const labels = (names: string[]) => resolveCompetition(names.map((name) => ({ id: name, name })), data).map((r) => r.label);

describe('parseTeamName', () => {
  it('splits a trailing team letter, leaves 1./2. alone', () => {
    expect(parseTeamName('Cayman Pharma Neratovice B')).toEqual({ base: 'Cayman Pharma Neratovice', letter: 'B' });
    expect(parseTeamName('1. Novoborský ŠK')).toEqual({ base: '1. Novoborský ŠK', letter: null });
  });
});

describe('restoreDiacritics', () => {
  it('takes the spelling from the original name', () => {
    expect(restoreDiacritics('Sedlcany', 'ŠK KDJS Sedlčany')).toBe('Sedlčany');
    expect(restoreDiacritics('Mlada Boleslav', 'TJ AŠ MLADÁ BOLESLAV')).toBe('Mladá Boleslav');
  });
  it('leaves words that are not in the name alone', () => {
    expect(restoreDiacritics('Kralupy', 'Klokani z Kralup')).toBe('Kralupy');
  });
});

describe('resolveCompetition', () => {
  it('shortens the RPB 2026/27 teams with diacritics and letters', () => {
    expect(labels([
      'TJ AŠ Mladá Boleslav A', 'Mšeno', 'Šachy Polabí A', 'Sokol Brandýs nad Labem B', 'Šachklub města Dobrovice E',
      'Šachklub města Dobrovice D', 'TJ Neratovice D', 'Šachový klub Bakov nad Jizerou C', 'Odolena Voda A', 'TJ Kralupy nad Vltavou C',
    ])).toMatchInlineSnapshot(`
      [
        "Mladá Boleslav A",
        "Mšeno",
        "Polabí A",
        "Brandýs B",
        "Dobrovice E",
        "Dobrovice D",
        "Neratovice D",
        "Bakov C",
        "Odolena Voda A",
        "Kralupy C",
      ]
    `);
  });
  it('keeps A/B teams of one club apart only by the letter', () => {
    expect(labels(['ŠK Sedlčany A', 'ŠK Sedlčany B'])).toEqual(['Sedlčany A', 'Sedlčany B']);
  });
});
