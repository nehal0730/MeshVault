import React, { useState, useEffect } from 'react';
import './Monitoring.css';

/**
 * Monitoring Dashboard Component
 * 
 * Displays network statistics, message history, and peer information
 * useful for debugging and monitoring mesh network health.
 */
function Monitoring({ peers, messages }) {
  const [stats, setStats] = useState({
    messagesCount: 0,
    peersCount: 0,
    connectedCount: 0,
    uptime: 0,
    messagesPerSecond: 0,
    networkHealth: 100,
    memoryUsage: 0
  });

  const [startTime] = useState(Date.now());
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  // Update statistics every 500ms for better real-time monitoring
  useEffect(() => {
    const statsInterval = setInterval(() => {
      const now = Date.now();
      const uptime = Math.floor((now - startTime) / 1000);
      
      // Calculate messages per second
      const currentMessageCount = messages.length;
      const mps = currentMessageCount > lastMessageCount 
        ? ((currentMessageCount - lastMessageCount) / 0.5) 
        : 0;
      
      if (currentMessageCount !== lastMessageCount) {
        setLastMessageCount(currentMessageCount);
      }

      // Calculate network health (0-100)
      const connectedPeers = Array.from(peers.values()).filter(p => p.status === 'connected').length;
      const totalPeers = peers.size || 1;
      const connectionHealth = totalPeers > 0 ? (connectedPeers / totalPeers) * 100 : 0;
      
      // Check for errors in logs
      const logElement = document.getElementById('log');
      const logs = logElement ? logElement.textContent : '';
      const errorCount = (logs.match(/❌|⚠️/g) || []).length;
      const stabilityScore = Math.max(0, 100 - (errorCount * 2));

      const health = totalPeers > 0 ? Math.round((connectionHealth + stabilityScore) / 2) : 50;

      // Get memory usage if available
      let memoryUsage = 0;
      if (performance.memory) {
        memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576); // Convert to MB
      }

      setStats(prevStats => {
        // Only update if values actually changed to avoid unnecessary re-renders
        const newStats = {
          messagesCount: currentMessageCount,
          peersCount: totalPeers,
          connectedCount: connectedPeers,
          uptime,
          messagesPerSecond: Math.round(mps * 100) / 100,
          networkHealth: health,
          memoryUsage
        };
        
        // Check if any value changed
        const hasChanged = Object.keys(newStats).some(key => prevStats[key] !== newStats[key]);
        return hasChanged ? newStats : prevStats;
      });
    }, 500);

    return () => clearInterval(statsInterval);
  }, [messages, peers, lastMessageCount, startTime]);

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const getHealthColor = (health) => {
    if (health >= 80) return '#4ade80'; // green
    if (health >= 50) return '#facc15'; // yellow
    return '#ef4444'; // red
  };

  const getPeerStats = () => {
    let connected = 0;
    let connecting = 0;
    let offline = 0;

    for (const peer of peers.values()) {
      if (peer.status === 'connected') connected++;
      else if (peer.status === 'connecting') connecting++;
      else offline++;
    }

    return { connected, connecting, offline };
  };

  const peerStats = getPeerStats();

  return (
    <div className="monitoring">
      <div className="monitoring-header">
        <h3>📊 Network Monitor</h3>
        <button 
          className="monitoring-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '▼' : '▶'}
        </button>
      </div>

      {/* Quick Stats Bar */}
      <div className="monitoring-quick-stats">
        <div className="stat-item">
          <span className="stat-label">Network Health</span>
          <div className="health-bar">
            <div 
              className="health-fill"
              style={{
                width: `${stats.networkHealth}%`,
                backgroundColor: getHealthColor(stats.networkHealth)
              }}
            />
          </div>
          <span className="stat-value">{stats.networkHealth}%</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">Peers</span>
          <span className="stat-value">{stats.connectedCount}/{stats.peersCount}</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">Messages</span>
          <span className="stat-value">{stats.messagesCount}</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">{formatUptime(stats.uptime)}</span>
        </div>
      </div>

      {/* Detailed Stats */}
      {showDetails && (
        <div className="monitoring-details">
          <div className="details-grid">
            {/* Network Status */}
            <div className="detail-section">
              <h4>🌐 Network Status</h4>
              <div className="detail-item">
                <span>Connected Peers:</span>
                <span className="status-badge connected">{peerStats.connected}</span>
              </div>
              <div className="detail-item">
                <span>Connecting:</span>
                <span className="status-badge connecting">{peerStats.connecting}</span>
              </div>
              <div className="detail-item">
                <span>Offline:</span>
                <span className="status-badge offline">{peerStats.offline}</span>
              </div>
              <div className="detail-item">
                <span>Messages/sec:</span>
                <span>{stats.messagesPerSecond.toFixed(2)}</span>
              </div>
            </div>

            {/* System Resources */}
            <div className="detail-section">
              <h4>💾 System Resources</h4>
              <div className="detail-item">
                <span>Memory Usage:</span>
                <span>{stats.memoryUsage} MB</span>
              </div>
              <div className="detail-item">
                <span>Session Uptime:</span>
                <span>{formatUptime(stats.uptime)}</span>
              </div>
              <div className="detail-item">
                <span>Messages in Memory:</span>
                <span>{stats.messagesCount}</span>
              </div>
              <div className="detail-item">
                <span>Peer Identities:</span>
                <span>{peers.size}</span>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="detail-section">
              <h4>⚡ Performance</h4>
              <div className="detail-item">
                <span>Network Health:</span>
                <span style={{ color: getHealthColor(stats.networkHealth) }}>
                  {stats.networkHealth}%
                </span>
              </div>
              <div className="detail-item">
                <span>Load:</span>
                <span className={stats.messagesPerSecond > 1 ? 'warning' : 'normal'}>
                  {stats.messagesPerSecond > 1 ? '⚠️ High' : '✅ Normal'}
                </span>
              </div>
            </div>
          </div>

          {/* Peer List */}
          <div className="monitoring-peers">
            <h4>👥 Connected Peers</h4>
            <div className="peer-list">
              {Array.from(peers.entries()).map(([peerId, peer]) => (
                <div key={peerId} className={`peer-item ${peer.status}`}>
                  <div className="peer-info">
                    <span className="peer-name">{peer.username}</span>
                    <span className="peer-id">{peerId.substring(0, 8)}...</span>
                  </div>
                  <span className={`peer-status peer-${peer.status}`}>
                    {peer.status === 'connected' && '🟢 Connected'}
                    {peer.status === 'connecting' && '🟡 Connecting'}
                    {peer.status === 'discovered' && '🟠 Discovered'}
                    {peer.status === 'offline' && '⚫ Offline'}
                  </span>
                </div>
              ))}
              {peers.size === 0 && (
                <div className="no-peers">No peers discovered yet</div>
              )}
            </div>
          </div>

          {/* Message Stats */}
          <div className="monitoring-messages">
            <h4>💬 Message Summary</h4>
            <div className="message-stats">
              <p>Total Messages: {stats.messagesCount}</p>
              <p>Messages/sec: {stats.messagesPerSecond.toFixed(2)}</p>
              <p>Avg Message Size: ~{stats.messagesCount > 0 ? '50-200 bytes' : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Monitoring;
