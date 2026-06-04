import { useState, useEffect } from 'react';
import { Users, Plus, Edit3, Trash2, UserCheck, UserX, X, Phone, Lock, Eye, EyeOff, Shield, Clock } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmContext';

export default function Tenants() {
  const { currentTenant, updateTenantInfo } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [formData, setFormData] = useState({ name: '', joined_date: '', phone: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    loadTenants(true);

    const interval = setInterval(() => {
      if (!showModal && !showPasswordModal) {
        loadTenants(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [showModal, showPasswordModal]);

  async function loadTenants(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await api.getTenants();
      setTenants(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  function openAddModal() {
    setEditingTenant(null);
    setFormData({ name: '', joined_date: new Date().toISOString().split('T')[0], phone: '', password: '' });
    setError('');
    setShowModal(true);
  }

  function openEditModal(tenant) {
    // Only allow editing own profile (unless Admin)
    if (currentTenant && tenant.id !== currentTenant.id && !currentTenant.is_admin) {
      showToast('You can only edit your own profile', 'warning');
      return;
    }
    setEditingTenant(tenant);
    setFormData({ name: tenant.name, joined_date: tenant.joined_date, phone: tenant.phone || '', password: '' });
    setError('');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return;
    }
    const cleanPhone = formData.phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Phone number must be exactly 10 digits');
      return;
    }

    try {
      if (editingTenant) {
        const updated = await api.updateTenant(editingTenant.id, { name: formData.name, phone: formData.phone });
        // If editing self, update auth context
        if (currentTenant && editingTenant.id === currentTenant.id) {
          updateTenantInfo({ ...currentTenant, name: updated.name, phone: updated.phone });
        }
        showToast('Profile updated successfully!', 'success');
      } else {
        await api.createTenant({
          name: formData.name,
          joined_date: formData.joined_date,
          phone: formData.phone,
          password: formData.password || undefined
        });
        showToast('Tenant added successfully!', 'success');
      }
      setShowModal(false);
      loadTenants();
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(tenant) {
    const approved = await confirm({
      title: 'Delete Tenant',
      message: `Are you sure you want to delete "${tenant.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!approved) return;

    try {
      await api.deleteTenant(tenant.id);
      showToast('Tenant deleted successfully', 'success');
      loadTenants();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleToggleActive(tenant) {
    const approved = await confirm({
      title: 'Change Tenant Status',
      message: `Are you sure you want to change ${tenant.name}'s status to ${tenant.is_active ? 'OUT' : 'IN'}?\n\nNote: This only changes their general status. If a billing month is active, please log a meter reading event instead.`,
      confirmText: 'Change Status',
      type: 'warning'
    });
    if (!approved) return;

    try {
      await api.updateTenant(tenant.id, { is_active: !tenant.is_active });
      showToast('Status updated successfully!', 'success');
      loadTenants();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.old_password) {
      setPasswordError('Current password is required');
      return;
    }
    if (!passwordForm.new_password || passwordForm.new_password.length < 4) {
      setPasswordError('New password must be at least 4 characters');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      await api.changePassword(currentTenant.id, passwordForm.old_password, passwordForm.new_password);
      setPasswordSuccess('Password changed successfully!');
      showToast('Password changed successfully!', 'success');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err) {
      setPasswordError(err.message);
      showToast(err.message, 'error');
    }
  }

  const isOwnProfile = (tenant) => currentTenant && tenant.id === currentTenant.id;

  // Calculate member-since duration
  function getMemberDuration(joinedDate) {
    if (!joinedDate) return '';
    const joined = new Date(joinedDate);
    const now = new Date();
    const diffMs = now - joined;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    const remainMonths = months % 12;
    return remainMonths > 0 ? `${years}y ${remainMonths}mo` : `${years}y`;
  }

  // Check if a phone number is masked (contains asterisks)
  function isPhoneMasked(phone) {
    return phone && phone.includes('*');
  }

  const activeTenants = tenants.filter(t => t.is_active && !t.is_admin);
  const inactiveTenants = tenants.filter(t => !t.is_active && !t.is_admin);

  return (
    <div className="page fade-in">
      <div className="page-header flex-between">
        <div>
          <h2>👥 Tenants</h2>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-secondary" onClick={() => {
            setPasswordError('');
            setPasswordSuccess('');
            setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
            setShowOldPass(false);
            setShowNewPass(false);
            setShowPasswordModal(true);
          }}>
            <Lock size={16} /> Change Password
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Tenant
          </button>
        </div>
      </div>

      {/* Privacy Notice */}
      {!(currentTenant?.is_admin) && tenants.length > 0 && (
        <div className="privacy-tooltip">
          <Shield size={16} className="shield-icon" />
          <span>Phone numbers of other tenants are masked for privacy. Only your own number is fully visible.</span>
        </div>
      )}

      {/* Quick Stats Chips */}
      {tenants.length > 0 && (
        <div className="quick-stats-bar">
          <div className="quick-stat-chip">
            <span className="chip-dot green"></span>
            {activeTenants.length} Active
          </div>
          <div className="quick-stat-chip">
            <span className="chip-dot red"></span>
            {inactiveTenants.length} Inactive
          </div>
          <div className="quick-stat-chip">
            <span className="chip-dot purple"></span>
            {tenants.filter(t => !t.is_admin).length} Total Members
          </div>
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Users size={48} className="empty-icon" />
            <h3>No Tenants Added Yet</h3>
            <p>Add tenants who share the room to start splitting bills</p>
            <button className="btn btn-primary mt-2" onClick={openAddModal}>
              <Plus size={16} /> Add First Tenant
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Active Tenants */}
          {activeTenants.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--success)' }}>●</span> Currently In ({activeTenants.length})
              </h3>
              <div className="grid-4 mb-3">
                {activeTenants.map(tenant => (
                  <div key={tenant.id} className={`tenant-card ${isOwnProfile(tenant) ? 'tenant-card-own' : ''}`}>
                    {isOwnProfile(tenant) && (
                      <div className="tenant-own-badge">You</div>
                    )}
                    <div className="tenant-avatar">
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="tenant-name">{tenant.name}</div>
                    <div className="tenant-meta">
                      <Clock size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      Joined {tenant.joined_date}
                      <span className="tenant-duration-badge">{getMemberDuration(tenant.joined_date)}</span>
                    </div>
                    {tenant.phone && (
                      <div className="tenant-meta tenant-phone-row" style={{ fontSize: '0.72rem' }}>
                        {isPhoneMasked(tenant.phone) ? (
                          <>
                            <Shield size={12} className="phone-masked-icon" />
                            <span className="phone-masked">{tenant.phone}</span>
                          </>
                        ) : (
                          <>
                            <Phone size={12} style={{ color: 'var(--success)', marginRight: '4px' }} />
                            <span>{tenant.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex-between mt-1">
                      <span className="badge badge-success">Active</span>
                    </div>
                    {(isOwnProfile(tenant) || (currentTenant && currentTenant.is_admin)) && (
                      <div className="tenant-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(tenant)} title="Edit Profile">
                          <Edit3 size={14} /> Edit
                        </button>
                        {currentTenant && currentTenant.is_admin && (
                          <>
                            <button className="btn btn-sm btn-warning" onClick={() => handleToggleActive(tenant)} title="Mark as Inactive">
                              <UserX size={14} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(tenant)} title="Delete Tenant">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Inactive Tenants */}
          {inactiveTenants.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--danger)' }}>●</span> Currently Out ({inactiveTenants.length})
              </h3>
              <div className="grid-4 mb-3">
                {inactiveTenants.map(tenant => (
                  <div key={tenant.id} className={`tenant-card ${isOwnProfile(tenant) ? 'tenant-card-own' : ''}`} style={{ opacity: isOwnProfile(tenant) ? 1 : 0.7 }}>
                    {isOwnProfile(tenant) && (
                      <div className="tenant-own-badge">You</div>
                    )}
                    <div className="tenant-avatar" style={{ background: isOwnProfile(tenant) ? 'var(--accent-gradient)' : 'var(--bg-glass)' }}>
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="tenant-name">{tenant.name}</div>
                    <div className="tenant-meta">
                      <Clock size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      Joined {tenant.joined_date}
                      <span className="tenant-duration-badge">{getMemberDuration(tenant.joined_date)}</span>
                    </div>
                    {tenant.phone && (
                      <div className="tenant-meta tenant-phone-row" style={{ fontSize: '0.72rem' }}>
                        {isPhoneMasked(tenant.phone) ? (
                          <>
                            <Shield size={12} className="phone-masked-icon" />
                            <span className="phone-masked">{tenant.phone}</span>
                          </>
                        ) : (
                          <>
                            <Phone size={12} style={{ color: 'var(--success)', marginRight: '4px' }} />
                            <span>{tenant.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex-between mt-1">
                      <span className="badge badge-danger">Inactive</span>
                    </div>
                    {(isOwnProfile(tenant) || (currentTenant && currentTenant.is_admin)) && (
                      <div className="tenant-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(tenant)} title="Edit Profile">
                          <Edit3 size={14} /> Edit
                        </button>
                        {currentTenant && currentTenant.is_admin && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleToggleActive(tenant)} title="Mark as Active">
                              <UserCheck size={14} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(tenant)} title="Delete Tenant">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTenant ? 'Edit My Profile' : 'Add New Tenant'}</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tenant Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter tenant name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>
              {editingTenant && (
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="Enter phone number (10 digits)"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    required
                    pattern="[0-9]{10}"
                    title="Phone number must be exactly 10 digits"
                  />
                </div>
              )}
              {!editingTenant && (
                <>
                  <div className="form-group">
                    <label>Joined Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={formData.joined_date}
                      onChange={e => setFormData({ ...formData, joined_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="Enter phone number (10 digits)"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      required
                      pattern="[0-9]{10}"
                      title="Phone number must be exactly 10 digits"
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Enter password (default: 1234)"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </>
              )}
              {error && (
                <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingTenant ? 'Save Changes' : 'Add Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔐 Change Password</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowPasswordModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showOldPass ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Enter current password"
                    value={passwordForm.old_password}
                    onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                    autoFocus
                  />
                  <button
                    type="button"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    onClick={() => setShowOldPass(!showOldPass)}
                    tabIndex={-1}
                  >
                    {showOldPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Enter new password (min 4 chars)"
                    value={passwordForm.new_password}
                    onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  />
                  <button
                    type="button"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    onClick={() => setShowNewPass(!showNewPass)}
                    tabIndex={-1}
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Re-enter new password"
                  value={passwordForm.confirm_password}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                />
              </div>
              {passwordError && (
                <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{passwordError}</p>
              )}
              {passwordSuccess && (
                <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>{passwordSuccess}</p>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <Lock size={16} /> Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
