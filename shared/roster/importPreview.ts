// Shape of a roster import preview (worker/lib/rosterImport.ts) — shared so the web UI can type it.
import type { RosterDiff } from './diff';

export type ContactRole = 'kapitan' | 'zastupce' | 'komunikace' | 'rozhodci';
export type Contact = { role: ContactRole; position: number; name: string; phone: string; email: string };

export type RosterImportPreview = {
  team: { id: string; name: string };
  previousVersion: number | null;
  diff: RosterDiff;
  warnings: string[];
  teamChanges: { field: 'venue' | 'shoes' | 'start_pref' | 'draw_requests' | 'club_name'; from: string; to: string }[];
  contacts: { replace: boolean; from: Contact[]; to: Contact[] };
  newRequests: { kind: string; text: string }[];
};
