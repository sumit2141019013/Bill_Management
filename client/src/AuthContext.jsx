import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentTenant, setCurrentTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverWaking, setServerWaking] = useState(false);

  useEffect(() => {
    // Check localStorage for saved session
    const saved = localStorage.getItem('billmgr_tenant');
    if (saved) {
      try {
        const tenant = JSON.parse(saved);
        setCurrentTenant(tenant);
        
        // Fetch latest details in background with timeout
        setServerWaking(true);
        import('./api').then(({ api }) => {
          // Race against a timeout — Render free tier can take 30-60s to cold-start
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 15000)
          );
          Promise.race([api.getMe(tenant.id), timeout])
            .then(freshTenant => {
              setCurrentTenant(freshTenant);
              localStorage.setItem('billmgr_tenant', JSON.stringify(freshTenant));
              setServerWaking(false);
            })
            .catch((err) => {
              setServerWaking(false);
              if (err.message === 'timeout' || err.message === 'Failed to fetch' || err.message === 'Network error') {
                // Server is likely cold-starting — keep user logged in with cached data
                console.log('Server unreachable, using cached session');
              } else {
                // Actual auth error (e.g. tenant deleted) — log them out
                setCurrentTenant(null);
                localStorage.removeItem('billmgr_tenant');
              }
            });
        });
      } catch (e) {
        localStorage.removeItem('billmgr_tenant');
      }
    }
    setLoading(false);
  }, []);

  function login(tenant) {
    setCurrentTenant(tenant);
    localStorage.setItem('billmgr_tenant', JSON.stringify(tenant));
  }

  function logout() {
    setCurrentTenant(null);
    localStorage.removeItem('billmgr_tenant');
  }

  function updateTenantInfo(updatedTenant) {
    setCurrentTenant(updatedTenant);
    localStorage.setItem('billmgr_tenant', JSON.stringify(updatedTenant));
  }

  return (
    <AuthContext.Provider value={{ currentTenant, login, logout, updateTenantInfo, loading, serverWaking }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
