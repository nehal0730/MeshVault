class BrowserAdapter {
  constructor() {
    // Memory optimization constants
    this.MAX_MESSAGE_HISTORY = Infinity;      // Keep ALL messages (disabled cleanup)
    this.MESSAGE_CLEANUP_INTERVAL = 30000; // Cleanup every 30 seconds (disabled)
    this.MAX_COMPLETED_FILES = Infinity;      // Keep ALL completed files (disabled cleanup)
    this.SEEN_MESSAGE_CLEANUP_INTERVAL = 60000; // Clear old seenMessages every 60 seconds (disabled)
    
    // State that React will subscribe to
    this.state = {
      peers: new Map(),           // peerId -> { username, lastSeen, status }
      messages: [],               // Array of message objects
      selectedPeer: null,         // Currently selected peer ID
      incomingFiles: [],          // Array of { name, size, mime, from, fileId, progress, downloadUrl }
      outgoingFiles: [],          // Array of { name, size, progress, fileId } for sending
      username: localStorage.getItem("username") || "",
      myPeerId: localStorage.getItem("peerId") || null,
      isDarkMode: localStorage.getItem("darkMode") === "true"
    };
    
    // Track seen file IDs to prevent duplicates
    this.seenFileIds = new Set();
    
    // Track files by signature (name+size+from) to prevent duplicate files with different IDs
    this.seenFileSignatures = new Set();

    // React state updater function (set by App component)
    this.updateState = null;

    // Bind methods to preserve context
    this.handleMessage = this.handleMessage.bind(this);
    this.handleFileProgress = this.handleFileProgress.bind(this);
    this.handleFileReceived = this.handleFileReceived.bind(this);
    
    this.init();
  }

  init() {
    // Wait for browser.js to be loaded
    if (typeof window !== 'undefined') {
      // Override browser.js functions to hook into React
      this.hookIntoBrowserJS();
      // Start memory cleanup routine
      this.startMemoryCleanup();
    }
  }

  startMemoryCleanup() {
    // Cleanup old messages periodically
    setInterval(() => {
      this.cleanupMessageHistory();
    }, this.MESSAGE_CLEANUP_INTERVAL);

    // Cleanup old seenMessages/seenFileIds periodically
    setInterval(() => {
      this.cleanupSeenTracking();
    }, this.SEEN_MESSAGE_CLEANUP_INTERVAL);

    // Cleanup completed files
    setInterval(() => {
      this.cleanupCompletedFiles();
    }, 30000); // Every 30 seconds
  }

  cleanupMessageHistory() {
    if (this.state.messages.length > this.MAX_MESSAGE_HISTORY) {
      const removed = this.state.messages.length - this.MAX_MESSAGE_HISTORY;
      this.state.messages = this.state.messages.slice(-this.MAX_MESSAGE_HISTORY);
      console.log(`♻️ Cleaned up message history: removed ${removed} old messages, keeping last ${this.MAX_MESSAGE_HISTORY}`);
      this.notifyUpdate();
    }
  }

  cleanupSeenTracking() {
    // Limit seenFileIds and seenFileSignatures to prevent unbounded growth
    if (this.seenFileIds.size > this.MAX_COMPLETED_FILES) {
      // Create a new Set with only the most recent files
      const idsArray = Array.from(this.seenFileIds);
      this.seenFileIds = new Set(idsArray.slice(-this.MAX_COMPLETED_FILES));
      console.log(`♻️ Cleaned up seenFileIds: keeping last ${this.MAX_COMPLETED_FILES} file IDs`);
    }

    if (this.seenFileSignatures.size > this.MAX_COMPLETED_FILES) {
      const sigArray = Array.from(this.seenFileSignatures);
      this.seenFileSignatures = new Set(sigArray.slice(-this.MAX_COMPLETED_FILES));
      console.log(`♻️ Cleaned up seenFileSignatures: keeping last ${this.MAX_COMPLETED_FILES} signatures`);
    }
  }

  cleanupCompletedFiles() {
    // DISABLED: Keep all files and messages permanently
    // User explicitly requested not to remove any files or messages
    // This allows users to see their complete file and chat history
    return;
  }

  hookIntoBrowserJS() {
    // Wait for browser.js to fully initialize
    const checkBrowserJS = setInterval(() => {
      // Check if browser.js has exposed its critical variables
      if (window.__meshVaultMyId && 
          window.__meshVaultPeers && 
          typeof window.handleDecryptedMessage === 'function') {
        clearInterval(checkBrowserJS);
        console.log('✅ browser.js detected as ready');
        this.setupHooks();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkBrowserJS);
      console.warn('⚠️ browser.js initialization timeout - proceeding anyway');
      this.setupHooks();
    }, 10000);
  }

  exposeBrowserJSVariables() {
    // Inject code to expose browser.js variables to window
    // This runs in the same scope as browser.js
    try {
      // Create a script that exposes the variables
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          // Try to access variables from browser.js scope
          // Since they're const/let, we'll hook into functions that use them
          if (typeof renderPeers === 'function') {
            window._browserJSReady = true;
          }
        })();
      `;
      document.head.appendChild(script);
      document.head.removeChild(script);
    } catch (e) {
      console.warn('Could not expose browser.js variables:', e);
    }
  }

  setupHooks() {
    // Expose browser.js variables to window for adapter access
    // Since browser.js uses const/let, we need to expose them via a getter
    if (typeof window !== 'undefined') {
      // Try to access browser.js variables through eval in the same scope
      // Or hook into renderPeers to capture peer updates
      
      // Create a way to access peers - hook into renderPeers
      const originalRenderPeers = window.renderPeers;
      
      // Override renderPeers to update React state AND expose peers
      if (originalRenderPeers) {
        window.renderPeers = () => {
          originalRenderPeers();
          // After renderPeers runs, try to read peers from the DOM or use a different method
          this.updatePeerList();
        };
      }
    }

    // Get myPeerId from browser.js if available
    // Try multiple ways to access it
    if (window.myId) {
      this.state.myPeerId = window.myId;
    } else {
      // Try to get from localStorage (browser.js stores it there)
      const storedPeerId = localStorage.getItem("peerId");
      if (storedPeerId) {
        this.state.myPeerId = storedPeerId;
      }
    }

    // Store original functions if they exist
    const originalHandleChatMessage = window.handleChatMessage;
    const originalHandleDecryptedMessage = window.handleDecryptedMessage;

    // Override handleChatMessage to update React state
    if (originalHandleChatMessage) {
      window.handleChatMessage = (msg) => {
        originalHandleChatMessage(msg);
        this.handleMessage(msg);
      };
    }

    // Override handleDecryptedMessage to update React state
    if (originalHandleDecryptedMessage) {
      console.log('✅ Overriding handleDecryptedMessage');
      window.handleDecryptedMessage = (msg, from) => {
        // Call original function FIRST to maintain original behavior and order
        // This ensures browser.js processes messages in the correct order
        try {
          originalHandleDecryptedMessage(msg, from);
        } catch (error) {
          console.error('❌ Error in originalHandleDecryptedMessage:', error);
          return; // Don't update React state if original failed
        }
        
        // Then update React state
        if (msg.type === "CHAT") {
          // Ensure 'from' is set on the message object
          const messageWithFrom = { ...msg, from: from || msg.from };
          this.handleMessage(messageWithFrom);
        } else if (msg.type === "FILE_META") {
          // Only process if we haven't seen this fileId yet
          if (!this.seenFileIds.has(msg.fileId)) {
            // Also check file signature (name+size+from) to catch duplicates with different IDs
            const fromPeer = from || msg.from;
            const fileSignature = `${fromPeer}:${msg.name}:${msg.size}`;
            if (!this.seenFileSignatures.has(fileSignature)) {
              console.log('📁 FILE_META received in adapter:', msg);
              this.handleFileStart({ ...msg, from: fromPeer });
            } else {
              console.log('⚠️ FILE_META already processed (same file, different ID), skipping:', fileSignature, 'fileId:', msg.fileId);
              // Mark this fileId as seen to prevent processing chunks
              this.seenFileIds.add(msg.fileId);
            }
          } else {
            console.log('⚠️ FILE_META already processed, skipping:', msg.fileId);
          }
        } else if (msg.type === "FILE_CHUNK") {
          this.handleFileProgress(msg.fileId);
        } else if (msg.type === "FILE_END") {
          this.handleFileReceived(msg.fileId);
        }
      };
    } else {
      console.warn('⚠️ handleDecryptedMessage not found in window');
    }

    // Hook into file input progress updates for outgoing files
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      const originalOnChange = fileInput.onchange;
      // Remove the original onchange property so it isn't invoked twice
      // (we will call it explicitly from our listener). This prevents
      // duplicate file sends where browser.js would execute the handler
      // once because we call it and again because it remained attached.
      if (originalOnChange) {
        fileInput.onchange = null;
      }

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file && originalOnChange) {
          const tempId = crypto.randomUUID();

          const newOutgoingFile = {
            fileId: tempId,
            name: file.name,
            size: file.size,
            progress: 0
          };

          this.state.outgoingFiles = [...this.state.outgoingFiles, newOutgoingFile];
          this.notifyUpdate();

          // Call original handler once, preserving its `this` context
          try {
            await originalOnChange.call(fileInput, e);
          } catch (err) {
            console.error('Error in original fileInput onchange handler:', err);
          }

          // Track progress for this specific file
          this.watchFileProgress(tempId);
        }
      }, true);
    }

    // Initial peer list update
    setTimeout(() => {
      this.updatePeerList();
      this.notifyUpdate();
    }, 500);
  }

  // Set React state updater
  setStateUpdater(updater) {
    this.updateState = updater;
  }

  // Update peer list from browser.js state
  updatePeerList() {
    // Use exposed variables from window (set by script in index.html)
    if (typeof window === 'undefined' || 
        !window.__meshVaultPeers || 
        !window.__meshVaultPeerIdentities) {
      return;
    }

    const peers = new Map();
    const now = Date.now();
    const PEER_TIMEOUT = 7000;

    try {
      // Update myPeerId if available
      if (window.__meshVaultMyId && !this.state.myPeerId) {
        this.state.myPeerId = window.__meshVaultMyId;
      }

      // Process peers from exposed variables
      for (const [peerId, lastSeen] of window.__meshVaultPeers.entries()) {
        const isOnline = (now - lastSeen) <= PEER_TIMEOUT;
        const identity = window.__meshVaultPeerIdentities.get(peerId);
        const connection = window.__meshVaultConnections?.get(peerId);
        
        let status = 'offline';
        if (isOnline) {
          if (connection?.channel?.readyState === 'open') {
            status = 'connected';
          } else if (connection) {
            status = 'connecting';
          } else {
            status = 'discovered';
          }
        }

        peers.set(peerId, {
          peerId,
          username: identity?.username || peerId.substring(0, 8),
          lastSeen,
          status
        });
      }

      this.state.peers = peers;
      this.notifyUpdate();
    } catch (error) {
      console.error('Error updating peer list:', error);
    }
  }

  // Get current monitoring stats
  getMonitoringStats() {
    return {
      messagesCount: this.state.messages.length,
      peersCount: this.state.peers.size,
      connectedPeersCount: Array.from(this.state.peers.values()).filter(p => p.status === 'connected').length,
      peerDetails: Array.from(this.state.peers.entries()).map(([peerId, peer]) => ({
        peerId,
        username: peer.username,
        status: peer.status,
        lastSeen: peer.lastSeen
      }))
    };
  }

  // Handle incoming chat message
  handleMessage(msg) {
    if (!msg.id || !msg.text) {
      console.warn('⚠️ Invalid message received:', msg);
      return;
    }

    // Check if message already exists
    const exists = this.state.messages.some(m => m.id === msg.id);
    if (exists) {
      console.log('📨 Message already exists, skipping:', msg.id);
      return;
    }

    console.log('📨 Processing new message:', {
      id: msg.id,
      from: msg.from,
      text: msg.text.substring(0, 50) + '...'
    });

    // Get username from exposed variables
    const username = window.__meshVaultPeerIdentities?.get(msg.from)?.username || 
                     window.peerIdentities?.get(msg.from)?.username || 
                     msg.from.substring(0, 8);

    const message = {
      id: msg.id,
      from: msg.from,
      text: msg.text,
      time: msg.time || Date.now(),
      username: username,
      isOwn: msg.from === this.state.myPeerId,
      status: 'delivered' // 'pending', 'sent', 'delivered', 'failed'
    };

    this.state.messages = [...this.state.messages, message];
    console.log('✅ Added message to state. Total messages:', this.state.messages.length);
    this.notifyUpdate();
  }

  // Handle file transfer start
  handleFileStart(fileInfo) {
    // Don't add files from ourselves
    if (fileInfo.from === this.state.myPeerId) {
      console.log('⚠️ Ignoring file from self:', fileInfo.fileId);
      return;
    }
    
    // Check if we've already seen this fileId (prevent duplicates) - do this FIRST
    if (this.seenFileIds.has(fileInfo.fileId)) {
      console.log('⚠️ File ID already seen, skipping duplicate:', fileInfo.fileId);
      return;
    }
    
    // Create a file signature to detect same file sent with different IDs
    const fileSignature = `${fileInfo.from}:${fileInfo.name}:${fileInfo.size}`;
    
    // Check if we've already seen this exact file (same name+size+from) with a different ID
    if (this.seenFileSignatures.has(fileSignature)) {
      console.log('⚠️ Same file already received (different ID), skipping duplicate:', fileSignature, 'fileId:', fileInfo.fileId);
      // Mark this fileId as seen to prevent processing chunks for it
      this.seenFileIds.add(fileInfo.fileId);
      return;
    }
    
    // Check if this file is already in our state array (double-check by fileId)
    const existingIndex = this.state.incomingFiles.findIndex(f => f.fileId === fileInfo.fileId);
    if (existingIndex !== -1) {
      // If it's in state but not in seenFileIds, add it to prevent future duplicates
      this.seenFileIds.add(fileInfo.fileId);
      this.seenFileSignatures.add(fileSignature);
      console.log('⚠️ File already in state, skipping duplicate:', fileInfo.fileId);
      return;
    }
    
    // Also check state by signature (name+size+from) to catch duplicates with different IDs
    const existingBySignature = this.state.incomingFiles.findIndex(f => 
      f.from === fileInfo.from && f.name === fileInfo.name && f.size === fileInfo.size
    );
    if (existingBySignature !== -1) {
      console.log('⚠️ Same file already in state (different ID), skipping duplicate:', fileSignature, 'fileId:', fileInfo.fileId);
      // Mark this fileId as seen to prevent processing chunks for it
      this.seenFileIds.add(fileInfo.fileId);
      this.seenFileSignatures.add(fileSignature);
      return;
    }
    
    console.log('📁 handleFileStart called with:', fileInfo);
    
    // Mark as seen IMMEDIATELY to prevent race conditions with duplicate calls
    this.seenFileIds.add(fileInfo.fileId);
    this.seenFileSignatures.add(fileSignature);
    
    // Add new file to the array
    const newFile = {
      fileId: fileInfo.fileId,
      name: fileInfo.name,
      size: fileInfo.size,
      mime: fileInfo.mime || 'application/octet-stream',
      from: fileInfo.from,
      progress: 0,
      downloadUrl: null
    };
    
    this.state.incomingFiles = [...this.state.incomingFiles, newFile];
    console.log('✅ Added incoming file. Total files:', this.state.incomingFiles.length);
    this.notifyUpdate();
  }

  // Handle file transfer progress (for incoming files only)
  handleFileProgress(fileId) {
    // Find the file in our state
    const fileIndex = this.state.incomingFiles.findIndex(f => f.fileId === fileId);
    if (fileIndex === -1) {
      return;
    }
    
    // Get file entry from browser.js incomingFiles map
    const incomingFiles = window.__meshVaultIncomingFiles;
    if (incomingFiles && fileId) {
      const entry = incomingFiles.get(fileId);
      if (entry && entry.meta) {
        const progress = Math.floor((entry.receivedSize / entry.meta.size) * 100);
        
        // Update progress for this specific file
        const updatedFiles = [...this.state.incomingFiles];
        updatedFiles[fileIndex] = { ...updatedFiles[fileIndex], progress };
        this.state.incomingFiles = updatedFiles;
        this.notifyUpdate();
        return;
      }
    }
  }

  // Watch file progress element for outgoing files
  watchFileProgress(fileId) {
    const progressEl = document.getElementById("progress");
    if (progressEl && fileId) {
      const fileIndex = this.state.outgoingFiles.findIndex(f => f.fileId === fileId);
      if (fileIndex === -1) return;
      
      const interval = setInterval(() => {
        const value = parseInt(progressEl.value) || 0;
        const updatedFiles = [...this.state.outgoingFiles];
        
        if (updatedFiles[fileIndex].progress !== value) {
          updatedFiles[fileIndex] = { ...updatedFiles[fileIndex], progress: value };
          this.state.outgoingFiles = updatedFiles;
          this.notifyUpdate();
        }
        
        if (value === 100) {
          clearInterval(interval);
          // Mark this specific outgoing file as complete, but keep it in the list
          setTimeout(() => {
            const finalFiles = [...this.state.outgoingFiles];
            finalFiles[fileIndex] = { ...finalFiles[fileIndex], progress: 100 };
            this.state.outgoingFiles = finalFiles;
            this.notifyUpdate();
          }, 100);
        }
      }, 100);
    }
  }

  // Handle file received
  handleFileReceived(fileId) {
    console.log('✅ FILE_END received for fileId:', fileId);
    
    // Find the file in our state
    const fileIndex = this.state.incomingFiles.findIndex(f => f.fileId === fileId);
    if (fileIndex === -1) {
      return;
    }
    
    // Get download URL from browser.js
    const incomingFiles = window.__meshVaultIncomingFiles;
    const updatedFiles = [...this.state.incomingFiles];
    
    if (incomingFiles) {
      const entry = incomingFiles.get(fileId);
      if (entry && entry.downloadUrl) {
        updatedFiles[fileIndex] = {
          ...updatedFiles[fileIndex],
          progress: 100,
          downloadUrl: entry.downloadUrl,
          completedTime: Date.now()
        };
      } else {
        updatedFiles[fileIndex] = {
          ...updatedFiles[fileIndex],
          progress: 100,
          completedTime: Date.now()
        };
      }
    } else {
      updatedFiles[fileIndex] = {
        ...updatedFiles[fileIndex],
        progress: 100,
        completedTime: Date.now()
      };
    }
    
    this.state.incomingFiles = updatedFiles;
    this.notifyUpdate();
  }

  // Sync incoming file progress from browser.js (polling safety mechanism)
  syncIncomingFileProgress() {
    const incomingFilesMap = window.__meshVaultIncomingFiles;
    if (!incomingFilesMap || incomingFilesMap.size === 0) {
      // Don't clear completed files - let them persist
      return;
    }

    // ONLY sync progress for files already in our state - never add new files here
    // New files should ONLY come through handleFileStart (via FILE_META event)
    let updated = false;
    const updatedFiles = this.state.incomingFiles.map(file => {
      const entry = incomingFilesMap.get(file.fileId);
      if (entry && entry.meta) {
        const progress = Math.floor((entry.receivedSize / entry.meta.size) * 100);
        
        // Update progress if changed
        if (Math.abs(file.progress - progress) > 1) {
          updated = true;
          return { ...file, progress };
        }
        
        // Also check if download URL is ready
        if (entry.downloadUrl && !file.downloadUrl) {
          updated = true;
          return { ...file, downloadUrl: entry.downloadUrl, progress: 100 };
        }
      }
      return file;
    });
    
    if (updated) {
      this.state.incomingFiles = updatedFiles;
      this.notifyUpdate();
    }
  }

  // Notify React to update
  notifyUpdate() {
    if (this.updateState) {
      this.updateState({ ...this.state });
    }
  }

  // Public API methods for React components

  // Select a peer
  selectPeer(peerId) {
    this.state.selectedPeer = peerId;
    this.notifyUpdate();
  }

  // Send a chat message
  async sendMessage(text) {
    if (!text.trim()) return;

    const msg = {
      type: "CHAT",
      id: crypto.randomUUID(),
      from: this.state.myPeerId,
      time: Date.now(),
      text: text.trim()
    };

    // Add to messages immediately (optimistic update)
    const message = {
      ...msg,
      username: this.state.username || "You",
      isOwn: true,
      status: 'pending' // Mark as pending until sent
    };
    this.state.messages = [...this.state.messages, message];
    this.notifyUpdate();

    // Trigger browser.js send via the send button click
    const msgInput = document.getElementById("msg");
    const sendBtn = document.getElementById("send");
    if (msgInput && sendBtn) {
      msgInput.value = text.trim();
      sendBtn.click();
      msgInput.value = "";

      // Mark as sent after a brief delay
      setTimeout(() => {
        const messageIndex = this.state.messages.findIndex(m => m.id === msg.id);
        if (messageIndex !== -1) {
          this.state.messages[messageIndex].status = 'sent';
          this.notifyUpdate();
        }
      }, 300);
    }
  }

  // Send a file
  async sendFile(file) {
    if (!file || file.size > 20 * 1024 * 1024) {
      throw new Error("File too large (max 20 MB)");
    }

    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      // Create a new FileList with the selected file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      
      // Trigger change event
      const event = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(event);
    }
  }

  // Set username
  setUsername(username) {
    this.state.username = username;
    localStorage.setItem("username", username);
    
    const usernameInput = document.getElementById("username");
    if (usernameInput) {
      usernameInput.value = username;
    }
    
    const saveBtn = document.getElementById("saveIdentity");
    if (saveBtn) {
      saveBtn.click();
    }
    
    this.notifyUpdate();
  }

  // Toggle dark mode
  toggleDarkMode() {
    this.state.isDarkMode = !this.state.isDarkMode;
    localStorage.setItem("darkMode", this.state.isDarkMode.toString());
    document.documentElement.setAttribute('data-theme', this.state.isDarkMode ? 'dark' : 'light');
    this.notifyUpdate();
  }

  // Connect to a peer (manual trigger)
  connectToPeer(peerId) {
    if (window.connectToPeer) {
      window.connectToPeer(peerId);
    }
  }

  // Get current state snapshot
  getState() {
    return { ...this.state };
  }

  // Cleanup memory leaks - called on unload or cleanup
  cleanup() {
    console.log('🧹 Cleaning up BrowserAdapter resources...');
    
    // Revoke all blob URLs to free up memory
    for (const file of this.state.incomingFiles) {
      if (file.downloadUrl) {
        try {
          URL.revokeObjectURL(file.downloadUrl);
          console.log(`♻️ Revoked blob URL for ${file.name}`);
        } catch (e) {
          console.warn(`Error revoking blob URL for ${file.name}:`, e);
        }
      }
    }
    
    // Clear all state
    this.state.messages = [];
    this.state.incomingFiles = [];
    this.state.outgoingFiles = [];
    this.state.peers = new Map();
    
    // Clear tracking sets
    this.seenFileIds.clear();
    this.seenFileSignatures.clear();
    
    console.log('✅ BrowserAdapter cleanup complete');
  }
}

// Export singleton instance
export const browserAdapter = new BrowserAdapter();

// Cleanup on page unload to prevent memory leaks
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    browserAdapter.cleanup();
  });
}
