import { useState } from 'react';
import { Zap, User, Lock, Eye, EyeOff, UserPlus, LogIn, Phone } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    if (isRegistering && password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      if (isRegistering) {
        // Register tenant (admin flag defaults to false)
        const data = await api.register(name.trim(), phone.trim(), password);
        login(data.tenant);
      } else {
        const data = await api.login(name.trim(), password);
        login(data.tenant);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <div className="login-header">
            <div className="login-logo">
              <div className="login-logo-icon"><Zap size={32} /></div>
            </div>
            <h1>Bill<span>Manager</span></h1>
            <p>{isRegistering ? 'Create a new tenant account' : 'Enter your name and password to sign in'}</p>
          </div>

          {/* Toggle between Sign In and Sign Up */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
            <button
              type="button"
              style={{ flex: 1, padding: '8px 16px', background: !isRegistering ? 'var(--primary)' : 'transparent', color: !isRegistering ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              onClick={() => { setIsRegistering(false); setError(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              style={{ flex: 1, padding: '8px 16px', background: isRegistering ? 'var(--primary)' : 'transparent', color: isRegistering ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              onClick={() => { setIsRegistering(true); setError(''); }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {/* Name Input */}
            <div className="login-field">
              <div className="login-field-icon"><User size={18} /></div>
              <input
                type="text"
                placeholder={isRegistering ? 'Choose a Username (e.g. John)' : 'Enter Your Phone Number'}
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {/* Phone Input – only during registration */}
            {isRegistering && (
              <div className="login-field">
                <div className="login-field-icon"><Phone size={18} /></div>
                <input
                  type="tel"
                  placeholder="Enter Phone Number (Optional)"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            )}

            {/* Password Input */}
            <div className="login-field">
              <div className="login-field-icon"><Lock size={18} /></div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={isRegistering ? 'Choose Password (min 4 chars)' : 'Password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
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

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-btn"
              disabled={loading || !name || !password}
            >
              {loading ? (
                <span className="login-btn-loading">{isRegistering ? 'Creating Account...' : 'Signing in...'}</span>
              ) : (
                <>
                  {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
                  {isRegistering ? 'Sign Up' : 'Sign In'}
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
