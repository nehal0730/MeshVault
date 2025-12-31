import React, { useState, useCallback } from 'react';
import Toast from './Toast';

/**
 * Toast Manager Component
 * Manages multiple toast notifications
 */
let toastInstance = null;

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Expose globally for use outside React components
  if (typeof window !== 'undefined') {
    window.__toastManager = { showToast, removeToast };
  }

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}

export default ToastContainer;

// Helper function to show toast from anywhere
export function showToast(message, type = 'info', duration = 4000) {
  if (window.__toastManager) {
    return window.__toastManager.showToast(message, type, duration);
  }
}
