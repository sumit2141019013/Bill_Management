import { useState, useEffect, useRef } from 'react';
import { Zap, User, Lock, Eye, EyeOff, UserPlus, LogIn, Phone, ShieldCheck, ArrowLeft, RefreshCw, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mockOtpHelper, setMockOtpHelper] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const otpInputRef = useRef(null);

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Auto-focus OTP input when OTP is sent
  useEffect(() => {
    if (otpSent && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpSent]);

  function resetRegistration() {
    setOtpSent(false);
    setOtpCode('');
    setMockOtpHelper('');
    setOtpTimer(0);
    setError('');
  }

  function handlePhoneChange(e) {
    // Only allow digits, max 10 characters
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(value);
  }

  async function handleSendOtp() {
    setError('');
    if (!name.trim()) {
      setError('Please enter a username first');
      return;
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Phone number must be exactly 10 digits');
      return;
    }
    if (!password.trim()) {
      setError('Please choose a password first');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setSendingOtp(true);
    try {
      const data = await api.sendOTP(cleanPhone, name.trim());
      setOtpSent(true);
      setOtpTimer(300); // 5 minutes = 300 seconds
      setMockOtpHelper(data.mockOtp || '');
      showToast(data.message || 'OTP sent successfully!', 'success');
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleResendOtp() {
    setOtpCode('');
    setMockOtpHelper('');
    setError('');
    await handleSendOtp();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }

    // Login flow
    if (!isRegistering) {
      if (!password.trim()) {
        setError('Please enter a password');
        return;
      }
      setLoading(true);
      try {
        const data = await api.login(name.trim(), password);
        showToast(`Welcome back, ${data.tenant.name}!`, 'success');
        login(data.tenant);
      } catch (err) {
        setError(err.message);
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Registration flow — Step 1: Send OTP
    if (isRegistering && !otpSent) {
      await handleSendOtp();
      return;
    }

    // Registration flow — Step 2: Verify OTP & Register
    if (isRegistering && otpSent) {
      const cleanOtp = otpCode.trim();
      if (cleanOtp.length !== 6) {
        setError('Please enter the 6-digit verification code');
        return;
      }
      setLoading(true);
      try {
        const data = await api.register(name.trim(), phone.trim(), password, cleanOtp);
        showToast('Account created successfully! Phone verified ✓', 'success');
        login(data.tenant);
      } catch (err) {
        setError(err.message);
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanPhone = phone.trim().replace(/\D/g, '');
  const phoneValid = cleanPhone.length === 10;

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
            <p>
              {isRegistering
                ? (otpSent ? 'Verify your phone number' : 'Create a new tenant account')
                : 'Enter your name and password to sign in'}
            </p>
          </div>

          {/* Toggle between Sign In and Sign Up */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
            <button
              type="button"
              style={{ flex: 1, padding: '8px 16px', background: !isRegistering ? 'var(--primary)' : 'transparent', color: !isRegistering ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              onClick={() => { setIsRegistering(false); resetRegistration(); setError(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              style={{ flex: 1, padding: '8px 16px', background: isRegistering ? 'var(--primary)' : 'transparent', color: isRegistering ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              onClick={() => { setIsRegistering(true); resetRegistration(); setError(''); }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {/* ===== STEP 1: Name, Phone, Password (before OTP sent) ===== */}
            {(!isRegistering || !otpSent) && (
              <>
                {/* Name Input */}
                <div className="login-field">
                  <div className="login-field-icon"><User size={18} /></div>
                  <input
                    type="text"
                    placeholder={isRegistering ? 'Choose a Username (e.g. John)' : 'Enter Your Username or Phone Number'}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>

                {/* Phone Input – required during registration */}
                {isRegistering && (
                  <div className="login-field">
                    <div className="login-field-icon"><Phone size={18} /></div>
                    <input
                      type="tel"
                      placeholder="Enter Phone Number (10 digits)"
                      value={phone}
                      onChange={handlePhoneChange}
                      autoComplete="tel"
                      required
                      maxLength={10}
                      inputMode="numeric"
                    />
                    {phone && (
                      <span style={{
                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: '0.75rem', fontWeight: 600,
                        color: phoneValid ? 'var(--success)' : 'var(--text-muted)',
                      }}>
                        {cleanPhone.length}/10
                      </span>
                    )}
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
              </>
            )}

            {/* ===== STEP 2: OTP Verification (after OTP sent) ===== */}
            {isRegistering && otpSent && (
              <>
                {/* OTP Sent Confirmation */}
                <div style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <ShieldCheck size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    A 6-digit verification code has been sent to <strong style={{ color: 'var(--text-primary)' }}>+91 {cleanPhone.slice(0,5)}***{cleanPhone.slice(8)}</strong>
                  </div>
                </div>

                {/* Mock OTP Helper (dev mode) */}
                {mockOtpHelper && (
                  <div style={{
                    background: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid rgba(234, 179, 8, 0.35)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <KeyRound size={18} style={{ color: '#eab308', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Mock Mode OTP: </span>
                      <strong style={{ color: '#eab308', fontSize: '1.1rem', letterSpacing: '3px', fontFamily: 'monospace' }}>{mockOtpHelper}</strong>
                    </div>
                  </div>
                )}

                {/* OTP Input */}
                <div className="login-field">
                  <div className="login-field-icon"><ShieldCheck size={18} /></div>
                  <input
                    ref={otpInputRef}
                    type="text"
                    placeholder="Enter 6-Digit OTP Code"
                    value={otpCode}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpCode(val);
                    }}
                    maxLength={6}
                    inputMode="numeric"
                    style={{ letterSpacing: '6px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace' }}
                    required
                  />
                </div>

                {/* Timer & Resend */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  fontSize: '0.82rem',
                }}>
                  <button
                    type="button"
                    onClick={resetRegistration}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', fontSize: '0.82rem',
                    }}
                  >
                    <ArrowLeft size={14} /> Change Details
                  </button>
                  {otpTimer > 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>
                      Resend in <strong style={{ color: 'var(--accent-primary)' }}>{formatTimer(otpTimer)}</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={sendingOtp}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.82rem',
                      }}
                    >
                      <RefreshCw size={14} /> Resend OTP
                    </button>
                  )}
                </div>
              </>
            )}

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-btn"
              disabled={
                loading || sendingOtp || !name ||
                (!isRegistering && !password) ||
                (isRegistering && !otpSent && (!phone || !phoneValid || !password)) ||
                (isRegistering && otpSent && otpCode.length !== 6)
              }
            >
              {loading || sendingOtp ? (
                <span className="login-btn-loading">
                  {sendingOtp ? 'Sending OTP...' : (isRegistering ? 'Verifying & Creating...' : 'Signing in...')}
                </span>
              ) : (
                <>
                  {isRegistering ? (
                    otpSent ? <><ShieldCheck size={18} /> Verify &amp; Sign Up</> : <><Phone size={18} /> Send OTP</>
                  ) : (
                    <><LogIn size={18} /> Sign In</>
                  )}
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
