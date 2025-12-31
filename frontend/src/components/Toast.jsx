import React, { useState, useEffect } from 'react';
import './Toast.css';

/**
 * Toast Notification Component
 * Displays temporary notifications for errors and alerts
 */
function Toast({ id, message, type = 'info', duration = 4000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration <= 0) return; // Don't auto-close if duration is 0 or negative
    
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  if (!isVisible) return null;

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'error' && '❌'}
          {type === 'warning' && '⚠️'}
          {type === 'success' && '✅'}
          {type === 'info' && 'ℹ️'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
      <button 
        className="toast-close"
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default Toast;
