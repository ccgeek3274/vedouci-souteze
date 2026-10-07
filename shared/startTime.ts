// Start-time requests: "10hod", "10:00", "10", "9.30", "domácí od 10 h", "venku 10:00" → { time: "10:00", side }.
// Model follows uvodni-zpravodaj: per team an exception for home matches and one for away matches
// (cfg.home / cfg.away there; teams.start_home / teams.start_away here).
import { fold } from './text';

export type StartSide = 'home' | 'away';

/** "9:00" / "09:00" / "9.00" → "09:00"; anything else → ''. */
export function normTime(v: unknown): string {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(v ?? ''));
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Display form without the leading zero ("09:00" → "9:00"), as in the bulletins. */
export function shortTime(v: unknown): string {
  const t = normTime(v);
  return t ? t.replace(/^0/, '') : '';
}

/**
 * Parse a free-text start preference. A bare number or time means the team's home matches
 * (the usual request); "venku"/"hosté"/"venkovní" switches to away. Returns null when no time is found.
 */
export function parseStartTime(text: unknown): { time: string; side: StartSide } | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const f = fold(s);
  const side: StartSide = /\b(venk|host[eéi]|hostuj|v[ey]jezd)/.test(f) ? 'away' : 'home';
  const hm = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(f);
  if (hm) {
    const t = normTime(`${hm[1]}:${hm[2]}`);
    return t ? { time: t, side } : null;
  }
  const h = /(?:^|\D)(\d{1,2})(?:\s*(?:h|hod|hodin|hod\.)\b|\s*$)/.exec(f);
  if (h && +h[1] >= 6 && +h[1] <= 20) return { time: `${h[1].padStart(2, '0')}:00`, side };
  return null;
}
