import type { CzCheck, VCheck } from '../../../shared/roster/verify';

export type Competition = {
  id: string; season: string; region: string; level: string; group_code: string; short: string; name: string;
  boards: number; default_start: string; time_control: string; manager_name: string; manager_email: string;
  manager_phone: string; mutual_deadline: string | null; chesscz_comp_id: number | null; phase: string; notes: string;
  updated_at: number;
};
export type CompetitionListItem = Pick<Competition, 'id' | 'season' | 'short' | 'name' | 'level' | 'phase' | 'boards' | 'chesscz_comp_id' | 'updated_at'> & {
  team_count: number; roster_count: number;
};
export type Round = { round: number; date: string; note: string };
export type Contact = { id?: number; role: 'kapitan' | 'zastupce' | 'komunikace' | 'rozhodci'; position?: number; name: string; phone: string; email: string };
export type Team = {
  id: string; competition_id: string; name: string; club_name: string; club_code: string | null;
  chesscz_team_id: number | null; position: number; draw_no: number | null; status: 'active' | 'reserve';
  venue: string; shoes: string; start_pref: string; start_home: string | null; start_away: string | null; draw_requests: string; notes: string;
};
export type TeamWithSummary = Team & {
  contacts: Contact[];
  roster: { version: number; created_at: number; source: string; filename: string; players: number } | null;
};
export type Request = {
  id: number; competition_id: string; team_id: string | null; kind: string; text: string; round: number | null;
  status: 'new' | 'accepted' | 'rejected'; decision: string; source: string; created_at: number;
  time: string | null; side: 'home' | 'away' | null;
};
export type CompetitionDetail = { competition: Competition; rounds: Round[]; teams: TeamWithSummary[]; requests: Request[] };
export type RosterPlayer = {
  id: number; position: number; name: string; birth_year: number | null; lok: number | null; fide: number | null;
  flags: string; base: number; guest_permit: number; struck: number; struck_reason: string;
  cz: CzCheck | null; cz_checked_at: number | null;
  v: VCheck | null; v_checked_at: number | null;
};
export type RosterCheckData = {
  teams: { id: string; name: string; club_name: string; club_code: string | null; players: RosterPlayer[] | null }[];
};
export type RosterVersion = { id: string; version: number; source: string; filename: string; base_count: number; created_at: number };
