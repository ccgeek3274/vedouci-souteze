// Draft of one bulletin (úvodní / zpravodaj z kola): the config JSON in local state, saved 800 ms after the last
// change, plus named save points (copies of the saved config + an optional snapshot of data the page freezes only
// in save points). Shared by both bulletin pages.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../lib/api';
import { czDateTime } from '../lib/format';

export type Savepoint = { id: number; label: string; created_at: number };
type Stored = { config: unknown; updated_at: number | null; savepoints: Savepoint[] };
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type DraftOptions = {
  /** Data stored with every save point (not in the draft); null = nothing to freeze yet. */
  snapshot?: () => unknown;
  /** Called after a restore with the whole stored config of the save point (incl. its snapshot). */
  onRestore?: (raw: unknown, sp: Savepoint) => void;
  /** Called after a save point was created (the page now matches it). */
  onSavepoint?: () => void;
};

export function useBulletinDraft<C>(compId: string, key: string, normalize: (raw: unknown) => C, options: DraftOptions = {}) {
  const opts = useRef(options);
  opts.current = options;
  const qc = useQueryClient();
  const base = `/competitions/${compId}/bulletins/${key}`;
  const stored = useQuery({ queryKey: ['bulletin', compId, key], queryFn: () => api.get<Stored>(base) });
  const [cfg, setCfg] = useState<C | null>(null);
  const [version, setVersion] = useState(0); // bumped when the config is replaced (restore) → editors remount
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<C | null>(null);
  useEffect(() => {
    if (stored.data && !cfg) setCfg(normalize(stored.data.config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored.data, cfg]);

  const invalidate = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['bulletin', compId, key] }),
    qc.invalidateQueries({ queryKey: ['bulletins', compId] }),
  ]);
  const save = async () => {
    window.clearTimeout(timer.current);
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await api.put(base, { config: body });
      setSaveState(pending.current ? 'dirty' : 'saved');
      if (!stored.data?.updated_at) void qc.invalidateQueries({ queryKey: ['bulletins', compId] }); // first save → marker in the switcher
    } catch (e) {
      setSaveState('error');
      setError(apiErrorText(e) ?? 'Uložení se nepodařilo');
    }
  };
  const update = (fn: (c: C) => C) => {
    setCfg((prev) => {
      const next = fn(prev!);
      pending.current = next;
      return next;
    });
    setSaveState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 800);
  };
  useEffect(() => () => { if (pending.current) void save(); }, []); // flush on leaving the page

  /** Without a label asks for one; returns whether a save point was created. */
  const savepoint = async (label?: string) => {
    label ??= window.prompt('Název save pointu (např. „před odesláním“):', '') ?? undefined;
    if (label === undefined) return false;
    if (pending.current) await save();
    else if (!stored.data?.updated_at) { pending.current = cfg; await save(); }
    await api.post(`${base}/savepoints`, { label, snapshot: opts.current.snapshot?.() ?? undefined });
    opts.current.onSavepoint?.();
    await invalidate();
    return true;
  };
  const restore = async (sp: Savepoint) => {
    if (!window.confirm(`Obnovit koncept ze save pointu „${sp.label || 'bez názvu'}“? Současný stav se uloží jako save point „před obnovením“.`)) return;
    if (pending.current) await save();
    const r = await api.post<{ config: unknown }>(`${base}/savepoints/${sp.id}/restore`, { snapshot: opts.current.snapshot?.() ?? undefined });
    setCfg(normalize(r.config));
    setVersion((v) => v + 1);
    opts.current.onRestore?.(r.config, sp);
    await invalidate();
  };
  const removeSavepoint = async (id: number) => {
    if (!window.confirm('Smazat save point?')) return;
    await api.delete(`${base}/savepoints/${id}`);
    await invalidate();
  };

  return { stored, cfg, update, version, saveState, error, setError, savepoint, restore, removeSavepoint };
}
export type BulletinDraft<C> = ReturnType<typeof useBulletinDraft<C>>;

export const SAVE_TEXT: Record<SaveState, string> = { saved: 'uloženo', dirty: 'neuloženo…', saving: 'ukládám…', error: 'chyba ukládání' };
export const saveTagClass = (s: SaveState) => `tag${s === 'error' ? ' bad' : s === 'saved' ? ' ok' : ''}`;

export function SavepointsCard({ draft, hint }: { draft: BulletinDraft<any>; hint: string }) {
  const sps = draft.stored.data?.savepoints ?? [];
  return (
    <div className="card">
      <div className="card-strip"><h2>Save pointy konceptu</h2>
        <button className="btn btn-small" onClick={() => draft.savepoint()}>Uložit save point</button>
      </div>
      <div className="card-body">
        <p className="helper-text">{hint}</p>
        {sps.length ? (
          <table className="table">
            <tbody>
              {sps.map((s) => (
                <tr key={s.id}>
                  <td>{s.label || <span className="muted">bez názvu</span>}</td>
                  <td className="muted">{czDateTime(s.created_at)}</td>
                  <td className="req-actions">
                    <button className="btn btn-small" onClick={() => draft.restore(s)}>Obnovit</button>
                    <button className="icon-btn" title="Smazat" onClick={() => draft.removeSavepoint(s.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Zatím žádné save pointy.</p>}
      </div>
    </div>
  );
}

/** Saves a generated blob under a file name. */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
