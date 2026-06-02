import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Receipt, History, Zap, LogOut, User } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Billing from './pages/Billing';
import BillHistory from './pages/BillHistory';
import MonthDetail from './pages/MonthDetail';
import Login from './pages/Login';
import './index.css';

function AppContent() {
  const { currentTenant, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="page flex-center" style={{ minHeight: '100vh' }}>
        <div className="empty-state">
          <Zap size={48} className="empty-icon" />
          <h3>Loading...</h3>
        </div>
      </div>
    );
  }

  if (!currentTenant) {
    return <Login />;
  }

  return (
    <Router>
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          <div className="brand-icon">
            <Zap size={20} />
          </div>
          <h1>Bill<span>Manager</span></h1>
        </NavLink>
        <ul className="navbar-links">
          <li>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/tenants" className={({ isActive }) => isActive ? 'active' : ''}>
              <Users size={16} />
              <span>Tenants</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/billing" className={({ isActive }) => isActive ? 'active' : ''}>
              <Receipt size={16} />
              <span>Billing</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'active' : ''}>
              <History size={16} />
              <span>History</span>
            </NavLink>
          </li>
        </ul>
        <div className="navbar-user">
          <div className="navbar-user-info">
            <div className="navbar-avatar">
              {currentTenant.name.charAt(0).toUpperCase()}
            </div>
            <span className="navbar-username">{currentTenant.name}</span>
          </div>
          <button className="btn btn-sm btn-secondary navbar-logout" onClick={logout} title="Logout">
            <LogOut size={14} />
          </button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/history" element={<BillHistory />} />
        <Route path="/month/:id" element={<MonthDetail />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
