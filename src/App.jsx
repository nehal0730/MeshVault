import React, { useState, useEffect, useCallback } from 'react';
import { browserAdapter } from './browserAdapter';
import Identity from './components/Identity';
import PeerList from './components/PeerList';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import FileTransfer from './components/FileTransfer';
import './App.css';

/**
 * Main App Component
 * 
 * Orchestrates all UI components and manages state flow.
 * Connects React to browser.js via browserAdapter.
 */
function App() {
  const [state, setState] = useState(() => browserAdapter.getState());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize adapter and set up state updates
  useEffect(() => {
    // Set state updater in adapter
    browserAdapter.setStateUpdater((newState) => {
      setState(newState);
    });

    // Set initial theme
    document.documentElement.setAttribute(
      'data-theme',
      state.isDarkMode ? 'dark' : 'light'
    );

    // Poll for peer updates (since browser.js doesn't have events)
    const peerUpdateInterval = setInterval(() => {
      browserAdapter.updatePeerList();
      browserAdapter.syncIncomingFileProgress();
    }, 1000);

    setIsInitialized(true);

    return () => {
      clearInterval(peerUpdateInterval);
    };
  }, []);

  // Callbacks for components
  const handlePeerSelect = useCallback((peerId) => {
    browserAdapter.selectPeer(peerId);
  }, []);

  const handleSendMessage = useCallback(async (text) => {
    await browserAdapter.sendMessage(text);
  }, []);

  const handleSendFile = useCallback(async (file) => {
    await browserAdapter.sendFile(file);
  }, []);

  const handleUsernameChange = useCallback((username) => {
    browserAdapter.setUsername(username);
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    browserAdapter.toggleDarkMode();
  }, []);

  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Initializing MeshVault...</p>
        <small style={{ marginTop: '1rem', color: '#666' }}>
          Waiting for browser.js to initialize...
        </small>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-content">
          <h1 className="app-title">
            <span className="app-icon">🔐</span>
            MeshVault
          </h1>
          <button
            className="theme-toggle"
            onClick={handleToggleDarkMode}
            title={state.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {state.isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="app-main">
        {/* Sidebar */}
        <aside className="app-sidebar">
          <Identity
            username={state.username}
            myPeerId={state.myPeerId}
            onUsernameChange={handleUsernameChange}
          />
          <PeerList
            peers={state.peers}
            selectedPeer={state.selectedPeer}
            onPeerSelect={handlePeerSelect}
            myPeerId={state.myPeerId}
          />
        </aside>

        {/* Chat Area */}
        <main className="app-chat">
          <ChatWindow
            messages={state.messages}
            selectedPeer={state.selectedPeer}
            username={state.username}
          />
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={false}
          />
        </main>

        {/* File Transfer Panel */}
        <aside className="app-files">
          <FileTransfer
            onSendFile={handleSendFile}
            incomingFiles={state.incomingFiles}
            outgoingFiles={state.outgoingFiles}
          />
        </aside>
      </div>
    </div>
  );
}

export default App;

