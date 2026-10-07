// Data-access helpers shared by routes. Every lookup is scoped to the owner (each user sees only their data).
import type { Context } from 'hono';
import type { AppEnv } from '../types';

export const now = () => Math.floor(Date.now() / 1000);

/** Contacts in the order of the e-soupiska: captain, deputy, communication, referees. */
export const CONTACT_ORDER_SQL = "CASE role WHEN 'kapitan' THEN 1 WHEN 'zastupce' THEN 2 WHEN 'komunikace' THEN 3 ELSE 4 END, position";
export const CONTACT_ROLE_ORDER = ['kapitan', 'zastupce', 'komunikace', 'rozhodci'];

export type CompetitionRow = {
  id: string; owner_id: string; season: string; region: string; level: string; group_code: string;
  short: string; name: string; boards: number; default_start: string; time_control: string;
  manager_name: string; manager_email: string; manager_phone: string; mutual_deadline: string | null;
  chesscz_comp_id: number | null; phase: string; notes: string; created_at: number; updated_at: number;
};

export type TeamRow = {
  id: string; competition_id: string; name: string; club_name: string; club_code: string | null;
  chesscz_team_id: number | null; position: number; draw_no: number | null; status: 'active' | 'reserve';
  venue: string; shoes: string; start_pref: string; start_home: string | null; start_away: string | null; draw_requests: string; notes: string;
  created_at: number; updated_at: number;
};

export async function ownedCompetition(c: Context<AppEnv>, id: string): Promise<CompetitionRow | null> {
  return c.env.DB.prepare('SELECT * FROM competitions WHERE id = ? AND owner_id = ?')
    .bind(id, c.get('user').id).first<CompetitionRow>();
}

export async function ownedTeam(c: Context<AppEnv>, teamId: string): Promise<(TeamRow & { boards: number }) | null> {
  return c.env.DB.prepare(
    `SELECT t.*, c.boards FROM teams t JOIN competitions c ON c.id = t.competition_id
     WHERE t.id = ? AND c.owner_id = ?`
  ).bind(teamId, c.get('user').id).first<TeamRow & { boards: number }>();
}

/** Pick only known, string/number-typed keys from an untrusted body. */
export function pick<K extends string>(body: Record<string, unknown> | null, keys: readonly K[], numeric: readonly K[] = []): Partial<Record<K, string | number | null>> {
  const out: Partial<Record<K, string | number | null>> = {};
  if (!body) return out;
  for (const k of keys) {
    if (!(k in body)) continue;
    const v = body[k];
    if (numeric.includes(k)) {
      out[k] = v === null || v === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
    } else {
      out[k] = v == null ? '' : String(v).trim();
    }
  }
  return out;
}

/** UPDATE <table> SET … for the given fields (+ updated_at). */
export function updateStatement(db: D1Database, table: 'competitions' | 'teams', id: string, fields: Record<string, string | number | null>) {
  const keys = Object.keys(fields);
  const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
  return db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).bind(...keys.map((k) => fields[k]), now(), id);
}
