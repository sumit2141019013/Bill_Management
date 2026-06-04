import { createContext, useContext, useState, useRef, useCallback } from 'react';
import { HelpCircle, AlertTriangle, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'info', // 'info' | 'danger' | 'warning'
  });
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    setState({
      open: true,
      title: options.title || 'Are you sure?',
      message: options.message || '',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      type: options.type || 'info',
    });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <div className="modal-overlay" onClick={handleCancel} style={{ zIndex: 9999 }}>
          <div className="modal confirm-modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="confirm-modal-header">
              <div className={`confirm-icon-box confirm-icon-${state.type}`}>
                {state.type === 'danger' || state.type === 'warning' ? (
                  <AlertTriangle size={20} />
                ) : (
                  <HelpCircle size={20} />
                )}
              </div>
              <h3>{state.title}</h3>
              <button className="confirm-modal-close" onClick={handleCancel}>
                <X size={16} />
              </button>
            </div>
            <div className="confirm-modal-body">
              <p>{state.message}</p>
            </div>
            <div className="confirm-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                {state.cancelText}
              </button>
              <button
                type="button"
                className={`btn ${
                  state.type === 'danger'
                    ? 'btn-danger'
                    : state.type === 'warning'
                    ? 'btn-warning'
                    : 'btn-primary'
                }`}
                onClick={handleConfirm}
                autoFocus
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
