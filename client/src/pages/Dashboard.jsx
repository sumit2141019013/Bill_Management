import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Zap, IndianRupee, CalendarDays, ArrowRight, Plus, TrendingUp } from 'lucide-react';
import { api } from '../api';

export default function Dashboard() {
  const [tenants, setTenants] = useState([]);
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData(true);

    const interval = setInterval(() => {
      loadData(false);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function loadData(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [tenantsData, monthsData] = await Promise.all([
        api.getTenants(),
        api.getMonths()
      ]);
      setTenants(tenantsData);
      setMonths(monthsData);

      // Load current month details if exists
      const openMonth = monthsData.find(m => !m.is_closed);
      if (openMonth) {
        const details = await api.getMonth(openMonth.id);
        setCurrentMonth(details);
      } else {
        setCurrentMonth(null);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  const regularTenants = tenants.filter(t => !t.is_admin);
  const activeTenants = regularTenants.filter(t => t.is_active);
  const totalMonths = months.length;
  const lastClosedMonth = months.find(m => m.is_closed);

  const currentBillTotal = currentMonth?.billShares?.reduce((sum, s) => sum + s.total_amount, 0) || 0;
  const currentUnitsUsed = currentMonth ? 
    (currentMonth.events?.length > 1 ? 
      currentMonth.events[currentMonth.events.length - 1].meter_reading - currentMonth.start_reading : 0) : 0;

  if (loading) {
    return (
      <div className="page flex-center" style={{ minHeight: '60vh' }}>
        <div className="empty-state">
          <Zap size={48} className="empty-icon" />
          <h3>Loading...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h2>⚡ Dashboard</h2>
        <p>Overview of your room's electricity billing</p>
      </div>

      {/* Stats Grid */}
      <div className="grid-4 mb-3">
        <div className="stat-card">
          <div className="stat-icon purple"><Users size={20} /></div>
          <div className="stat-value">{activeTenants.length}</div>
          <div className="stat-label">Active Tenants</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Zap size={20} /></div>
          <div className="stat-value">{Math.round(currentUnitsUsed * 100) / 100}</div>
          <div className="stat-label">Units This Month</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><IndianRupee size={20} /></div>
          <div className="stat-value">₹{Math.round(currentBillTotal)}</div>
          <div className="stat-label">Running Bill</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><CalendarDays size={20} /></div>
          <div className="stat-value">{totalMonths}</div>
          <div className="stat-label">Total Months</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Current Month Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Zap size={18} className="icon" />
              Current Month
            </div>
            {currentMonth ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <span className="badge badge-warning">No Active Month</span>
            )}
          </div>

          {currentMonth ? (
            <div>
              <div className="flex-between mb-2">
                <div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Month</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{currentMonth.month}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Start Reading</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{currentMonth.start_reading}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Rate: ₹{currentMonth.rate_per_unit}/unit
              </div>

              {currentMonth.billShares && currentMonth.billShares.length > 0 && (
                <div className="bill-breakdown mt-2">
                  {currentMonth.billShares.map(share => (
                    <div key={share.tenant_id} className="bill-share-card">
                      <div className="share-name">{share.tenant_name}</div>
                      <div className="share-amount">₹{Math.round(share.total_amount)}</div>
                      <div className="share-units">{Math.round(share.total_units * 100) / 100} units</div>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn btn-primary mt-3" onClick={() => navigate(`/month/${currentMonth.id}`)} style={{ width: '100%', justifyContent: 'center' }}>
                View Details <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={40} className="empty-icon" />
              <h3>No Active Month</h3>
              <p>Start a new billing month to begin tracking</p>
              <button className="btn btn-primary mt-2" onClick={() => navigate('/billing')}>
                <Plus size={16} /> Start New Month
              </button>
            </div>
          )}
        </div>

        {/* Tenants Overview */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Users size={18} className="icon" />
              Tenants
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/tenants')}>
              Manage <ArrowRight size={14} />
            </button>
          </div>

          {regularTenants.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {regularTenants.map(tenant => (
                <div key={tenant.id} className="flex-between" style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div className="flex gap-1" style={{ alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: tenant.is_active ? 'var(--accent-gradient)' : 'var(--bg-glass)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.9rem',
                      color: tenant.is_active ? 'white' : 'var(--text-muted)'
                    }}>
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tenant.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Since {tenant.joined_date}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${tenant.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {tenant.is_active ? 'IN' : 'OUT'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={40} className="empty-icon" />
              <h3>No Tenants Yet</h3>
              <p>Add tenants to start tracking bills</p>
              <button className="btn btn-primary mt-2" onClick={() => navigate('/tenants')}>
                <Plus size={16} /> Add Tenants
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent History */}
      {months.length > 0 && (
        <div className="card mt-3">
          <div className="card-header">
            <div className="card-title">
              <TrendingUp size={18} className="icon" />
              Recent Months
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/history')}>
              View All <ArrowRight size={14} />
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Start Reading</th>
                  <th>End Reading</th>
                  <th>Total Units</th>
                  <th>Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {months.slice(0, 5).map(m => (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/month/${m.id}`)}>
                    <td style={{ fontWeight: 600 }}>{m.month}</td>
                    <td>{m.start_reading}</td>
                    <td>{m.end_reading || '—'}</td>
                    <td>{m.end_reading ? m.end_reading - m.start_reading : '—'}</td>
                    <td>₹{m.rate_per_unit}/unit</td>
                    <td>
                      <span className={`badge ${m.is_closed ? 'badge-info' : 'badge-success'}`}>
                        {m.is_closed ? 'Closed' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
