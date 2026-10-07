import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { CONTACT_ORDER_SQL, now, ownedCompetition, ownedTeam, pick, updateStatement, type TeamRow } from '../lib/db';
import { applyRosterImport, previewRosterImport, type ContactRole } from '../lib/rosterImport';
import { TEAM_FIELDS, TEAM_NUMERIC } from './competitions';
import { normalizeDraft } from '../../shared/roster/draft';
import { bestTeamMatch, teamNameScore } from '../../shared/text';
import { normTime, parseStartTime, shortTime, type StartSide } from '../../shared/startTime';
import type { AppEnv } from '../types';

const teams = new Hono<AppEnv>();
teams.use('*', authRequired);

const ROLES: ContactRole[] = ['kapitan', 'zastupce', 'komunikace', 'rozhodci'];
const REQUEST_KINDS = ['start_time', 'draw_no', 'date_change', 'other'];
const REQUEST_STATUSES = ['new', 'accepted', 'rejected'];

// Team detail: fields, contacts, roster versions and the current roster.
teams.get('/teams/:teamId', async (c) => {
  const team = await ownedTeam(c, c.req.param('teamId'));
  if (!team) return c.json({ error: 'Družstvo nenalezeno' }, 404);
  const db = c.env.DB;
  const [contacts, versions] = await db.batch([
    db.prepare(`SELECT * FROM team_contacts WHERE team_id = ? ORDER BY ${CONTACT_ORDER_SQL}`).bind(team.id),
    db.prepare('SELECT id, version, source, filename, base_count, created_at FROM roster_versions WHERE team_id = ? ORDER BY version DESC').bind(team.id),
  ]);
  const version = c.req.query('version');
  const chosen = (versions.results as any[]).find((v) => String(v.version) === version) ?? versions.results[0];
  const players = chosen
    ? (await db.prepare('SELECT * FROM roster_players WHERE roster_version_id = ? ORDER BY position').bind((chosen as any).id).all()).results
    : [];
  return c.json({ team, contacts: contacts.results, versions: versions.results, roster: chosen ? { ...(chosen as object), players } : null });
});

teams.patch('/teams/:teamId', async (c) => {
  const team = await ownedTeam(c, c.req.param('teamId'));
  if (!team) return c.json({ error: 'Družstvo nenalezeno' }, 404);
  const f = pick(await c.req.json<Record<string, unknown>>().catch(() => null), TEAM_FIELDS, TEAM_NUMERIC);
  if ('name' in f && !f.name) return c.json({ error: 'Název družstva nesmí být prázdný' }, 400);
  if ('status' in f && f.status !== 'active' && f.status !== 'reserve') return c.json({ error: 'Neplatný stav' }, 400);
  for (const k of ['start_home', 'start_away'] as const) {
    if (!(k in f)) continue;
    f[k] = f[k] ? normTime(f[k]) : null;
    if (f[k] === '') return c.json({ error: 'Začátek musí mít tvar HH:MM' }, 400);
  }
  if (!Object.keys(f).length) return c.json({ error: 'Nic ke změně' }, 400);
  const stmts = [updateStatement(c.env.DB, 'teams', team.id, f as Record<string, string | number | null>)];
  if (f.status === 'active' && team.status === 'reserve') {
    // Back from the reserve → end of the active list.
    stmts.push(c.env.DB.prepare(
      `UPDATE teams SET position = (SELECT COALESCE(MAX(position), 0) + 1 FROM teams WHERE competition_id = ? AND status = 'active' AND id != ?) WHERE id = ?`
    ).bind(team.competition_id, team.id, team.id));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

teams.delete('/teams/:teamId', async (c) => {
  const team = await ownedTeam(c, c.req.param('teamId'));
  if (!team) return c.json({ error: 'Družstvo nenalezeno' }, 404);
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(team.id).run();
  return c.json({ ok: true });
});

// Replace all contacts of a team.
teams.put('/teams/:teamId/contacts', async (c) => {
  const team = await ownedTeam(c, c.req.param('teamId'));
  if (!team) return c.json({ error: 'Družstvo nenalezeno' }, 404);
  const body = await c.req.json<{ contacts?: { role: string; name?: string; phone?: string; email?: string }[] }>().catch(() => null);
  if (!Array.isArray(body?.contacts) || body!.contacts.some((x) => !ROLES.includes(x.role as ContactRole))) {
    return c.json({ error: 'Neplatné kontakty' }, 400);
  }
  const counter: Record<string, number> = {};
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM team_contacts WHERE team_id = ?').bind(team.id),
    ...body!.contacts
      .filter((x) => x.name?.trim() || x.phone?.trim() || x.email?.trim())
      .map((x) => c.env.DB.prepare('INSERT INTO team_contacts (team_id, role, position, name, phone, email) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(team.id, x.role, (counter[x.role] = (counter[x.role] ?? 0) + 1), x.name?.trim() ?? '', x.phone?.trim() ?? '', x.email?.trim() ?? '')),
  ]);
  return c.json({ ok: true });
});

// Mark a player of the current roster (guest permit / struck) — M6 verification.
teams.patch('/roster-players/:playerId', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT rp.id FROM roster_players rp JOIN roster_versions rv ON rv.id = rp.roster_version_id
     JOIN teams t ON t.id = rv.team_id JOIN competitions co ON co.id = t.competition_id
     WHERE rp.id = ? AND co.owner_id = ?`
  ).bind(c.req.param('playerId'), c.get('user').id).first();
  if (!row) return c.json({ error: 'Hráč nenalezen' }, 404);
  const f = pick(await c.req.json<Record<string, unknown>>().catch(() => null), ['guest_permit', 'struck', 'struck_reason'] as const, ['guest_permit', 'struck'] as const);
  const keys = Object.keys(f);
  if (!keys.length) return c.json({ error: 'Nic ke změně' }, 400);
  await c.env.DB.prepare(`UPDATE roster_players SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => (f as any)[k]), c.req.param('playerId')).run();
  return c.json({ ok: true });
});

