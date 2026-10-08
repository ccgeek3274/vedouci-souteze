import { useState } from 'react';
import { api, apiErrorText } from '../../lib/api';
import type { RosterPlayer } from '../../lib/types';
import { emptyExtra, expectedBase, FLAG_CODES, maxLetters, toggleFlag, type RosterDraft } from '../../../../shared/roster/draft';

type Row = { key: number; jmeno: string; rok: string; lok: string; fide: string; ozn: string; z: boolean };

let nextKey = 1;
const toRow = (p: RosterPlayer): Row => ({
  key: nextKey++, jmeno: p.name, rok: p.birth_year ? String(p.birth_year) : '', lok: p.lok ? String(p.lok) : '',
  fide: p.fide ? String(p.fide) : '', ozn: p.flags, z: !!p.base,
});

/**
 * Manual correction of the roster (names, ids, letters, Z, order). Saving creates a new roster version
 * (source "manual") through the regular import — documents, strikes and the chess.cz check follow the players by LOK.
 */
export function RosterEditor({ competitionId, team, players, boards, onDone }: {
  competitionId: string; team: { id: string; name: string }; players: RosterPlayer[]; boards: number; onDone: (saved: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => players.map(toRow));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const out = [...rs];
    [out[i], out[i + d]] = [out[i + d], out[i]];
    return out;
  });
  const exp = expectedBase(rows.map((r) => ({ flags: r.ozn })), boards);
  // Rule: the line-up is fixed by the order and the letters; a skipped letter player keeps what the captain chose.
  const recalcZ = () => setRows((rs) => rs.map((r, i) => (exp[i] === 'optional' ? r : { ...r, z: exp[i] === true })));

  const save = async () => {
    setError(null);
    setBusy(true);
    const draft: RosterDraft = {
      app: 'sscr-soupiska', version: 1,
      header: { kraj: '', soutez: '', druzstvo: team.name, oddil: '' },
      zakladCount: rows.filter((r) => r.z).length || boards,
      players: rows.filter((r) => r.jmeno.trim() || r.lok.trim()).map((r) => ({
        jmeno: r.jmeno.trim(), rok: Number(r.rok) || '', lok: Number(r.lok) || '', fide: Number(r.fide) || '', ozn: r.ozn, z: r.z, source: 'manual',
      })),
      extra: emptyExtra(),
    };
    try {
      await api.post(`/competitions/${competitionId}/rosters/import`, { draft, team_id: team.id, source: 'manual', filename: 'ruční úprava', apply: true });
      onDone(true);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const mismatches = rows.filter((r, i) => typeof exp[i] === 'boolean' && exp[i] !== r.z).length;
  return (
    <>
      {error && <div className="alert">{error}</div>}
      <p className="helper-text" style={{ marginTop: 0 }}>
        Uložení vytvoří novou verzi soupisky. Z podle pravidla: prvních {boards} hráčů, z nich nejvýše {maxLetters(boards)} H/V/C,
        další písmenkoví se přeskočí (mohou mít Z, ale nepočítají se).
        {mismatches > 0 && <> <span className="tag warn">{mismatches}× Z neodpovídá pravidlu</span></>}
      </p>
      <table className="table">
        <thead><tr><th>#</th><th>Příjmení jméno</th><th className="num">Rok</th><th className="num">LOK</th><th className="num">FIDE</th><th>Označení</th><th>Z</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="mono muted">{i + 1}.</td>
              <td><input className="input input-sm" style={{ width: 200 }} value={r.jmeno} onChange={(e) => set(r.key, { jmeno: e.target.value })} /></td>
              <td><input className="input input-sm mono" style={{ width: 64 }} value={r.rok} onChange={(e) => set(r.key, { rok: e.target.value.replace(/\D/g, '') })} /></td>
              <td><input className="input input-sm mono" style={{ width: 76 }} value={r.lok} onChange={(e) => set(r.key, { lok: e.target.value.replace(/\D/g, '') })} /></td>
              <td><input className="input input-sm mono" style={{ width: 96 }} value={r.fide} onChange={(e) => set(r.key, { fide: e.target.value.replace(/\D/g, '') })} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {FLAG_CODES.map((f) => (
                  <button key={f} type="button" className={`chip${r.ozn.split(' ').includes(f) ? ' active' : ''}`} style={{ marginRight: 3, cursor: 'pointer' }}
                    onClick={() => set(r.key, { ozn: toggleFlag(r.ozn, f) })}>{f}</button>
                ))}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={r.z} onChange={(e) => set(r.key, { z: e.target.checked })} />
                {typeof exp[i] === 'boolean' && exp[i] !== r.z && <span className="tag warn" style={{ marginLeft: 6 }}>{exp[i] ? 'má být Z' : 'bez Z'}</span>}
              </td>
              <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                <button className="icon-btn" title="Nahoru" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" title="Dolů" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon-btn" title="Odebrat ze soupisky" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => setRows((rs) => [...rs, { key: nextKey++, jmeno: '', rok: '', lok: '', fide: '', ozn: '', z: false }])}>+ Přidat hráče</button>
        <button className="btn" onClick={recalcZ} disabled={!mismatches}>Nastavit Z podle pravidla</button>
        <span className="spacer" />
        <button className="btn" onClick={() => onDone(false)} disabled={busy}>Zrušit</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Uložit jako novou verzi</button>
      </div>
    </>
  );
}
