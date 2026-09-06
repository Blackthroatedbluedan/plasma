import { Routes, Route, NavLink } from 'react-router-dom';
import PartsPage from './pages/PartsPage';
import InventoryPage from './pages/InventoryPage';
import NestPage from './pages/NestPage';
import JobsPage from './pages/JobsPage';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">⚡</span>
          <div>
            <h1>Plasma</h1>
            <p className="tagline">Fab-Cut shop overlay — nest &amp; hand off to FlashCut</p>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>Drawings</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/nest">Nest</NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<PartsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/nest" element={<NestPage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </main>
    </div>
  );
}
