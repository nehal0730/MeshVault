import React, { useEffect, useRef } from 'react';
import './ChatWindow.css';

/**
 * ChatWindow Component
 * 
 * Displays chat messages in bubbles with timestamps.
 * Auto-scrolls to bottom on new messages.
 */
function ChatWindow({ messages, selectedPeer, username }) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  if (!selectedPeer && messages.length === 0) {
    return (
      <div className="chat-window">
        <div className="chat-window-empty">
          <div className="empty-state">
            <h3>Welcome to MeshVault</h3>
            <p>Select a peer from the list to start chatting</p>
            <small>Messages are end-to-end encrypted</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window" ref={containerRef}>
      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-bubble ${msg.isOwn ? 'message-own' : 'message-other'}`}
          >
            <div className="message-header">
              <span className="message-username">{msg.username}</span>
              <span className="message-time">{formatTime(msg.time)}</span>
            </div>
            <div className="message-text">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default ChatWindow;

