import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Calendar, Shield, Clock, Lock, Edit3, Activity, Zap, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';

export default function Profile() {
  const { currentTenant } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    loadRecentActivity();
  }, []);

  async function loadRecentActivity() {
    try {
      // Load recent months and find events related to this user
      const months = await api.getMonths();
      const activities = [];

      // Load last 3 months details to get events
      const recentMonths = months.slice(0, 3);
      for (const m of recentMonths) {
        try {
          const details = await api.getMonth(m.id);
          if (details.events) {
            details.events
              .filter(e => e.tenant_id === currentTenant?.id || e.event_type === 'MONTH_START' || e.event_type === 'MONTH_END')
              .forEach(e => {
                let text = '';
                let dotClass = 'info';
                if (e.event_type === 'TENANT_OUT') {
                  text = `You went out — Meter: ${e.meter_reading}`;
                  dotClass = 'danger';
                } else if (e.event_type === 'TENANT_IN') {
                  text = `You came back — Meter: ${e.meter_reading}`;
                  dotClass = 'success';
                } else if (e.event_type === 'MONTH_START') {
                  text = `Month ${m.month} started`;
                  dotClass = 'info';
                } else if (e.event_type === 'MONTH_END') {
                  text = `Month ${m.month} closed`;
                  dotClass = 'warning';
                }
                activities.push({
                  id: e.id,
                  text,
                  dotClass,
                  date: e.event_date,
                  month: m.month
                });
              });
          }
        } catch (err) {
          // skip silently
        }
      }

      // Sort by date descending and take top 8
      activities.sort((a, b) => b.date.localeCompare(a.date));
      setRecentActivity(activities.slice(0, 8));
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  }

  // Calculate member duration
  function getMemberDuration(joinedDate) {
    if (!joinedDate) return 'N/A';
    const joined = new Date(joinedDate);
    const now = new Date();
    const diffMs = now - joined;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 1) return 'Today';
    if (days < 30) return `${days} days`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    const remainMonths = months % 12;
    return remainMonths > 0 ? `${years}y ${remainMonths}mo` : `${years} year${years > 1 ? 's' : ''}`;
  }

  if (!currentTenant) {
    return null;
  }

  return (
    <div className="page fade-in profile-page">
      <div className="page-header">
        <button className="btn btn-sm btn-secondary mb-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <h2>👤 My Profile</h2>
        <p>View your account details and activity</p>
      </div>

      {/* Profile Header Card */}
      <div className="profile-header-card">
        <div className="profile-big-avatar">
          {currentTenant.name.charAt(0).toUpperCase()}
        </div>
        <div className="profile-header-info">
          <h2>{currentTenant.name}</h2>
          <span className={`profile-role ${currentTenant.is_admin ? 'profile-role-admin' : 'profile-role-member'}`}>
            {currentTenant.is_admin ? (
              <><Shield size={12} /> Admin</>
            ) : (
              <><User size={12} /> Member</>
            )}
          </span>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Member for {getMemberDuration(currentTenant.joined_date)}
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="privacy-tooltip">
        <Shield size={16} className="shield-icon" />
        <span>Your phone number is <strong>private</strong>. Other tenants see a masked version like <code style={{ fontFamily: 'monospace', color: 'var(--warning)' }}>98****3210</code></span>
      </div>

      {/* Account Details */}
      <div className="card mb-3">
        <div className="card-header">
          <div className="card-title">
            <User size={18} className="icon" />
            Account Details
          </div>
        </div>
        <div className="profile-details-grid">
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <User size={14} /> Username
            </div>
            <div className="profile-detail-value">{currentTenant.name}</div>
          </div>
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Phone size={14} /> Phone Number
            </div>
            <div className="profile-detail-value">
              {currentTenant.phone ? currentTenant.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : 'Not set'}
            </div>
          </div>
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Calendar size={14} /> Joined Date
            </div>
            <div className="profile-detail-value">{currentTenant.joined_date || 'N/A'}</div>
          </div>
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Clock size={14} /> Member Duration
            </div>
            <div className="profile-detail-value">{getMemberDuration(currentTenant.joined_date)}</div>
          </div>
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Activity size={14} /> Status
            </div>
            <div className="profile-detail-value">
              <span className={`badge ${currentTenant.is_active ? 'badge-success' : 'badge-danger'}`}>
                {currentTenant.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Shield size={14} /> Role
            </div>
            <div className="profile-detail-value">
              <span className={`badge ${currentTenant.is_admin ? 'badge-warning' : 'badge-info'}`}>
                {currentTenant.is_admin ? 'Administrator' : 'Tenant'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-3">
        <div className="card-header">
          <div className="card-title">
            <Zap size={18} className="icon" />
            Quick Actions
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-secondary" onClick={() => navigate('/tenants')}>
            <Edit3 size={16} /> Edit Profile
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/tenants')}>
            <Lock size={16} /> Change Password
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Activity size={18} className="icon" />
            Recent Activity
          </div>
        </div>
        {loadingActivity ? (
          <div className="empty-state" style={{ padding: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Loading activity...</p>
          </div>
        ) : recentActivity.length > 0 ? (
          <div className="activity-log">
            {recentActivity.map(activity => (
              <div key={activity.id} className="activity-log-item">
                <div className={`activity-log-dot ${activity.dotClass}`}></div>
                <div className="activity-log-text">{activity.text}</div>
                <div className="activity-log-time">{activity.date}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '1.5rem' }}>
            <Activity size={32} className="empty-icon" />
            <p>No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
