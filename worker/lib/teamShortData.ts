import { buildDictIndex, buildGazIndex, type ShortenData } from '../../shared/teamShorten';
import dict from '../data/team-shorten/dict.json';
import gazetteer from '../data/team-shorten/gazetteer.json';

// Reference data for short team names, copied from pgn-base backend/data/team-shorten (club_label_dict.json,
// gazetteer_obce.json) as [label, clubName] / [full, core] pairs. Bundled into the Worker (≈280 kB) instead of D1
// tables: it is only read, and only on the Swiss-Manager page. Indexes are built once per isolate.
let cached: ShortenData | null = null;

export function shortenData(): ShortenData {
  cached ??= {
    dict: buildDictIndex((dict as [string, string][]).map(([label, clubName]) => ({ label, clubName }))),
    gaz: buildGazIndex((gazetteer as [string, string][]).map(([full, core]) => ({ full, core }))),
  };
  return cached;
}
