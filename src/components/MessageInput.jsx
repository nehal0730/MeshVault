import React, { useState, useRef, useEffect } from 'react';
import './MessageInput.css';

/**
 * MessageInput Component
 * 
 * Text input with send button for chat messages.
 * Supports Enter key to send.
 */
function MessageInput({ onSendMessage, disabled }) {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      // Refocus input after sending
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <div className="message-input-container">
        <input
          ref={inputRef}
          type="text"
          className="message-input-field"
          placeholder="Type a message to all peers..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="submit"
          className="message-input-send"
          disabled={!message.trim() || disabled}
          title="Send message (Enter)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </form>
  );
}

export default MessageInput;

