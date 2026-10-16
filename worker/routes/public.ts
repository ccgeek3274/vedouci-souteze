import { Hono } from 'hono';
import { chessczGet } from '../lib/chesscz';
import { CONTACT_ORDER_SQL, type CompetitionRow, type TeamRow } from '../lib/db';
import { parseCzSchedule, parseCzTable } from '../../shared/bulletin/source';
import { competitionSchedule, refKey, scheduleRounds } from '../../shared/schedule';
import { shortTime } from '../../shared/startTime';
import type { PublicSchedule } from '../../shared/publicSchedule';
import type { AppEnv } from '../types';

// Public schedule (no login): only competitions the owner published (competitions.published = 1). Teams and rounds
// from chess.cz through the cached proxy (else the app's Berger draw), starts and referees from the app.
// Contacts: the captain only (+ venue).
const publicApi = new Hono<AppEnv>();

publicApi.get('/competitions/:id', async (c) => {
  const db = c.env.DB;
  const comp = await db.prepare('SELECT * FROM competitions WHERE id = ? AND published = 1').bind(c.req.param('id')).first<CompetitionRow>();
  if (!comp) return c.json({ error: 'Rozlosování není zveřejněno' }, 404);
  const [rounds, teams, captains, refs] = await db.batch([
    db.prepare('SELECT round, date FROM competition_rounds WHERE competition_id = ?').bind(comp.id),
    db.prepare("SELECT * FROM teams WHERE competition_id = ? AND status = 'active' ORDER BY position").bind(comp.id),
    db.prepare(
      `SELECT tc.team_id, tc.name, tc.phone, tc.email FROM team_contacts tc JOIN teams t ON t.id = tc.team_id
       WHERE t.competition_id = ? AND tc.role = 'kapitan' ORDER BY ${CONTACT_ORDER_SQL.replace(/role|position/g, (m) => `tc.${m}`)}`
    ).bind(comp.id),
    db.prepare('SELECT round, home_key, name FROM referee_assignments WHERE competition_id = ?').bind(comp.id),
  ]);

  const cz = { details: null as any, teams: [] as ReturnType<typeof parseCzTable>, rounds: [] as ReturnType<typeof parseCzSchedule> };
  if (comp.chesscz_comp_id) {
    const get = async (p: string) => {
      const r = await chessczGet(db, `/competitions/${comp.chesscz_comp_id}/${p}`);
      return r.status === 200 ? (r.body as { data: unknown }).data : null;
    };
    cz.details = await get('details');
    cz.teams = parseCzTable(await get('table'));
    cz.rounds = parseCzSchedule(await get('schedule'));
  }

  const active = teams.results as TeamRow[];
  const sched = competitionSchedule(active, cz, new Map((rounds.results as any[]).map((r) => [r.round, r.date])), true);
  const captain = new Map<string, { name: string; phone: string; email: string }>();
  for (const r of captains.results as any[]) if (!captain.has(r.team_id)) captain.set(r.team_id, { name: r.name, phone: r.phone, email: r.email });
  const ref = new Map((refs.results as any[]).map((r) => [refKey(r.round, r.home_key), r.name as string]));

  const body: PublicSchedule = {
    competition: {
      name: cz.details?.compName || comp.name, region: cz.details?.regionName || comp.region, season: comp.season,
      chessczUrl: comp.chesscz_comp_id ? `https://www.chess.cz/soutez/${comp.chesscz_comp_id}/` : null,
      chessResultsUrl: cz.details?.compWww || null,
      defaultStart: shortTime(comp.default_start),
    },
    teams: sched.teams.map((t) => ({
      key: t.key, stc: t.stc, name: t.name,
      venue: t.app?.venue ?? '',
      captain: t.app ? captain.get(t.app.id) ?? null : null,
    })),
    rounds: scheduleRounds(sched, comp.default_start, comp.last_start).map((r) => ({
      ...r, matches: r.matches.map((m) => ({ ...m, ref: ref.get(refKey(r.nr, m.home)) ?? '' })),
    })),
  };
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(body);
});

export { publicApi };
