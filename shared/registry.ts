// Parsers of the ŠSČR registries that have no API (M6): hosting permits (hostovani.appchess.cz),
// foreigner registrations (registracecizincu.appchess.cz) and the chess.cz "Kontrola soupisek" page.
// Confirmed records come from the (undocumented) CSV export `/exportCsvConfirmed/actual` (cp1250, ';'),
// pending ones only from the HTML table of `/unconfirmed`. The Worker fetches them rarely (cache 1 h).
import { fold } from './text';

export type HostingRow = {
  lok: number | null;
  name: string;
  clubName: string;        // player's (home) club
  club: string;            // home club code ('' for pending rows)
  hostClubName: string;
  hostClub: string;        // club where the player is hosting ('' for pending rows)
  comp: string;            // competition name
  org: string;             // organizer (svaz)
  season: string;
  date: string;            // approval date (confirmed only)
  pending: string;         // pending only: who has not approved yet
};

export type ForeignerRow = {
  lok: number | null;
  fide: number | null;
  name: string;
  federation: string;
  clubName: string;
  club: string;            // '' for pending rows
  comp: string;
  org: string;
  season: string;
  date: string;
  pending: string;
};

export type RosterCheckSection = {
  title: string;
  rows: { lok: number | null; name: string; team: string; compId: number | null; comp: string; org: string }[];
};

const int = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Minimal ';' CSV reader with "quoted" fields (no embedded newlines in these exports). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const [head, ...rows] = lines.map(split);
  if (!head) return [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function parseHostingCsv(text: string): HostingRow[] {
  return parseCsv(text).map((r) => ({
    lok: int(r.EV_C_LOK_HRACE),
    name: r.PRIJMENI_JMENO_HRACE,
    clubName: r.ODDIL_HRACE_NAZEV,
    club: r.ODDIL_HRACE_KOD,
    hostClubName: r.HOSTITELSKY_ODDIL_NAZEV,
    hostClub: r.HOSTITELSKY_ODDIL_KOD,
    comp: r.SOUTEZ_NAZEV,
    org: r.SOUTEZ_ORGANIZATOR,
    season: r.SEZONA,
    date: r.DATUM_SCHVALENI,
    pending: '',
  }));
}

export function parseForeignerCsv(text: string): ForeignerRow[] {
  return parseCsv(text).map((r) => ({
    lok: int(r.LOK_ID),
    fide: int(r.FIDE_ID),
    name: r.PRIJMENI_JMENO_HRACE,
    federation: r.FEDERACE,
    clubName: r.ODDIL_NAZEV,
    club: r.ODDIL_KOD,
    comp: r.SOUTEZ_NAZEV,
    org: r.SOUTEZ_ORGANIZATOR,
    season: r.SEZONA,
    date: r.DATUM_SCHVALENI,
    pending: '',
  }));
}

const decodeEntities = (s: string) => s
  .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const cellText = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Rows of the first <table> as arrays of cell HTML (header rows = rows with <b>/<th> only are dropped by callers). */
function tableRows(html: string): string[][] {
  const t = html.slice(html.indexOf('<table'), html.indexOf('</table>') + 8);
  return [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]));
}

/** "Krajský přebor - Šachový svaz Zlínského kraje (ŠSZK)" → [competition, organizer]. */
function splitCompOrg(s: string): [string, string] {
  const i = s.lastIndexOf(' - ');
  return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 3).trim()] : [s, ''];
}

const APPROVALS_HOSTING = ['hráč', 'oddíl hráče', 'hostitelský oddíl'];
const APPROVALS_FOREIGNER = ['hráč', 'oddíl', 'ŠSČR'];
const missingApprovals = (cells: string[], labels: string[]) =>
  labels.filter((_, i) => !/✔|&#10004/.test(cells[i] ?? '')).join(', ');

/** /unconfirmed of hostovani: name, club, host club, "competition - org", season, 3× approval mark. */
export function parseHostingUnconfirmedHtml(html: string): HostingRow[] {
  return tableRows(html)
    .filter((r) => r.length >= 8 && !/<b>/.test(r[0]))
    .map((r) => {
      const [comp, org] = splitCompOrg(cellText(r[3]));
      return {
        lok: null, name: cellText(r[0]), clubName: cellText(r[1]), club: '', hostClubName: cellText(r[2]), hostClub: '',
        comp, org, season: cellText(r[4]), date: '', pending: missingApprovals(r.slice(5, 8), APPROVALS_HOSTING),
      };
    });
}

/** /unconfirmed of registracecizincu: name, FIDE, LOK, federation, club, "competition - org", season, 3× approval. */
export function parseForeignerUnconfirmedHtml(html: string): ForeignerRow[] {
  return tableRows(html)
    .filter((r) => r.length >= 10 && !/<b>/.test(r[0]))
    .map((r) => {
      const [comp, org] = splitCompOrg(cellText(r[5]));
      return {
        lok: int(cellText(r[2])), fide: int(cellText(r[1])), name: cellText(r[0]), federation: cellText(r[3]),
        clubName: cellText(r[4]), club: '', comp, org, season: cellText(r[6]), date: '',
        pending: missingApprovals(r.slice(7, 10), APPROVALS_FOREIGNER),
      };
    });
}

/** chess.cz/kontrola-soupisek: every <h4> section followed by a table of players (links carry LOK and competition id). */
export function parseRosterCheckPage(html: string): RosterCheckSection[] {
  const out: RosterCheckSection[] = [];
  for (const m of html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>\s*<table[\s\S]*?<\/table>/g)) {
    const rows = [...m[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((tr) => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]))
      .filter((c) => c.length >= 3)
      .map((c) => ({
        lok: int(c[0].match(/\/hrac\/(\d+)/)?.[1]),
        name: cellText(c[0]),
        team: cellText(c[1]),
        compId: int(c[2].match(/\/soutez\/(\d+)/)?.[1]),
        comp: cellText(c[2]),
        org: cellText(c[3] ?? ''),
      }));
    out.push({ title: cellText(m[1]), rows });
  }
  return out;
}

/**
 * Competition names across the registries and chess.cz differ in quotes and suffixes
 * ("Regionální přebor 'B'", "Regionální přebor B", "Krajský přebor SŠS"); an application without a group
 * ("Regionální přebor (bez určení skupiny)") is valid for every group of that level.
 */
export function sameCompetition(registryName: string, ours: string): boolean {
  const norm = (s: string) => fold(s).replace(/\(bez urceni skupiny\)/, '').replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ').filter((w) => w && !['sss', 'skupina'].includes(w)).join(' ');
  const r = norm(registryName);
  const o = norm(ours);
  if (r === o) return true;
  return /bez urceni skupiny/.test(fold(registryName)) && (o === r || o.startsWith(r + ' '));
}
