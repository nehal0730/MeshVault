import React, { useState, useEffect } from 'react';
import './Identity.css';

/**
 * Identity Component
 * 
 * Username input and save functionality.
 * Shows current peer ID.
 */
function Identity({ username, myPeerId, onUsernameChange }) {
  const [inputValue, setInputValue] = useState(username || '');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setInputValue(username || '');
  }, [username]);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      alert('Username required');
      return;
    }
    onUsernameChange(trimmed);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div className="identity">
      <div className="identity-header">
        <h3>Identity</h3>
      </div>
      <div className="identity-content">
        <div className="identity-input-group">
          <label htmlFor="username-input">Username</label>
          <div className="identity-input-container">
            <input
              id="username-input"
              type="text"
              className="identity-input"
              placeholder="Enter your username"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="identity-save"
              onClick={handleSave}
              disabled={!inputValue.trim()}
            >
              {isSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
        {myPeerId && (
          <div className="identity-peer-id">
            <label>Peer ID</label>
            <code className="peer-id-value" title={myPeerId}>
              {myPeerId.substring(0, 8)}...
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

export default Identity;
