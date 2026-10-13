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

/** "3, 7", "3 7", "2-4" → sorted unique round numbers (1–99). */
export function parseRounds(v: unknown): number[] {
  const out = new Set<number>();
  for (const part of String(v ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d{1,2})\.?(?:-(\d{1,2})\.?)?$/.exec(part);
    if (!m) continue;
    const from = +m[1], to = m[2] ? +m[2] : from;
    for (let r = Math.min(from, to); r <= Math.max(from, to); r++) if (r >= 1) out.add(r);
  }
  return [...out].sort((a, b) => a - b);
}

/** Stored form of the rounds ("3,7"); null when the text contains something that is not a round. */
export function normRounds(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const ok = s.split(/[\s,;]+/).filter(Boolean).every((p) => /^\d{1,2}\.?(?:-\d{1,2}\.?)?$/.test(p));
  return ok ? parseRounds(s).join(',') : null;
}

/** "3,7" → "3. a 7. kole" (bulletin / summaries). */
export function roundsText(v: unknown): string {
  const r = parseRounds(v).map((n) => `${n}.`);
  return r.length ? `${r.length > 1 ? `${r.slice(0, -1).join(', ')} a ${r[r.length - 1]}` : r[0]} kole` : '';
}

export type StartTeam = { start_home?: string | null; start_away?: string | null; start_home_skip?: string; start_away_skip?: string };

/**
 * Start of one match in round `round` (as in uvodni-zpravodaj matchTime): the home team's home exception or the away
 * team's away exception, unless the round is excluded for it; different exceptions = conflict.
 * The last round never uses exceptions — all its matches start at lastStart (if set) or the default start.
 */
export function matchStart(
  home: StartTeam | null, away: StartTeam | null, defaultStart: string,
  round: { nr: number; last: boolean; lastStart?: string | null },
): { time: string; exception: boolean; conflict: boolean } {
  const d = normTime(defaultStart);
  if (round.last) return { time: normTime(round.lastStart) || d, exception: false, conflict: false };
  const valid = (t: string | null | undefined, skip: string | undefined) => (parseRounds(skip).includes(round.nr) ? '' : normTime(t));
  const h = valid(home?.start_home, home?.start_home_skip);
  const a = valid(away?.start_away, away?.start_away_skip);
  if (h && a && h !== a) return { time: h, exception: true, conflict: true };
  const t = h || a;
  return t && t !== d ? { time: t, exception: true, conflict: false } : { time: d, exception: false, conflict: false };
}
