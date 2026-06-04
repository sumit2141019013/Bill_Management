import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, X, UserMinus, UserPlus, Lock, CalendarDays, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmContext';

export default function Billing() {
  const { currentTenant } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [months, setMonths] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewMonthModal, setShowNewMonthModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [eventType, setEventType] = useState('TENANT_OUT');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [selectedStartFile, setSelectedStartFile] = useState(null);
  const [selectedCloseFile, setSelectedCloseFile] = useState(null);
  const [submittingNewMonth, setSubmittingNewMonth] = useState(false);
  const [submittingCloseMonth, setSubmittingCloseMonth] = useState(false);
  const navigate = useNavigate();

  const [newMonthForm, setNewMonthForm] = useState({
    month: new Date().toISOString().slice(0, 7),
    start_reading: '',
    rate_per_unit: '10'
  });

  const [eventForm, setEventForm] = useState({
    tenant_id: '',
    meter_reading: '',
    event_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [closeForm, setCloseForm] = useState({
    end_reading: '',
    end_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData(true);

    const interval = setInterval(() => {
      if (!showNewMonthModal && !showEventModal && !showCloseModal) {
        loadData(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [showNewMonthModal, showEventModal, showCloseModal]);

  async function loadData(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [monthsData, tenantsData] = await Promise.all([
        api.getMonths(),
        api.getTenants()
      ]);
      setMonths(monthsData);
      setTenants(tenantsData);

      // Load the active month details
      const openMonth = monthsData.find(m => !m.is_closed);
      if (openMonth) {
        const details = await api.getMonth(openMonth.id);
        setCurrentMonth(details);
      } else {
        setCurrentMonth(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleNewMonth(e) {
    e.preventDefault();
    setError('');

    if (!newMonthForm.start_reading) {
      setError('Start reading is required');
      return;
    }

    try {
      setSubmittingNewMonth(true);
      const formData = new FormData();
      formData.append('month', newMonthForm.month);
      formData.append('start_reading', newMonthForm.start_reading);
      formData.append('rate_per_unit', newMonthForm.rate_per_unit);
      if (selectedStartFile) {
        formData.append('meter_image', selectedStartFile);
      }

      await api.createMonth(formData);
      showToast(`Billing month ${newMonthForm.month} started successfully!`, 'success');
      setShowNewMonthModal(false);
      setSelectedStartFile(null);
      loadData();
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSubmittingNewMonth(false);
    }
  }

  async function handleEvent(e) {
    e.preventDefault();
    setError('');

    if (!eventForm.tenant_id || !eventForm.meter_reading) {
      setError('Tenant and meter reading are required');
      return;
    }

    try {
      setSubmittingEvent(true);
      const formData = new FormData();
      formData.append('billing_month_id', currentMonth.id);
      formData.append('event_type', eventType);
      formData.append('tenant_id', eventForm.tenant_id);
      formData.append('meter_reading', eventForm.meter_reading);
      formData.append('event_date', eventForm.event_date);
      formData.append('notes', eventForm.notes);
      if (selectedFile) {
        formData.append('meter_image', selectedFile);
      }

      await api.createEvent(formData);
      showToast(`${eventType === 'TENANT_OUT' ? 'Tenant Going Out' : 'Tenant Coming In'} event logged successfully!`, 'success');

      setShowEventModal(false);
      setEventForm({ tenant_id: '', meter_reading: '', event_date: new Date().toISOString().split('T')[0], notes: '' });
      setSelectedFile(null);
      loadData();
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSubmittingEvent(false);
    }
  }

  async function handleCloseMonth(e) {
    e.preventDefault();
    setError('');

    if (!closeForm.end_reading) {
      setError('End reading is required');
      return;
    }

    try {
      setSubmittingCloseMonth(true);
      const formData = new FormData();
      formData.append('end_reading', closeForm.end_reading);
      formData.append('end_date', closeForm.end_date);
      if (selectedCloseFile) {
        formData.append('meter_image', selectedCloseFile);
      }

      await api.closeMonth(currentMonth.id, formData);
      showToast(`Billing month ${currentMonth.month} closed and splits calculated!`, 'success');
      setShowCloseModal(false);
      setSelectedCloseFile(null);
      navigate(`/month/${currentMonth.id}`);
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSubmittingCloseMonth(false);
    }
  }

  async function handleDeleteMonth() {
    const approved = await confirm({
      title: 'Delete Billing Month',
      message: `Are you sure you want to delete the billing month "${currentMonth.month}"? This will delete all events, readings, and calculated splits for this month.`,
      confirmText: 'Delete Month',
      type: 'danger'
    });
    if (!approved) return;

    try {
      await api.deleteMonth(currentMonth.id);
      showToast(`Billing month ${currentMonth.month} deleted successfully.`, 'success');
      loadData();
    } catch (err) {
      showToast('Error deleting month: ' + err.message, 'error');
    }
  }

  function openEventModal(type) {
    setEventType(type);
    setEventForm({
      tenant_id: currentTenant && !currentTenant.is_admin ? String(currentTenant.id) : '',
      meter_reading: '',
      event_date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setSelectedFile(null);
    setError('');
    setShowEventModal(true);
  }

  // Filter tenants based on event type and current month status
  const getAvailableTenants = () => {
    if (!currentMonth || !currentMonth.tenantStatus) return [];
    if (eventType === 'TENANT_OUT') {
      // Show tenants who are currently IN
      return currentMonth.tenantStatus.filter(ts => ts.is_present).map(ts => ({
        id: ts.tenant_id,
        name: ts.tenant_name
      }));
    } else {
      // TENANT_IN — show tenants who are currently OUT (excluding Admin)
      const presentIds = new Set(currentMonth.tenantStatus.filter(ts => ts.is_present).map(ts => ts.tenant_id));
      return tenants.filter(t => !t.is_admin && !presentIds.has(t.id)).map(t => ({
        id: t.id,
        name: t.name
      }));
    }
  };

  const presentTenants = currentMonth?.tenantStatus?.filter(ts => ts.is_present) || [];
  const isCurrentTenantPresent = currentMonth?.tenantStatus?.some(ts => ts.tenant_id === currentTenant?.id && ts.is_present) || false;

  return (
    <div className="page fade-in">
      <div className="page-header flex-between">
        <div>
          <h2>📊 Monthly Billing</h2>
          <p>Manage current month's electricity billing</p>
        </div>
        {!currentMonth && (
          <button className="btn btn-primary" onClick={() => { setError(''); setSelectedStartFile(null); setShowNewMonthModal(true); }}>
            <Plus size={16} /> Start New Month
          </button>
        )}
      </div>

      {!currentMonth ? (
        <div className="card">
          <div className="empty-state">
            <CalendarDays size={48} className="empty-icon" />
            <h3>No Active Billing Month</h3>
            <p>Start a new billing month by entering the current meter reading</p>
            <button className="btn btn-primary mt-2" onClick={() => { setError(''); setSelectedStartFile(null); setShowNewMonthModal(true); }}>
              <Plus size={16} /> Start New Month
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Month Info & Actions */}
          <div className="grid-3 mb-3">
            <div className="stat-card">
              <div className="stat-icon purple"><CalendarDays size={20} /></div>
              <div className="stat-value">{currentMonth.month}</div>
              <div className="stat-label">Current Month</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><Receipt size={20} /></div>
              <div className="stat-value">{currentMonth.start_reading}</div>
              <div className="stat-label">Start Reading</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue">
                <span style={{ fontSize: '1rem', fontWeight: 700 }}>₹</span>
              </div>
              <div className="stat-value">{currentMonth.rate_per_unit}/unit</div>
              <div className="stat-label">Rate</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="card mb-3">
            <div className="card-header">
              <div className="card-title">
                <Receipt size={18} className="icon" />
                Actions
              </div>
            </div>
            <div className="flex gap-2 flex-wrap" style={{ width: '100%' }}>
              <button className="btn btn-danger" onClick={() => openEventModal('TENANT_OUT')} disabled={!currentTenant?.is_admin && !isCurrentTenantPresent}>
                <UserMinus size={16} /> Tenant Going Out
              </button>
              <button className="btn btn-success" onClick={() => openEventModal('TENANT_IN')} disabled={!currentTenant?.is_admin && isCurrentTenantPresent}>
                <UserPlus size={16} /> Tenant Coming In
              </button>
              <button className="btn btn-warning" onClick={() => { setError(''); setSelectedCloseFile(null); setCloseForm({ end_reading: '', end_date: new Date().toISOString().split('T')[0] }); setShowCloseModal(true); }}>
                <Lock size={16} /> Close Month
              </button>
              {currentTenant?.is_admin && (
                <button className="btn btn-danger" onClick={handleDeleteMonth} style={{ marginLeft: 'auto' }}>
                  <Trash2 size={16} /> Delete Month
                </button>
              )}
            </div>
          </div>

          {/* Current Tenants Status */}
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <UserPlus size={18} className="icon" />
                  Present Tenants ({presentTenants.length})
                </div>
              </div>
              {presentTenants.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {presentTenants.map(ts => (
                    <div key={ts.tenant_id} className="flex-between" style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--border-color)',
                    }}>
                      <div className="flex gap-1" style={{ alignItems: 'center' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--accent-gradient)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.8rem', color: 'white'
                        }}>
                          {ts.tenant_name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ts.tenant_name}</span>
                      </div>
                      <span className="badge badge-success">IN</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No tenants currently in</p>
              )}
            </div>

            {/* Bill Shares */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Receipt size={18} className="icon" />
                  Running Bill
                </div>
              </div>
              {currentMonth.billShares && currentMonth.billShares.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {currentMonth.billShares.map(share => (
                    <div key={share.tenant_id} className="flex-between" style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--border-color)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{share.tenant_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {Math.round(share.total_units * 100) / 100} units
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-primary-hover)' }}>
                        ₹{Math.round(share.total_amount)}
                      </div>
                    </div>
                  ))}
                  <div className="flex-between mt-1" style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid var(--border-glow)',
                  }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent-primary-hover)' }}>
                      ₹{Math.round(currentMonth.billShares.reduce((sum, s) => sum + s.total_amount, 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Bill will be calculated as events are recorded
                </p>
              )}
            </div>
          </div>

          {/* Event Timeline */}
          {currentMonth.events && currentMonth.events.length > 0 && (
            <div className="card mt-3">
              <div className="card-header">
                <div className="card-title">
                  <CalendarDays size={18} className="icon" />
                  Event Timeline
                </div>
              </div>
              <div className="timeline">
                {currentMonth.events.map(event => (
                  <div key={event.id} className={`timeline-item event-${event.event_type === 'TENANT_OUT' ? 'out' : event.event_type === 'TENANT_IN' ? 'in' : event.event_type === 'MONTH_START' ? 'start' : 'end'}`}>
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
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* New Month Modal */}
      {showNewMonthModal && (
        <div className="modal-overlay" onClick={() => setShowNewMonthModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Start New Billing Month</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowNewMonthModal(false)} disabled={submittingNewMonth}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleNewMonth}>
              <div className="form-group">
                <label>Month</label>
                <input
                  type="month"
                  className="form-control"
                  value={newMonthForm.month}
                  onChange={e => setNewMonthForm({ ...newMonthForm, month: e.target.value })}
                  disabled={submittingNewMonth}
                />
              </div>
              <div className="form-group">
                <label>Starting Meter Reading</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="Enter current meter reading"
                  value={newMonthForm.start_reading}
                  onChange={e => setNewMonthForm({ ...newMonthForm, start_reading: e.target.value })}
                  disabled={submittingNewMonth}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Rate Per Unit (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  className="form-control"
                  placeholder="10"
                  value={newMonthForm.rate_per_unit}
                  onChange={e => setNewMonthForm({ ...newMonthForm, rate_per_unit: e.target.value })}
                  disabled={submittingNewMonth}
                />
              </div>
              <div className="form-group">
                <label>Meter Photo (Optional, AI verifies reading)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="form-control"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedStartFile(e.target.files[0]);
                    }
                  }}
                  disabled={submittingNewMonth}
                />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewMonthModal(false)} disabled={submittingNewMonth}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingNewMonth}>
                  {submittingNewMonth ? 'Verifying & Starting...' : 'Start Month'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{eventType === 'TENANT_OUT' ? '🚪 Tenant Going Out' : '✅ Tenant Coming In'}</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowEventModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEvent}>
              <div className="form-group">
                <label>Tenant</label>
                {currentTenant?.is_admin ? (
                  <select
                    className="form-control"
                    value={eventForm.tenant_id}
                    onChange={e => setEventForm({ ...eventForm, tenant_id: e.target.value })}
                    required
                  >
                    <option value="">— Select Tenant —</option>
                    {getAvailableTenants().map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={currentTenant?.name || ''}
                    disabled
                  />
                )}
              </div>
              <div className="form-group">
                <label>Current Meter Reading</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="Enter meter reading right now"
                  value={eventForm.meter_reading}
                  onChange={e => setEventForm({ ...eventForm, meter_reading: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={eventForm.event_date}
                  onChange={e => setEventForm({ ...eventForm, event_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Notes (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Any additional notes"
                  value={eventForm.notes}
                  onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Meter Photo (Optional, AI verifies reading)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="form-control"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  disabled={submittingEvent}
                />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEventModal(false)} disabled={submittingEvent}>Cancel</button>
                <button type="submit" className={`btn ${eventType === 'TENANT_OUT' ? 'btn-danger' : 'btn-success'}`} disabled={submittingEvent}>
                  {submittingEvent ? 'Verifying & Saving...' : (eventType === 'TENANT_OUT' ? 'Record Going Out' : 'Record Coming In')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Month Modal */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔒 Close Billing Month</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowCloseModal(false)} disabled={submittingCloseMonth}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCloseMonth}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Enter the final meter reading to close <strong>{currentMonth.month}</strong> and calculate final bills for all tenants.
              </p>
              <div className="form-group">
                <label>Final Meter Reading</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="Enter final meter reading"
                  value={closeForm.end_reading}
                  onChange={e => setCloseForm({ ...closeForm, end_reading: e.target.value })}
                  disabled={submittingCloseMonth}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={closeForm.end_date}
                  onChange={e => setCloseForm({ ...closeForm, end_date: e.target.value })}
                  disabled={submittingCloseMonth}
                />
              </div>
              <div className="form-group">
                <label>Meter Photo (Optional, AI verifies reading)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="form-control"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedCloseFile(e.target.files[0]);
                    }
                  }}
                  disabled={submittingCloseMonth}
                />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCloseModal(false)} disabled={submittingCloseMonth}>Cancel</button>
                <button type="submit" className="btn btn-warning" disabled={submittingCloseMonth}>
                  {submittingCloseMonth ? 'Verifying & Finalizing...' : (
                    <>
                      <Lock size={16} /> Close & Finalize
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
