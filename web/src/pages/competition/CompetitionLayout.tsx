import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LEVEL_LABEL, PHASE_LABEL } from '../../lib/format';
import type { CompetitionDetail } from '../../lib/types';
import { AppNav } from '../../components/Layout';

export type CompetitionCtx = { data: CompetitionDetail; refresh: () => Promise<void> };
export const useCompetition = () => useOutletContext<CompetitionCtx>();

export function useCompetitionQuery(id: string) {
  return useQuery({ queryKey: ['competition', id], queryFn: () => api.get<CompetitionDetail>(`/competitions/${id}`) });
}

export function CompetitionLayout() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useCompetitionQuery(id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['competition', id] });

  if (isLoading) return <p style={{ color: 'var(--cream)' }}>Načítání…</p>;
  if (error || !data) return <div className="alert">Soutěž se nepodařilo načíst.</div>;
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const newRequests = data.requests.filter((r) => r.status === 'new').length;

  return (
    <>
      <header className="comp-header">
        <div>
          <h1 className="page-title">{c.name} <span style={{ color: 'var(--subtitle)' }}>{c.short}</span></h1>
          <p className="page-sub">
            {LEVEL_LABEL[c.level] ?? c.level} · {c.season} · {active.length} družstev · {c.boards} šachovnic · fáze: {PHASE_LABEL[c.phase] ?? c.phase}
          </p>
        </div>
        <AppNav compact />
      </header>
      <nav className="tabs no-print">
        <NavLink to="" end>Přehled</NavLink>
        <NavLink to="druzstva">Družstva</NavLink>
        <NavLink to="soupisky">Import soupisek</NavLink>
        <NavLink to="kontrola">Kontrola soupisek</NavLink>
        <NavLink to="pozadavky">Požadavky{newRequests ? ` (${newRequests})` : ''}</NavLink>
        <NavLink to="losovani">Losování</NavLink>
        <NavLink to="zpravodaj">Zpravodaj</NavLink>
      </nav>
      <Outlet context={{ data, refresh } satisfies CompetitionCtx} />
    </>
  );
}
