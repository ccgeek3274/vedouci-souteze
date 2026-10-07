import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  planCompetitionImport, planIsNoop, validateCompetitionImport,
  type CompetitionPlan, type ExistingCompetition,
} from '../import/competition';

const load = (f: string) => validateCompetitionImport(JSON.parse(readFileSync(new URL(`../../doc/import/${f}`, import.meta.url), 'utf8')));
const rozpis = load('sss-2026-27-rozpis.json');
const rozdeleni = load('sss-2026-27-rozdeleni.json');

/** Simulate applying a plan → the "existing" state the next import sees. */
function apply(plans: CompetitionPlan[], state: ExistingCompetition[]): ExistingCompetition[] {
  let n = 0;
  for (const p of plans) {
    let ex = state.find((e) => e.id === p.existingId);
    if (!ex) {
      ex = { id: `c${p.short}`, season: '2026/2027', short: p.short, fields: { ...p.fields } as any, rounds: [], teams: [] };
      state.push(ex);
    }
    for (const fc of p.fieldChanges) ex.fields[fc.field] = fc.to;
    if (p.rounds.replace || p.action === 'create') ex.rounds = p.rounds.target;
    for (const t of p.teams ?? []) {
      if (t.action === 'add') ex.teams.push({ id: `t${++n}${p.short}`, name: t.name, status: 'active', position: t.position });
      if (t.action === 'keep') Object.assign(ex.teams.find((x) => x.id === t.id)!, { status: 'active', position: t.position });
      if (t.action === 'reserve') ex.teams.find((x) => x.id === t.id)!.status = 'reserve';
    }
  }
  return state;
}

describe('competition import', () => {
  it('validates the generated documents', () => {
    expect(rozpis.competitions.map((c) => c.short)).toEqual(['KP', 'KSA', 'KSB', 'RPA', 'RPB', 'RPC', 'RPD', 'RSA', 'RSB', 'RSC', 'RSD']);
    expect(() => validateCompetitionImport({ ...rozpis, season: '2026' })).toThrow(/season/);
    expect(() => validateCompetitionImport({ ...rozpis, competitions: [{ short: 'X', level: 'XX', name: 'a' }] })).toThrow(/level/);
  });

  it('creates competitions from the Rozpis with defaults per level', () => {
    const plans = planCompetitionImport(rozpis, [], ['RPB', 'KSA', 'RSA']);
    expect(plans.map((p) => [p.short, p.action])).toEqual([['KSA', 'create'], ['RPB', 'create'], ['RSA', 'create']]);
    const rpb = plans.find((p) => p.short === 'RPB')!;
    expect(rpb.fields).toMatchObject({ boards: 8, default_start: '09:00', manager_name: 'Jukl Karel', mutual_deadline: '2026-12-31' });
    expect(rpb.rounds.target).toHaveLength(11);
    expect(rpb.rounds.target[0]).toEqual({ round: 1, date: '2026-10-18', note: '' });
    expect(rpb.teams).toBeNull();
    expect(plans.find((p) => p.short === 'RSA')!.fields).toMatchObject({ boards: 5, default_start: '09:00' });
    expect(plans.find((p) => p.short === 'KSA')!.rounds.target[0].date).toBe('2026-10-11');
  });

  it('Rozdělení after Rozpis: moves teams, keeps names, sends missing teams to reserve', () => {
    const state = apply(planCompetitionImport(rozpis, [], ['KSA', 'RPB']), []);
    const plans = planCompetitionImport(rozdeleni, state, ['KSA', 'RPB']);
    const ksa = plans.find((p) => p.short === 'KSA')!;
    expect(ksa.action).toBe('update');
    expect(ksa.fieldChanges).toEqual([]);
    expect(ksa.rounds.replace).toBe(false);
    const byAction = (a: string) => ksa.teams!.filter((t) => t.action === a).map((t) => t.name);
    expect(byAction('add')).toEqual(['Šachklub města Dobrovice B', 'Šachklub města Dobrovice C', 'TJ Sokol Mladá Boleslav B']);
    expect(byAction('reserve')).toEqual(['Jawa Brodce A', 'ŠK KDJS Sedlčany A', 'Klub šachistů Říčany 1925 F']);
    expect(ksa.teams!.filter((t) => t.action === 'keep')).toHaveLength(9);

    const rpb = plans.find((p) => p.short === 'RPB')!;
    expect(rpb.teams!.every((t) => t.action === 'add')).toBe(true);
    expect(rpb.teams).toHaveLength(11);

    // Re-importing the same document changes nothing.
    const after = apply(plans, state);
    expect(planCompetitionImport(rozdeleni, after, ['KSA', 'RPB']).every(planIsNoop)).toBe(true);
  });
});
