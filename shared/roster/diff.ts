// Difference between two roster versions — shown during manual verification of an import.
import { fold } from '../text';
import type { DraftPlayer } from './draft';

export type RosterPlayerLike = Pick<DraftPlayer, 'jmeno' | 'rok' | 'lok' | 'fide' | 'ozn' | 'z'>;

export type PlayerChange = { jmeno: string; changes: { field: keyof RosterPlayerLike | 'poradi'; from: unknown; to: unknown }[] };
export type RosterDiff = {
  added: RosterPlayerLike[];
  removed: RosterPlayerLike[];
  changed: PlayerChange[];
  unchanged: number;
};

const key = (p: RosterPlayerLike) => (p.lok !== '' && p.lok != null ? `lok:${p.lok}` : `name:${fold(p.jmeno)}`);
const FIELDS: (keyof RosterPlayerLike)[] = ['jmeno', 'rok', 'lok', 'fide', 'ozn', 'z'];

export function diffRosters(before: RosterPlayerLike[], after: RosterPlayerLike[]): RosterDiff {
  const old = new Map(before.map((p, i) => [key(p), { p, i }]));
  const out: RosterDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  after.forEach((p, i) => {
    const o = old.get(key(p)) ?? [...old.values()].find((x) => fold(x.p.jmeno) === fold(p.jmeno));
    if (!o) {
      out.added.push(p);
      return;
    }
    old.delete(key(o.p));
    const changes: PlayerChange['changes'] = [];
    for (const f of FIELDS) {
      const a = o.p[f] ?? '';
      const b = p[f] ?? '';
      if (String(a) !== String(b)) changes.push({ field: f, from: a, to: b });
    }
    if (o.i !== i) changes.push({ field: 'poradi', from: o.i + 1, to: i + 1 });
    if (changes.length) out.changed.push({ jmeno: p.jmeno, changes });
    else out.unchanged++;
  });
  out.removed = [...old.values()].map((x) => x.p);
  return out;
}
