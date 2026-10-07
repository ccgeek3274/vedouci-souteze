// Roster import: draft (sscr-soupiska v1) → new roster version + team data (contacts, venue, …) + draw requests.
// Always computable as a dry-run preview first; the UI shows it for manual verification.
import { diffRosters } from '../../shared/roster/diff';
import type { Contact, ContactRole, RosterImportPreview } from '../../shared/roster/importPreview';
import { draftWarnings, type DraftContact, type RosterDraft } from '../../shared/roster/draft';
import { fold } from '../../shared/text';
import { CONTACT_ORDER_SQL, CONTACT_ROLE_ORDER, now, type TeamRow } from './db';

export type { ContactRole };

export function draftContacts(d: RosterDraft): Contact[] {
  const out: Contact[] = [];
  const add = (role: ContactRole, list: DraftContact[]) =>
    list.forEach((x, i) => {
      if (x.jmeno || x.tel || x.email) out.push({ role, position: i + 1, name: x.jmeno, phone: x.tel, email: x.email });
    });
  add('kapitan', [{ jmeno: d.extra.kapJmeno, tel: d.extra.kapTel, email: d.extra.kapEmail }]);
  add('zastupce', [{ jmeno: d.extra.zastJmeno, tel: d.extra.zastTel, email: d.extra.zastEmail }]);
  add('komunikace', d.extra.komunikace);
  add('rozhodci', d.extra.rozhodci);
  return out;
}

const sameContacts = (a: Contact[], b: Contact[]) =>
  JSON.stringify(a.map((x) => [x.role, x.name, x.phone, x.email])) === JSON.stringify(b.map((x) => [x.role, x.name, x.phone, x.email]));

export async function previewRosterImport(db: D1Database, team: TeamRow & { boards: number }, draft: RosterDraft): Promise<RosterImportPreview> {
  const current = await db.prepare(
    `SELECT rv.version, rp.name AS jmeno, rp.birth_year AS rok, rp.lok, rp.fide, rp.flags AS ozn, rp.base AS z
     FROM roster_versions rv LEFT JOIN roster_players rp ON rp.roster_version_id = rv.id
     WHERE rv.team_id = ? AND rv.version = (SELECT MAX(version) FROM roster_versions WHERE team_id = ?)
     ORDER BY rp.position`
  ).bind(team.id, team.id).all<any>();
  const prevVersion = current.results[0]?.version ?? null;
  const before = current.results.filter((r) => r.jmeno != null).map((r) => ({
    jmeno: r.jmeno, rok: r.rok ?? '', lok: r.lok ?? '', fide: r.fide ?? '', ozn: r.ozn, z: !!r.z,
  }));

  const teamChanges: RosterImportPreview['teamChanges'] = [];
  const proposed = {
    venue: draft.extra.hraciMistnost,
    shoes: draft.extra.prezuvky,
    start_pref: draft.extra.preferZacatek,
    draw_requests: draft.extra.pozadavkyLosovani,
    club_name: team.club_name ? '' : draft.header.oddil,   // fill the club only when unknown
  };
  for (const [field, to] of Object.entries(proposed) as [keyof typeof proposed, string][]) {
    if (to && to !== team[field]) teamChanges.push({ field, from: team[field], to });
  }

  const { results: oldContacts } = await db.prepare(
    `SELECT role, position, name, phone, email FROM team_contacts WHERE team_id = ? ORDER BY ${CONTACT_ORDER_SQL}`
  ).bind(team.id).all<Contact>();
  const newContacts = draftContacts(draft);
  const order = (l: Contact[]) => [...l].sort((a, b) => CONTACT_ROLE_ORDER.indexOf(a.role) - CONTACT_ROLE_ORDER.indexOf(b.role) || a.position - b.position);

  const { results: existingReq } = await db.prepare('SELECT text FROM requests WHERE team_id = ?').bind(team.id).all<{ text: string }>();
  const newRequests = [
    { kind: 'start_time', text: draft.extra.preferZacatek },
    { kind: 'other', text: draft.extra.pozadavkyLosovani },
  ].filter((r) => r.text && !existingReq.some((e) => fold(e.text) === fold(r.text)));

  return {
    team: { id: team.id, name: team.name },
    previousVersion: prevVersion,
    diff: diffRosters(before, draft.players),
    warnings: draftWarnings(draft, team.boards),
    teamChanges,
    contacts: { replace: newContacts.length > 0 && !sameContacts(order(oldContacts), order(newContacts)), from: order(oldContacts), to: order(newContacts) },
    newRequests,
  };
}

export async function applyRosterImport(
  db: D1Database,
  team: TeamRow & { boards: number },
  draft: RosterDraft,
  preview: RosterImportPreview,
  meta: { source: 'xlsx' | 'json' | 'manual'; filename: string; userId: string; competitionId: string }
): Promise<{ version: number; unchanged: boolean }> {
  if (rosterImportIsNoop(preview)) return { version: preview.previousVersion!, unchanged: true };
  const version = (preview.previousVersion ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const t = now();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO roster_versions (id, team_id, version, source, filename, base_count, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(versionId, team.id, version, meta.source, meta.filename, draft.zakladCount, meta.userId, t),
    ...draft.players.map((p, i) => db.prepare(
      `INSERT INTO roster_players (roster_version_id, position, name, birth_year, lok, fide, flags, base)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(versionId, i + 1, p.jmeno, p.rok || null, p.lok || null, p.fide || null, p.ozn, p.z ? 1 : 0)),
  ];
  if (preview.teamChanges.length) {
    const sets = preview.teamChanges.map((ch) => `${ch.field} = ?`).join(', ');
    stmts.push(db.prepare(`UPDATE teams SET ${sets}, updated_at = ? WHERE id = ?`).bind(...preview.teamChanges.map((ch) => ch.to), t, team.id));
  }
  if (preview.contacts.replace) {
    stmts.push(db.prepare('DELETE FROM team_contacts WHERE team_id = ?').bind(team.id));
    for (const ct of preview.contacts.to) {
      stmts.push(db.prepare('INSERT INTO team_contacts (team_id, role, position, name, phone, email) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(team.id, ct.role, ct.position, ct.name, ct.phone, ct.email));
    }
  }
  for (const r of preview.newRequests) {
    stmts.push(db.prepare(`INSERT INTO requests (competition_id, team_id, kind, text, source, created_at) VALUES (?, ?, ?, ?, 'roster', ?)`)
      .bind(meta.competitionId, team.id, r.kind, r.text, t));
  }
  stmts.push(db.prepare(
    `INSERT INTO import_log (owner_id, competition_id, source, filename, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(meta.userId, meta.competitionId, `roster-${meta.source}`, meta.filename,
    JSON.stringify({ team: team.name, version, players: draft.players.length, added: preview.diff.added.length, removed: preview.diff.removed.length }), t));
  await db.batch(stmts);
  return { version, unchanged: false };
}

/** Re-importing the same file must not create an identical new version. */
export function rosterImportIsNoop(p: RosterImportPreview): boolean {
  const d = p.diff;
  return p.previousVersion != null && !d.added.length && !d.removed.length && !d.changed.length
    && !p.teamChanges.length && !p.contacts.replace && !p.newRequests.length;
}
