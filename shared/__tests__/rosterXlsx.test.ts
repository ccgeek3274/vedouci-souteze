import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { worksheetToGrid, pickRosterSheet } from '../roster/excelGrid';
import { parseRosterGrid, RosterFormatError } from '../roster/xlsx';

// Real (anonymized) rosters from RPB 2026/27 — see doc/analyza-soupisek.md.
const DIR = new URL('../../doc/soupisky/', import.meta.url).pathname;

async function parseFile(name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DIR + name);
  return parseRosterGrid(worksheetToGrid(pickRosterSheet(wb.worksheets as any)!));
}

describe.skipIf(!existsSync(DIR))('e-soupiska xlsx import (real files)', () => {
  it('standard 2026/27 template', async () => {
    const { draft, warnings } = await parseFile('E-soupiska_2026-2027 TJ Neratovice D.xlsx');
    expect(warnings).toEqual([]);
    expect(draft.header).toEqual({
      kraj: 'Středočeský šachový svaz (SŠS)', soutez: 'Regionální přebor - skupina B',
      druzstvo: 'TJ Neratovice D', oddil: 'TJ Neratovice',
    });
    expect(draft.players).toHaveLength(18);
    expect(draft.players[0]).toMatchObject({ jmeno: 'Červinka Pavel', rok: 1984, lok: 13470, fide: '', ozn: 'V', z: true });
    expect(draft.players.filter((p) => p.z)).toHaveLength(8);
    expect(draft.players.find((p) => p.jmeno === 'Huja Matěj')?.ozn).toBe('K');
    expect(draft.extra).toMatchObject({
      kapJmeno: 'Huja Matěj', kapEmail: 'huja.matej@example.cz', zastJmeno: 'Adámek Jan',
      hraciMistnost: 'Sportovní hala, Kpt. Jaroše 233, Neratovice', prezuvky: 'ne',
      preferZacatek: '', pozadavkyLosovani: '',
    });
    expect(draft.extra.kapTel).toMatch(/^\d{3} \d{3} \d{3}$/);
    expect(draft.extra.rozhodci.map((r) => r.jmeno)).toEqual(['Huja Matěj', 'Adámek Jan']);
  });

  it('communication contacts, draw requests and a time-formatted start preference', async () => {
    const { draft } = await parseFile('KRALUPY C_E-soupiska_2026-2027.xlsx');
    expect(draft.players).toHaveLength(20);
    expect(draft.extra.komunikace.map((c) => c.jmeno)).toEqual(['Langmaier Pavel']);
    expect(draft.extra.pozadavkyLosovani).toBe('protičíslo ke Kralupy A (KP)');
    expect(draft.extra.preferZacatek).toBe('10:00');
  });

  it('"nejsou" means no request', async () => {
    const { draft } = await parseFile('Soupiska Sokol Brandýs n.L.B.xlsx');
    expect(draft.extra.preferZacatek).toBe('');
    expect(draft.extra.pozadavkyLosovani).toBe('');
  });

  it('older template variant (no FIDE column, shifted rows) via label anchors', async () => {
    const { draft, warnings } = await parseFile('Mšeno soupiska.xlsx');
    expect(draft.players).toHaveLength(15);
    expect(draft.players[2]).toMatchObject({ jmeno: 'Gruber Tomáš', lok: 34661, ozn: 'H', z: true });
    expect(draft.extra.preferZacatek).toBe('10hod');
    expect(draft.extra.kapJmeno).toBe('Burda Roman');
    expect(warnings).toHaveLength(2);
  });

  it('rejects a custom format', async () => {
    await expect(parseFile('Soupiska_Excel_2026 Bakov C.xlsx')).rejects.toBeInstanceOf(RosterFormatError);
  });
});
