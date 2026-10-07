// Read a roster file in the browser: e-soupiska .xlsx (parsed via shared/roster/xlsx.ts) or sscr-soupiska .json draft.
import { normalizeDraft, type RosterDraft } from '../../../shared/roster/draft';
import { parseRosterGrid } from '../../../shared/roster/xlsx';
import { pickRosterSheet, worksheetToGrid } from '../../../shared/roster/excelGrid';

export type ParsedRosterFile =
  | { ok: true; filename: string; source: 'xlsx' | 'json'; draft: RosterDraft; warnings: string[] }
  | { ok: false; filename: string; error: string };

export async function readRosterFile(file: File): Promise<ParsedRosterFile> {
  const filename = file.name;
  try {
    if (/\.json$/i.test(filename)) {
      return { ok: true, filename, source: 'json', draft: normalizeDraft(JSON.parse(await file.text())), warnings: [] };
    }
    if (/\.xls$/i.test(filename)) {
      return { ok: false, filename, error: 'Starý formát .xls není podporován — otevřete soubor v Excelu a uložte jako .xlsx.' };
    }
    if (!/\.xlsx$/i.test(filename)) {
      return { ok: false, filename, error: 'Podporované jsou soubory .xlsx (e-soupiska) a .json (rozpracovaná soupiska).' };
    }
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = pickRosterSheet(wb.worksheets as any);
    if (!ws) return { ok: false, filename, error: 'Sešit neobsahuje žádný list.' };
    const { draft, warnings } = parseRosterGrid(worksheetToGrid(ws as any));
    return { ok: true, filename, source: 'xlsx', draft, warnings };
  } catch (e) {
    return { ok: false, filename, error: (e as Error).message || 'Soubor se nepodařilo načíst.' };
  }
}
