import { useState, useEffect } from 'react';
import { Zap, Phone, Lock, LogIn, Eye, EyeOff, User, UserPlus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    try {
      const data = await api.getTenants();
      setTenants(data);
    } catch (err) {
      console.error('Error loading tenants:', err);
    }
  }

  const selectedTenant = tenants.find(t => t.id === parseInt(selectedTenantId));

  useEffect(() => {
    if (selectedTenant) {
      if (selectedTenant.is_admin) {
        setIsSetupMode(false);
        setPhone('admin');
        setPassword('');
      } else if (!selectedTenant.phone) {
        setIsSetupMode(true);
        setPhone('');
        setPassword('');
        setConfirmPassword('');
      } else {
        setIsSetupMode(false);
        setPhone('');
        setPassword('');
      }
      setError('');
    } else {
      setIsSetupMode(false);
      setError('');
    }
  }, [selectedTenantId, tenants]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!selectedTenantId) {
      setError('Please select your tenant name');
      return;
    }

    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }

    if (isSetupMode) {
      if (password.length < 4) {
        setError('Password must be at least 4 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      setLoading(true);
      try {
        const data = await api.setupCredentials(parseInt(selectedTenantId), phone.trim(), password);
        login(data.tenant);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      if (!password.trim()) {
        setError('Please enter your password');
        return;
      }

      setLoading(true);
      try {
        const data = await api.login(phone.trim(), password);
        if (data.tenant.id !== parseInt(selectedTenantId)) {
          throw new Error('Logged in account does not match the selected tenant');
        }
        login(data.tenant);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-bg-orb orb-1"></div>
        <div className="login-bg-orb orb-2"></div>
        <div className="login-bg-orb orb-3"></div>
      </div>

      <div className="login-container">
        <div className="login-card animate-slide-up">
          {/* Logo & Header */}
          <div className="login-header">
            <div className="login-logo">
              <div className="login-logo-icon">
                <Zap size={32} />
              </div>
            </div>
            <h1>Bill<span>Manager</span></h1>
            <p>Select your profile and sign in</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Tenant Select */}
            <div className="login-field">
              <div className="login-field-icon">
                <User size={18} />
              </div>
              <select
                value={selectedTenantId}
                onChange={e => setSelectedTenantId(e.target.value)}
                className="login-select"
                required
              >
                <option value="">— Select Your Name —</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {!t.phone ? '(First Time Setup)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedTenantId && (
              <>
                {isSetupMode && (
                  <div className="setup-badge">
                    <UserPlus size={14} /> First Time Setup
                  </div>
                )}

                {/* Phone Input */}
                {!selectedTenant?.is_admin && (
                  <div className="login-field">
                    <div className="login-field-icon">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      placeholder={isSetupMode ? "Enter Your Phone Number" : "Enter Registered Phone"}
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </div>
                )}

                {/* Password Input */}
                <div className="login-field">
                  <div className="login-field-icon">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isSetupMode ? "Choose Password (min 4 chars)" : "Enter Password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={isSetupMode ? "new-password" : "current-password"}
                    required
                  />
                  <button
                    type="button"
                    className="login-field-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Confirm Password (only in setup mode) */}
                {isSetupMode && (
                  <div className="login-field">
                    <div className="login-field-icon">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-btn"
              disabled={loading || !selectedTenantId}
            >
              {loading ? (
                <span className="login-btn-loading">
                  {isSetupMode ? 'Setting up...' : 'Signing in...'}
                </span>
              ) : (
                <>
                  <LogIn size={18} />
                  {isSetupMode ? 'Set Up & Sign In' : 'Sign In'}
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>Room Electricity Bill Splitting System</p>
          </div>
        </div>
      </div>
    </div>
  );
}
