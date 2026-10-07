import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { AdminUsers } from './pages/AdminUsers';
import { NotFound } from './pages/NotFound';
import { ImportCompetitions } from './pages/ImportCompetitions';
import { Tokens } from './pages/Tokens';
import { CompetitionLayout } from './pages/competition/CompetitionLayout';
import { Overview } from './pages/competition/Overview';
import { Teams } from './pages/competition/Teams';
import { RosterImport } from './pages/competition/RosterImport';
import { Requests } from './pages/competition/Requests';
import { TeamDetail } from './pages/competition/TeamDetail';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<ImportCompetitions />} />
          <Route path="/c/:id" element={<CompetitionLayout />}>
            <Route index element={<Overview />} />
            <Route path="druzstva" element={<Teams />} />
            <Route path="soupisky" element={<RosterImport />} />
            <Route path="pozadavky" element={<Requests />} />
            <Route path="t/:teamId" element={<TeamDetail />} />
          </Route>
          <Route path="/tokeny" element={<Tokens />} />
          <Route path="/admin" element={<AdminUsers />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
