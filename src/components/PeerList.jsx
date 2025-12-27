import React from 'react';
import './PeerList.css';

/**
 * PeerList Component
 * 
 * Displays discovered peers with status badges.
 * Clicking a peer selects them for chat.
 */
function PeerList({ peers, selectedPeer, onPeerSelect, myPeerId }) {
  const peerArray = Array.from(peers.values());

  const getStatusBadge = (status) => {
    const badges = {
      connected: { text: '●', className: 'status-connected', title: 'Connected' },
      connecting: { text: '○', className: 'status-connecting', title: 'Connecting...' },
      discovered: { text: '○', className: 'status-discovered', title: 'Discovered' },
      offline: { text: '○', className: 'status-offline', title: 'Offline' }
    };
    return badges[status] || badges.offline;
  };

  if (peerArray.length === 0) {
    return (
      <div className="peer-list">
        <div className="peer-list-header">
          <h3>Peers</h3>
        </div>
        <div className="peer-list-empty">
          <p>No peers discovered yet...</p>
          <small>Waiting for other peers on the network</small>
        </div>
      </div>
    );
  }

  return (
    <div className="peer-list">
      <div className="peer-list-header">
        <h3>Peers ({peerArray.length})</h3>
      </div>
      <ul className="peer-list-items">
        {peerArray.map((peer) => {
          const badge = getStatusBadge(peer.status);
          const isSelected = selectedPeer === peer.peerId;
          const isMe = peer.peerId === myPeerId;

          return (
            <li
              key={peer.peerId}
              className={`peer-item ${isSelected ? 'selected' : ''} ${isMe ? 'is-me' : ''}`}
              onClick={() => !isMe && onPeerSelect(peer.peerId)}
              title={isMe ? 'This is you' : `Click to chat with ${peer.username}`}
            >
              <span className={`status-badge ${badge.className}`} title={badge.title}>
                {badge.text}
              </span>
              <span className="peer-username">{peer.username}</span>
              {isMe && <span className="peer-me-label">(You)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PeerList;

