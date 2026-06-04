import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, CalendarDays, Zap, IndianRupee, Users, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function MonthDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMonth(true);

    const interval = setInterval(() => {
      loadMonth(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [id]);

  async function loadMonth(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await api.getMonth(id);
      setMonth(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleExport() {
    try {
      await api.exportExcel(id);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await api.deleteEvent(eventId);
      loadMonth();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleDeleteMonth() {
    if (!confirm(`Are you sure you want to delete this billing month? This will delete all calculations and events for this month. This action cannot be undone.`)) return;
    try {
      await api.deleteMonth(id);
      navigate('/history');
    } catch (err) {
      alert('Error deleting month: ' + err.message);
    }
  }

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

  if (!month) {
    return (
      <div className="page">
        <div className="empty-state">
          <h3>Month not found</h3>
          <button className="btn btn-primary mt-2" onClick={() => navigate('/history')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const totalUnits = month.end_reading ? month.end_reading - month.start_reading : null;
  const totalAmount = month.billShares?.reduce((sum, s) => sum + s.total_amount, 0) || 0;

  return (
    <div className="page fade-in">
      <div className="page-header flex-between">
        <div>
          <button className="btn btn-sm btn-secondary mb-2" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
          <h2>📋 {month.month} — Bill Details</h2>
          <p>Detailed breakdown of electricity billing</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export Excel
          </button>
          {currentTenant?.is_admin && (
            <button className="btn btn-danger" onClick={handleDeleteMonth}>
              <Trash2 size={16} /> Delete Month
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-3">
        <div className="stat-card">
          <div className="stat-icon purple"><CalendarDays size={20} /></div>
          <div className="stat-value">{month.start_reading}</div>
          <div className="stat-label">Start Reading</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><CalendarDays size={20} /></div>
          <div className="stat-value">{month.end_reading || '—'}</div>
          <div className="stat-label">End Reading</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Zap size={20} /></div>
          <div className="stat-value">{totalUnits !== null ? Math.round(totalUnits * 100) / 100 : '—'}</div>
          <div className="stat-label">Total Units</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><IndianRupee size={20} /></div>
          <div className="stat-value">₹{Math.round(totalAmount)}</div>
          <div className="stat-label">Total Bill</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Bill Shares */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Users size={18} className="icon" />
              Tenant Bill Breakdown
            </div>
          </div>

          {month.billShares && month.billShares.length > 0 ? (
            <>
              <div className="bill-breakdown">
                {month.billShares.map(share => (
                  <div key={share.tenant_id} className="bill-share-card">
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'var(--accent-gradient)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '1rem', color: 'white',
                      margin: '0 auto 0.75rem'
                    }}>
                      {share.tenant_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="share-name">{share.tenant_name}</div>
                    <div className="share-amount">₹{Math.round(share.total_amount * 100) / 100}</div>
                    <div className="share-units">{Math.round(share.total_units * 100) / 100} units</div>
                  </div>
                ))}
              </div>

              {/* Summary Table */}
              <div className="table-container mt-3">
                <table>
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Units</th>
                      <th>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {month.billShares.map(share => (
                      <tr key={share.tenant_id}>
                        <td style={{ fontWeight: 600 }}>{share.tenant_name}</td>
                        <td>{Math.round(share.total_units * 100) / 100}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-primary-hover)' }}>₹{Math.round(share.total_amount * 100) / 100}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(99, 102, 241, 0.05)' }}>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td style={{ fontWeight: 700 }}>{totalUnits !== null ? Math.round(totalUnits * 100) / 100 : '—'}</td>
                      <td style={{ fontWeight: 800, color: 'var(--accent-primary-hover)', fontSize: '1.05rem' }}>₹{Math.round(totalAmount * 100) / 100}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>No bill shares calculated yet</p>
            </div>
          )}
        </div>

        {/* Event Timeline */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <CalendarDays size={18} className="icon" />
              Event Timeline
            </div>
            <span className="badge badge-info">{month.events?.length || 0} events</span>
          </div>

          {month.events && month.events.length > 0 ? (
            <div className="timeline">
              {month.events.map(event => (
                <div key={event.id} className={`timeline-item event-${event.event_type === 'TENANT_OUT' ? 'out' : event.event_type === 'TENANT_IN' ? 'in' : event.event_type === 'MONTH_START' ? 'start' : 'end'}`}>
                  <div className="flex-between">
                    <div>
                      <div className="timeline-date">{event.event_date}</div>
                      <div className="timeline-content">
                        {event.event_type === 'MONTH_START' && '📅 Month Started'}
                        {event.event_type === 'MONTH_END' && '🔒 Month Closed'}
                        {event.event_type === 'TENANT_OUT' && `🚪 ${event.tenant_name} left`}
                        {event.event_type === 'TENANT_IN' && `✅ ${event.tenant_name} came back`}
                      </div>
                      <div className="timeline-reading">Meter: {event.meter_reading}</div>
                      {event.ai_meter_reading && (
                        <div className="timeline-reading" style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                          AI Extracted: {event.ai_meter_reading}
                        </div>
                      )}
                      {event.notes && (
                        <div className="timeline-reading" style={{ color: 'var(--text-secondary)' }}>
                          Note: {event.notes}
                        </div>
                      )}
                      {event.meter_image_url && (
                        <div className="timeline-image mt-1">
                          <a href={event.meter_image_url} target="_blank" rel="noopener noreferrer">
                            <img 
                              src={event.meter_image_url} 
                              alt="Meter Display" 
                              style={{ 
                                maxWidth: '120px', 
                                maxHeight: '120px', 
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                display: 'block'
                              }} 
                            />
                          </a>
                        </div>
                      )}
                    </div>
                    {event.event_type !== 'MONTH_START' && !month.is_closed && (!event.tenant_id || (currentTenant && (event.tenant_id === currentTenant.id || currentTenant.is_admin))) && (
                      <button
                        className="btn btn-icon btn-sm btn-secondary"
                        onClick={() => handleDeleteEvent(event.id)}
                        title="Delete event"
                        style={{ flexShrink: 0 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No events recorded yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Month Info */}
      <div className="card mt-3">
        <div className="card-header">
          <div className="card-title">
            <Zap size={18} className="icon" />
            Month Information
          </div>
          <span className={`badge ${month.is_closed ? 'badge-info' : 'badge-success'}`}>
            {month.is_closed ? 'Closed' : 'Active'}
          </span>
        </div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Rate</div>
            <div style={{ fontWeight: 600 }}>₹{month.rate_per_unit} per unit</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Tenants This Month</div>
            <div style={{ fontWeight: 600 }}>{month.tenantStatus?.length || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Currently Present</div>
            <div style={{ fontWeight: 600 }}>{month.tenantStatus?.filter(ts => ts.is_present).length || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
