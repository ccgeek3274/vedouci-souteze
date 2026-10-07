import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="card">
      <div className="card-strip"><h2>Stránka nenalezena</h2></div>
      <div className="card-body"><Link className="btn" to="/">Zpět na soutěže</Link></div>
    </div>
  );
}
