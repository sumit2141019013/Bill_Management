import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentTenant, setCurrentTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for saved session
    const saved = localStorage.getItem('billmgr_tenant');
    if (saved) {
      try {
        const tenant = JSON.parse(saved);
        setCurrentTenant(tenant);
        
        // Fetch latest details in background
        import('./api').then(({ api }) => {
          api.getMe(tenant.id).then(freshTenant => {
            setCurrentTenant(freshTenant);
            localStorage.setItem('billmgr_tenant', JSON.stringify(freshTenant));
          }).catch(() => {
            // If fetching fails (e.g. tenant deleted), log them out
            setCurrentTenant(null);
            localStorage.removeItem('billmgr_tenant');
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
    <AuthContext.Provider value={{ currentTenant, login, logout, updateTenantInfo, loading }}>
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
