import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fold, matchName } from '../../../shared/text';

type Club = { clubCode: string; clubName: string };

/** chess.cz club list (/clubs/all, cached 24 h by the proxy). */
function useClubs(enabled: boolean) {
  return useQuery({
    queryKey: ['chesscz', 'clubs'],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const r = await api.get<{ data: Club | Club[] }>('/chesscz/clubs/all');
      const all = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
      return all.filter((c) => c.clubCode && c.clubName).map((c) => ({ clubCode: String(c.clubCode), clubName: c.clubName }));
    },
  });
}

/**
 * Club name with suggestions from chess.cz (as in sscr-soupiska). Picking one fills the club code too;
 * while a club code is filled in, the field is plain text (no suggestions).
 */
export function ClubInput({ name, code, onChange }: { name: string; code: string; onChange: (p: { club_name?: string; club_code?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const active = !code.trim();
  const clubs = useClubs(active);
  const q = fold(name);
  const matches = active && open && q.length >= 2
    ? (clubs.data ?? []).filter((c) => matchName(c.clubName, name))
      .sort((a, b) => Number(!fold(b.clubName).startsWith(q)) - Number(!fold(a.clubName).startsWith(q)) || a.clubName.localeCompare(b.clubName, 'cs'))
      .slice(0, 12)
    : [];
  const pick = (c: Club) => { onChange({ club_name: c.clubName, club_code: c.clubCode }); setOpen(false); };

  return (
    <div className="ac">
      <input className="input" value={name} autoComplete="off"
        placeholder={active ? 'začněte psát název oddílu…' : undefined}
        onChange={(e) => { onChange({ club_name: e.target.value }); setOpen(true); setHl(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((hl + 1) % matches.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((hl - 1 + matches.length) % matches.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[hl]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {matches.length > 0 && (
        <div className="ac-drop">
          {matches.map((c, i) => (
            <button key={c.clubCode} type="button" className={`ac-item${i === hl ? ' hl' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <span>{c.clubName}</span><span className="mono muted">{c.clubCode}</span>
            </button>
          ))}
        </div>
      )}
      <div className="helper-text" style={{ marginTop: 4 }}>
        {active
          ? clubs.isLoading ? 'Načítám seznam oddílů z chess.cz…' : clubs.isError ? 'Seznam oddílů z chess.cz se nepodařilo načíst.' : 'Výběrem z nabídky se doplní i číslo oddílu.'
          : 'Číslo oddílu je vyplněné — našeptávání vypnuto (vymažte číslo pro nový výběr).'}
      </div>
    </div>
  );
}
