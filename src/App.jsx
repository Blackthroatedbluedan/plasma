import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import VaultPage from './pages/VaultPage';
import InventoryPage from './pages/InventoryPage';
import JobsPage from './pages/JobsPage';
import CleanupPage from './pages/CleanupPage';
import AuthBar from './components/AuthBar';

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
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/vault">Vault</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
        </nav>
        <AuthBar />
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/cleanup/:id" element={<CleanupPage />} />
          <Route path="/inbox" element={<Navigate to="/" replace />} />
          <Route path="/nest" element={<Navigate to="/" replace />} />
          <Route path="/drawings" element={<Navigate to="/vault" replace />} />
        </Routes>
      </main>
    </div>
  );
}
