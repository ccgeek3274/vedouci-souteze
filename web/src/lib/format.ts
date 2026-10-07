export const LEVEL_LABEL: Record<string, string> = {
  KP: 'Krajský přebor', KS: 'Krajská soutěž', RP: 'Regionální přebor', RS: 'Regionální soutěž', other: 'Jiná',
};
export const PHASE_LABEL: Record<string, string> = {
  preparation: 'Příprava', draw: 'Losování', running: 'Probíhá', finished: 'Ukončeno',
};
export const ROLE_LABEL: Record<string, string> = {
  kapitan: 'Kapitán', zastupce: 'Zástupce kapitána', komunikace: 'Komunikace', rozhodci: 'Rozhodčí',
};
export const REQUEST_KIND_LABEL: Record<string, string> = {
  start_time: 'Začátek utkání', draw_no: 'Losovací číslo', date_change: 'Změna termínu', other: 'Jiný požadavek',
};
export const REQUEST_STATUS_LABEL: Record<string, string> = { new: 'Nový', accepted: 'Vyhověno', rejected: 'Zamítnuto' };

const WEEKDAY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** "2026-10-18" → "18. 10. 2026" (optionally with weekday). */
export function czDate(iso: string | null | undefined, withWeekday = false): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const s = `${d}. ${m}. ${y}`;
  return withWeekday ? `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${s}` : s;
}

export function czDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Number of rounds of a round robin with n teams (odd n → one team has a bye each round). */
export function roundCount(teams: number): number {
  return teams < 2 ? 0 : teams % 2 === 0 ? teams - 1 : teams;
}