/**
 * Roster import (xlsx parsed in the browser / by the skill, or an sscr-soupiska JSON draft).
 * Body: { draft, team_id?, filename?, source?: 'xlsx'|'json', apply?: boolean }.
 * Without team_id the team is matched by the draft's team name. apply=false (default) → preview only.
 */
teams.post('/competitions/:id/rosters/import', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const body = await c.req.json<{ draft?: unknown; team_id?: string; filename?: string; source?: string; apply?: boolean }>().catch(() => null);
  let draft;
  try {
    draft = normalizeDraft(body?.draft);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const { results: all } = await c.env.DB.prepare('SELECT * FROM teams WHERE competition_id = ? ORDER BY status, position').bind(comp.id).all<TeamRow>();
  const candidates = all
    .map((t) => ({ id: t.id, name: t.name, status: t.status, score: Math.round(teamNameScore(draft.header.druzstvo, t.name) * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
  const teamId = body?.team_id ?? bestTeamMatch(draft.header.druzstvo, all, (t) => t.name)?.id;
  if (!teamId) {
    return c.json({ needsTeam: true, draftTeam: draft.header.druzstvo, candidates, draft }, 200);
  }
  const team = await ownedTeam(c, teamId);
  if (!team || team.competition_id !== comp.id) return c.json({ error: 'Družstvo nepatří do této soutěže' }, 400);

  const preview = await previewRosterImport(c.env.DB, team, draft);
  if (!body?.apply) return c.json({ preview, candidates, draft });
  const source = body.source === 'json' ? 'json' : 'xlsx';
  const { version, unchanged } = await applyRosterImport(c.env.DB, team, draft, preview, {
    source, filename: (body.filename ?? '').slice(0, 200), userId: c.get('user').id, competitionId: comp.id,
  });
  return c.json({ ok: true, team_id: team.id, version, unchanged });
});

// ---- Requests for the draw meeting -----------------------------------------------------------

type RequestRow = { id: number; competition_id: string; team_id: string | null; kind: string; text: string; status: string; time: string | null; side: string | null };

const describeStart = (time: string, side: StartSide) => `${side === 'home' ? 'domácí' : 'venkovní'} utkání v ${shortTime(time)}`;

/**
 * An accepted start-time request is the team's start exception (teams.start_home / start_away).
 * Undo the effect of the request's previous state, then apply the new one.
 */
function syncTeamStart(db: D1Database, before: RequestRow | null, after: RequestRow | null): D1PreparedStatement[] {
  const effective = (r: RequestRow | null) =>
    r && r.kind === 'start_time' && r.status === 'accepted' && r.team_id && r.time && (r.side === 'home' || r.side === 'away') ? r : null;
  const out: D1PreparedStatement[] = [];
  const b = effective(before);
  const a = effective(after);
  if (b && !(a && a.side === b.side && a.time === b.time && a.team_id === b.team_id)) {
    const col = b.side === 'home' ? 'start_home' : 'start_away';
    out.push(db.prepare(`UPDATE teams SET ${col} = NULL, updated_at = ? WHERE id = ? AND ${col} = ?`).bind(now(), b.team_id, b.time));
  }
  if (a) {
    const col = a.side === 'home' ? 'start_home' : 'start_away';
    out.push(db.prepare(`UPDATE teams SET ${col} = ?, updated_at = ? WHERE id = ?`).bind(a.time, now(), a.team_id));
  }
  return out;
}

teams.post('/competitions/:id/requests', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const body = await c.req.json<{ team_id?: string; kind?: string; text?: string; round?: number; time?: string; side?: string }>().catch(() => null);
  if (!REQUEST_KINDS.includes(body?.kind ?? '')) return c.json({ error: 'Zadejte typ požadavku' }, 400);
  let time: string | null = null;
  let side: StartSide | null = null;
  let text = body?.text?.trim() ?? '';
  if (body!.kind === 'start_time') {
    const parsed = parseStartTime(text);
    time = normTime(body!.time) || parsed?.time || '';
    side = body!.side === 'away' || body!.side === 'home' ? body!.side : parsed?.side ?? 'home';
    if (!time) return c.json({ error: 'Zadejte čas začátku ve tvaru HH:MM' }, 400);
    if (!body!.team_id) return c.json({ error: 'Požadavek na začátek utkání musí mít družstvo' }, 400);
    text ||= describeStart(time, side);
  }
  if (!text) return c.json({ error: 'Zadejte text požadavku' }, 400);
  if (body!.team_id) {
    const team = await ownedTeam(c, body!.team_id);
    if (!team || team.competition_id !== comp.id) return c.json({ error: 'Družstvo nepatří do této soutěže' }, 400);
  }
  await c.env.DB.prepare('INSERT INTO requests (competition_id, team_id, kind, text, round, time, side, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(comp.id, body!.team_id ?? null, body!.kind, text, body!.round ?? null, time, side, 'manual', now()).run();
  return c.json({ ok: true }, 201);
});

async function ownedRequest(c: any, id: string): Promise<RequestRow | null> {
  return c.env.DB.prepare(
    'SELECT r.* FROM requests r JOIN competitions co ON co.id = r.competition_id WHERE r.id = ? AND co.owner_id = ?'
  ).bind(id, c.get('user').id).first();
}

teams.patch('/requests/:reqId', async (c) => {
  const before = await ownedRequest(c, c.req.param('reqId'));
  if (!before) return c.json({ error: 'Požadavek nenalezen' }, 404);
  const f = pick(await c.req.json<Record<string, unknown>>().catch(() => null), ['kind', 'text', 'round', 'status', 'decision', 'time', 'side'] as const, ['round'] as const);
  if ('kind' in f && !REQUEST_KINDS.includes(String(f.kind))) return c.json({ error: 'Neplatný typ' }, 400);
  if ('status' in f && !REQUEST_STATUSES.includes(String(f.status))) return c.json({ error: 'Neplatný stav' }, 400);
  if ('side' in f && f.side !== 'home' && f.side !== 'away') return c.json({ error: 'Neplatná strana (home/away)' }, 400);
  if ('time' in f) {
    f.time = f.time ? normTime(f.time) : null;
    if (f.time === '') return c.json({ error: 'Čas musí mít tvar HH:MM' }, 400);
  }
  const after = { ...before, ...f } as RequestRow;
  if (after.kind === 'start_time') {
    // Older rows (before structured times) carry only text — derive the time when it gets decided.
    const parsed = parseStartTime(after.text);
    after.time ??= parsed?.time ?? null;
    after.side ??= parsed?.side ?? 'home';
    f.time = after.time;
    f.side = after.side;
    if (after.status === 'accepted' && !after.time) return c.json({ error: 'Nejdřív zadejte čas začátku (HH:MM)' }, 400);
  }
  const keys = Object.keys(f);
  if (!keys.length) return c.json({ error: 'Nic ke změně' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE requests SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => (f as any)[k]), before.id),
    ...syncTeamStart(c.env.DB, before, after),
  ]);
  return c.json({ ok: true });
});

teams.delete('/requests/:reqId', async (c) => {
  const before = await ownedRequest(c, c.req.param('reqId'));
  if (!before) return c.json({ error: 'Požadavek nenalezen' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(before.id),
    ...syncTeamStart(c.env.DB, before, null),
  ]);
  return c.json({ ok: true });
});

export { teams };
