//   WebRTC DataChannels for peer-to-peer messaging
//   WebSocket signaling for peer discovery
//   AES-GCM encryption for message security
//   Chunked file transfer with dynamic sizing
//   Message batching for performance
 

/* ========= UTIL ========= */
const log = (msg) => {
  const logElement = document.getElementById("log");
  logElement.textContent += msg + "\n";
  
  // Limit log size to prevent memory bloat - keep only last 5000 lines
  const lines = logElement.textContent.split('\n');
  if (lines.length > 5000) {
    logElement.textContent = lines.slice(-5000).join('\n');
  }
};

// Dynamic chunk sizing based on network conditions
let CHUNK_SIZE = 16 * 1024; // Start at 16KB
const MIN_CHUNK_SIZE = 4 * 1024;  // Don't go below 4KB
const MAX_CHUNK_SIZE = 256 * 1024; // Don't exceed 256KB
let recentTransferTimes = []; // Track recent transfer speeds

// Update chunk size based on performance
function updateChunkSize(transferTimeMs, chunkSizeBytes) {
  // Calculate transfer speed (bytes per second)
  const speed = (chunkSizeBytes / (transferTimeMs || 1)) * 1000;
  recentTransferTimes.push(speed);
  
  // Keep only last 10 measurements
  if (recentTransferTimes.length > 10) {
    recentTransferTimes.shift();
  }

  const avgSpeed = recentTransferTimes.reduce((a, b) => a + b, 0) / recentTransferTimes.length;
  
  // If average speed is good (>1MB/s), increase chunk size
  // If average speed is slow (<500KB/s), decrease chunk size
  if (avgSpeed > 1000000 && CHUNK_SIZE < MAX_CHUNK_SIZE) {
    CHUNK_SIZE = Math.min(CHUNK_SIZE * 1.5, MAX_CHUNK_SIZE);
    log(`⚡ Network fast, increased chunk size to ${Math.floor(CHUNK_SIZE / 1024)}KB`);
  } else if (avgSpeed < 500000 && CHUNK_SIZE > MIN_CHUNK_SIZE) {
    CHUNK_SIZE = Math.max(CHUNK_SIZE / 1.5, MIN_CHUNK_SIZE);
    log(`🐢 Network slow, decreased chunk size to ${Math.floor(CHUNK_SIZE / 1024)}KB`);
  }
}

// Message batching system
const messageQueue = new Map(); // peerId -> { messages: [], timer, count }
const BATCH_INTERVAL = 100; // Batch messages sent within 100ms
const MAX_BATCH_SIZE = 10; // Don't batch more than 10 messages together

function flushBatch(peerId) {
  const batch = messageQueue.get(peerId);
  if (!batch || batch.messages.length === 0) return;

  // Create a batch message
  const batchMsg = {
    type: "MESSAGE_BATCH",
    messages: batch.messages
  };

  // Send as single encrypted message
  sendToPeer(peerId, JSON.stringify(batchMsg));
  batch.messages = [];
  batch.timer = null;

  log(`📦 Flushed batch of ${batchMsg.messages.length} messages to ${peerId}`);
}

function queueMessage(peerId, message) {
  if (!messageQueue.has(peerId)) {
    messageQueue.set(peerId, { messages: [], timer: null, count: 0 });
  }

  const batch = messageQueue.get(peerId);
  batch.messages.push(message);
  batch.count++;

  // Flush immediately if batch is full
  if (batch.messages.length >= MAX_BATCH_SIZE) {
    if (batch.timer) clearTimeout(batch.timer);
    flushBatch(peerId);
    return;
  }

  // Set timer if not already set
  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      flushBatch(peerId);
    }, BATCH_INTERVAL);
  }
}

const PEER_TIMEOUT = 7000;
const RECONNECT_INTERVAL = 5000; // Try to reconnect to offline peers every 5s
const MAX_RECONNECT_ATTEMPTS = 3; // Max reconnection attempts before giving up

// Fixed key for testing (not E2EE)
const fixedKeyData = new Uint8Array(32);
for (let i = 0; i < 32; i++) fixedKeyData[i] = i % 256;

// Connection state tracking for stability
const connectionStats = new Map(); // peerId -> { attempts, lastAttempt, failures, successfulConnections }
const channelErrorHandlers = new Map(); // Track channel error handlers for cleanup

// Base64 utilities
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Encryption utilities
async function encryptData(data, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let encrypted;
  if (typeof data === 'string') {
    encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      new TextEncoder().encode(data)
    );
  } else {
    encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      data
    );
  }
  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encrypted)
  };
}

async function decryptData(encrypted, aesKey) {
  const iv = base64ToArrayBuffer(encrypted.iv);
  const data = base64ToArrayBuffer(encrypted.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data
  );
  return decrypted;
}

/* ========= PEER ID ========= */
let myId = localStorage.getItem("peerId");
if (!myId) {
  myId = crypto.randomUUID();
  localStorage.setItem("peerId", myId);
}
log(`My peerId: ${myId}`);

/* ========= IDENTITY ========= */
let username = localStorage.getItem("username");
const peerIdentities = new Map(); // peerId -> { username }
const peerKeys = new Map(); // peerId -> { keyPair, sharedKey }

const usernameInput = document.getElementById("username");
if (username) usernameInput.value = username;

document.getElementById("saveIdentity").onclick = () => {
  const val = usernameInput.value.trim();
  if (!val) return alert("Username required");
  username = val;
  localStorage.setItem("username", username);
  log(`👤 Username set: ${username}`);
};

// Disaster mode toggle
document.getElementById("toggleDisasterMode").onclick = () => {
  disasterModeEnabled = !disasterModeEnabled;
  localStorage.setItem("disasterMode", disasterModeEnabled.toString());
  window.__meshVaultDisasterMode = disasterModeEnabled;
  
  if (disasterModeEnabled) {
    log('🚨 DISASTER MODE ENABLED - Messages will be queued when offline');
  } else {
    log('✅ Disaster mode disabled');
  }
};

async function deviceHash(peerId, name) {
  const data = new TextEncoder().encode(peerId + name);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendIdentity(channel) {
  if (!username) return;
  channel.send(JSON.stringify({
    type: "IDENTITY",
    peerId: myId,
    username,
    hash: await deviceHash(myId, username)
  }));
}

async function verifyIdentity(msg) {
  const expected = await deviceHash(msg.peerId, msg.username);
  if (expected === msg.hash) {
    peerIdentities.set(msg.peerId, { username: msg.username });
    log(`✅ Verified identity: ${msg.username} (${msg.peerId})`);
  } else {
    log(`⚠️ Identity verification failed for ${msg.peerId}`);
  }
}

/* ========= SIGNALING ========= */
let wsPort = null;
let ws = null;
let helloInterval = null; // Track the HELLO interval to prevent duplicates

// Initialize WebSocket connection
function initializeWebSocket() {
  // Prompt for WebSocket port
  try {
    wsPort = prompt("Enter WS port:");
    if (!wsPort || !wsPort.trim()) {
      alert("WebSocket port is required!");
      throw new Error("Port required");
    }
    wsPort = wsPort.trim();
  } catch (e) {
    console.error("No port provided:", e);
    log("❌ WebSocket port is required to connect");
    return;
  }

  try {
    ws = new WebSocket(`ws://localhost:${wsPort}`);
    initializeWebSocket_SetupHandlers(ws);
  } catch (e) {
    console.error("WebSocket creation failed:", e);
    log("❌ Failed to connect to signaling server");
    return;
  }
}

// Setup WebSocket handlers (used for both initial and reconnection)
function initializeWebSocket_SetupHandlers(socket) {
  socket.onopen = () => {
    log("🌐 Connected to signaling node");
    
    // Clear any previous interval
    if (helloInterval) clearInterval(helloInterval);
    
    // Send initial HELLO
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "HELLO", from: myId }));
    }
    
    // Send HELLO every 3 seconds to keep ourselves in peer discovery
    helloInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "HELLO", from: myId }));
      }
    }, 3000);
  };

  socket.onerror = (error) => {
    log(`❌ WebSocket error: ${error.type}`);
    console.error("WebSocket error:", error);
  };

  socket.onclose = () => {
    log("🔌 WebSocket disconnected - attempting to reconnect...");
    if (helloInterval) clearInterval(helloInterval);
    setTimeout(() => {
      try {
        ws = new WebSocket(`ws://localhost:${wsPort}`);
        log("🔄 Reconnection attempted");
        // Reuse the same initialization handlers on the new connection
        initializeWebSocket_SetupHandlers(ws);
      } catch (e) {
        console.error("Reconnection failed:", e);
      }
    }, 5000);
  };

  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.from === myId) return;

    if (msg.type === "HELLO") {
      peers.set(msg.from, Date.now());
      offlinePeers.delete(msg.from);
      renderPeers();
      connectToPeer(msg.from);
      return;
    }

    if (msg.to && msg.to !== myId) return;

    if (msg.type === "OFFER") {
      if (connections.has(msg.from)) return; // Already connecting

      // Generate ECDH key pair
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
      );
      peerKeys.set(msg.from, { keyPair, keyExchanged: false });

      const pc = createPeerConnection(msg.from);
      connections.set(msg.from, { pc, channel: null });

      if (pc.signalingState === 'stable') {
        await pc.setRemoteDescription(msg.data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "ANSWER",
            from: myId,
            to: msg.from,
            data: answer
          }));
        }
      }
    }

    if (msg.type === "ANSWER") {
      const pc = connections.get(msg.from)?.pc;
      if (pc && (pc.signalingState === 'have-local-offer' || pc.signalingState === 'have-local-pranswer')) {
        await pc.setRemoteDescription(msg.data);
      }
    }

    if (msg.type === "ICE") {
      const pc = connections.get(msg.from)?.pc;
      if (pc && pc.signalingState !== 'closed') {
        await pc.addIceCandidate(msg.data);
      }
    }
  };
}

/* ========= STATE ========= */
const peers = new Map();       // peerId -> lastSeen
const connections = new Map(); // peerId -> { pc, channel }
const offlinePeers = new Set();
const seenMessages = new Set();
const pendingMessages = new Map();

// Disaster mode: Store all messages/files locally when offline
let disasterModeEnabled = localStorage.getItem("disasterMode") === "true";
const offlineQueue = {
  messages: [],    // Messages to send when online
  files: [],       // File metadata waiting for peers
  ready: false     // Can we send yet?
};

// Track network connectivity
let isOnline = navigator.onLine;

// Listen for online/offline events
window.addEventListener('online', () => {
  isOnline = true;
  log('🌐 Network restored!');
  
  // In disaster mode, try to send queued items
  if (disasterModeEnabled && offlineQueue.messages.length > 0) {
    log(`📤 Flushing ${offlineQueue.messages.length} queued messages...`);
    for (const msg of offlineQueue.messages) {
      forwardMessage(msg);
    }
    offlineQueue.messages = [];
  }
});

window.addEventListener('offline', () => {
  isOnline = false;
  log('⚠️ Network lost - entering offline mode');
  
  if (disasterModeEnabled) {
    log('💾 Messages will be queued and sent when network returns');
  }
});

const peerList = document.getElementById("peers");

// Expose variables to window for React adapter
if (typeof window !== 'undefined') {
  window.__meshVaultPeers = peers;
  window.__meshVaultPeerIdentities = peerIdentities;
  window.__meshVaultConnections = connections;
  window.__meshVaultMyId = myId;
  window.__meshVaultDisasterMode = disasterModeEnabled;
}

/* ========= FILE STATE ========= */
// let incomingFile = null;
// let incomingChunks = [];
// let receivedSize = 0;

/* ========= FILE STATE ========= */
const incomingFiles = new Map();

// Expose incomingFiles to window for React adapter
if (typeof window !== 'undefined') {
  window.__meshVaultIncomingFiles = incomingFiles;
}


/* ========= UI ========= */
function renderPeers() {
  peerList.innerHTML = "";
  for (const id of peers.keys()) {
    const name = peerIdentities.get(id)?.username || id;
    const li = document.createElement("li");
    li.textContent = name;
    peerList.appendChild(li);
  }
}

/* ========= CLEANUP ========= */
// Cleanup offline peers and blob URLs
setInterval(() => {
  const now = Date.now();
  
  // Check for offline peers
  for (const [peerId, lastSeen] of peers.entries()) {
    if (now - lastSeen > PEER_TIMEOUT && !offlinePeers.has(peerId)) {
      offlinePeers.add(peerId);
      closeConnection(peerId);
      log(`🔴 Peer offline: ${peerId}`);
    }
  }
  
  // Cleanup old blob URLs to prevent memory leaks
  for (const [fileId, entry] of incomingFiles.entries()) {
    if (entry.completed && entry.downloadUrl) {
      // If entry has been marked complete for over 10 seconds, cleanup the blob URL
      const completedTime = entry.completedTime || now;
      if (now - completedTime > 10000) {
        try {
          URL.revokeObjectURL(entry.downloadUrl);
          log(`♻️ Cleaned up blob URL for file ${fileId}`);
        } catch (e) {
          console.warn(`Error revoking blob URL for ${fileId}:`, e);
        }
        incomingFiles.delete(fileId);
      }
    }
  }
}, 3000);

/* ========= WEBRTC ========= */
function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
  });

  // Track connection state changes
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      log(`⚠️ Connection ${state} with ${peerId}`);
      // Trigger reconnection attempt
      if (state === 'failed') {
        scheduleReconnect(peerId);
      }
    }
  };

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    if (state === 'disconnected' || state === 'failed') {
      log(`📡 ICE connection ${state} with ${peerId}`);
      if (state === 'failed') {
        scheduleReconnect(peerId);
      }
    }
  };

  pc.onicecandidateerror = (e) => {
    console.error(`ICE candidate error for ${peerId}:`, e.errorCode, e.errorText);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "ICE",
        from: myId,
        to: peerId,
        data: e.candidate
      }));
    }
  };

  pc.ondatachannel = (e) => {
    const channel = e.channel;
    setupChannelHandlers(channel, peerId);
    connections.get(peerId).channel = channel;
  };

  return pc;
}

// Setup channel handlers with error handling
function setupChannelHandlers(channel, peerId) {
  // Remove old handlers if they exist
  if (channelErrorHandlers.has(peerId)) {
    const oldHandlers = channelErrorHandlers.get(peerId);
    channel.removeEventListener('error', oldHandlers.error);
    channel.removeEventListener('close', oldHandlers.close);
  }

  const errorHandler = (e) => {
    log(`❌ Channel error with ${peerId}: ${e.error}`);
    console.error("Channel error:", e);
  };

  const closeHandler = () => {
    log(`🔌 Channel closed with ${peerId}`);
    scheduleReconnect(peerId);
  };

  channel.addEventListener('error', errorHandler);
  channel.addEventListener('close', closeHandler);
  
  // Store handlers for cleanup
  channelErrorHandlers.set(peerId, { error: errorHandler, close: closeHandler });

  channel.onmessage = onMessage;
  
  channel.onopen = async () => {
    log(`✅ Channel open with ${peerId}`);
    // Reset connection stats on successful connection
    if (connectionStats.has(peerId)) {
      const stats = connectionStats.get(peerId);
      stats.successfulConnections++;
      stats.attempts = 0;
      stats.failures = 0;
    }
    await sendIdentity(channel);
    // Send public key for key exchange
    const keyData = peerKeys.get(peerId);
    if (keyData) {
      const exported = await crypto.subtle.exportKey("spki", keyData.keyPair.publicKey);
      channel.send(JSON.stringify({ type: "KEY_EXCHANGE", from: myId, publicKey: arrayBufferToBase64(exported) }));
    }
    channel.send(JSON.stringify({ type: "SYNC_REQUEST", from: myId }));
  };
}

async function connectToPeer(peerId) {
  // Don't reconnect if already connected
  const existingConn = connections.get(peerId);
  if (existingConn?.channel?.readyState === 'open') {
    console.log(`Already connected to ${peerId}`);
    return;
  }

  // Check reconnection limits
  if (!connectionStats.has(peerId)) {
    connectionStats.set(peerId, { attempts: 0, lastAttempt: 0, failures: 0, successfulConnections: 0 });
  }

  const stats = connectionStats.get(peerId);
  const now = Date.now();
  
  // Check if too many reconnection attempts in short time
  if (stats.attempts >= MAX_RECONNECT_ATTEMPTS && (now - stats.lastAttempt) < RECONNECT_INTERVAL * 2) {
    console.log(`⚠️ Too many reconnection attempts for ${peerId}, backing off...`);
    return;
  }

  log(`🔗 Connecting to ${peerId}`);
  stats.attempts++;
  stats.lastAttempt = now;

  // Generate ECDH key pair if not already done
  if (!peerKeys.has(peerId)) {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"]
    );
    peerKeys.set(peerId, { keyPair, keyExchanged: false });
  }

  const pc = createPeerConnection(peerId);
  const channel = pc.createDataChannel("chat");

  setupChannelHandlers(channel, peerId);
  connections.set(peerId, { pc, channel });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "OFFER",
        from: myId,
        to: peerId,
        data: offer
      }));
    }
  } catch (error) {
    console.error(`Error creating offer for ${peerId}:`, error);
    stats.failures++;
    closeConnection(peerId);
  }
}

// Schedule a reconnection attempt with exponential backoff
let reconnectSchedules = new Map();
function scheduleReconnect(peerId) {
  // Clear existing schedule if any
  if (reconnectSchedules.has(peerId)) {
    clearTimeout(reconnectSchedules.get(peerId));
  }

  const stats = connectionStats.get(peerId) || { attempts: 0, failures: 0, lastAttempt: 0, successfulConnections: 0 };
  const backoffMs = Math.min(1000 * Math.pow(2, stats.failures), 30000); // Exponential backoff, max 30s
  
  log(`⏳ Scheduling reconnect to ${peerId} in ${backoffMs}ms`);
  
  const timeoutId = setTimeout(() => {
    if (peers.has(peerId) && !offlinePeers.has(peerId)) {
      connectToPeer(peerId);
    }
    reconnectSchedules.delete(peerId);
  }, backoffMs);

  reconnectSchedules.set(peerId, timeoutId);
}

function closeConnection(peerId) {
  const conn = connections.get(peerId);
  if (conn) {
    // Close channel handlers
    if (channelErrorHandlers.has(peerId)) {
      const handlers = channelErrorHandlers.get(peerId);
      if (conn.channel) {
        conn.channel.removeEventListener('error', handlers.error);
        conn.channel.removeEventListener('close', handlers.close);
      }
      channelErrorHandlers.delete(peerId);
    }
    
    // Close peer connection
    conn.pc.close();
    connections.delete(peerId);
  }
  
  // Clean up any scheduled reconnects
  if (reconnectSchedules.has(peerId)) {
    clearTimeout(reconnectSchedules.get(peerId));
    reconnectSchedules.delete(peerId);
  }
}

/* ========= MESSAGE HANDLING ========= */
async function onMessage(e) {
  if (typeof e.data === "string") {
    const msg = JSON.parse(e.data);

    if (msg.type === "IDENTITY") {
      verifyIdentity(msg);
      renderPeers();
      return;
    }

    if (msg.type === "SYNC_REQUEST") {
      flushPending(msg.from);
      return;
    }

    // Handle message batches
    if (msg.type === "MESSAGE_BATCH") {
      console.log(`📦 Received batch of ${msg.messages.length} messages`);
      for (const innerMsg of msg.messages) {
        await handleSingleMessage(innerMsg);
      }
      return;
    }

    // Handle regular messages
    await handleSingleMessage(msg);
  }
}

async function handleSingleMessage(msg) {
  if (msg.type === "IDENTITY") {
    verifyIdentity(msg);
    renderPeers();
    return;
  }

  if (msg.type === "SYNC_REQUEST") {
    flushPending(msg.from);
    return;
  }

  if (msg.type === "KEY_EXCHANGE") {
    const peerPublicKeyData = base64ToArrayBuffer(msg.publicKey);
    const peerPublicKey = await crypto.subtle.importKey(
      "spki",
      peerPublicKeyData,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    const keyData = peerKeys.get(msg.from);
    if (keyData) {
      // Use fixed key for testing
      if (!window.fixedKey) {
        window.fixedKey = await crypto.subtle.importKey("raw", fixedKeyData, {name: "AES-GCM"}, false, ["encrypt", "decrypt"]);
      }
      keyData.sharedKey = window.fixedKey;
      keyData.keyExchanged = true;
      log(`🔑 Key exchanged with ${msg.from}`);
      // Flush any pending raw data
      flushPending(msg.from);
    }
    return;
  }

  if (msg.type === "ENCRYPTED") {
    const keyData = peerKeys.get(msg.from);
    if (keyData && keyData.sharedKey) {
      console.log(`🔓 Decrypting message from ${msg.from}`);
      try {
        const decrypted = await decryptData(msg, keyData.sharedKey);
        const decryptedStr = new TextDecoder().decode(decrypted);
        const innerMsg = JSON.parse(decryptedStr);
        handleDecryptedMessage(innerMsg, msg.from);
      } catch (e) {
        console.error("Decryption or parsing failed:", e);
      }
    } else {
      console.log(`⚠️ No key to decrypt from ${msg.from}`);
    }
    return;
  }

  handleChatMessage(msg);
}

/* ========= DECRYPTED MESSAGE HANDLING ========= */
// function handleDecryptedMessage(msg, from) {
//   if (msg.type === "CHAT") {
//     handleChatMessage(msg);
//     return;
//   }

//   if (msg.type === "FILE_META") {
//     incomingFile = { ...msg, from };
//     incomingChunks = [];
//     receivedSize = 0;
//     log(`📁 Receiving file: ${msg.name}`);
//     return;
//   }

//   if (msg.type === "FILE_CHUNK") {
//     const chunkBuffer = base64ToArrayBuffer(msg.data);
//     incomingChunks.push(new Uint8Array(chunkBuffer));
//     receivedSize += chunkBuffer.byteLength;
//     document.getElementById("progress").value =
//       Math.floor((receivedSize / incomingFile.size) * 100);
//     return;
//   }

//   if (msg.type === "FILE_END") {
//     const blob = new Blob(incomingChunks, { type: incomingFile.mime });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = incomingFile.name;
//     a.textContent = `⬇ Download ${incomingFile.name}`;
//     document.body.appendChild(a);
//     log(`✅ File received: ${incomingFile.name}`);
//     document.getElementById("progress").value = 0;
//     incomingFile = null;
//     incomingChunks = [];
//     return;
//   }
  
// }

function handleDecryptedMessage(msg, from) {

  /* ---------- CHAT ---------- */
  if (msg.type === "CHAT") {
    handleChatMessage(msg);
    return;
  }

  /* ---------- FILE META ---------- */
  if (msg.type === "FILE_META") {
    incomingFiles.set(msg.fileId, {
      meta: msg,
      chunks: [],
      receivedSize: 0,
      from
    });

    log(`📁 Receiving file: ${msg.name}`);
    return;
  }

  /* ---------- FILE CHUNK ---------- */
  if (msg.type === "FILE_CHUNK") {
    const entry = incomingFiles.get(msg.fileId);
    if (!entry) {
      console.warn("⚠️ FILE_CHUNK without META, skipped");
      return;
    }

    const chunkBuffer = base64ToArrayBuffer(msg.data);
    entry.chunks.push(new Uint8Array(chunkBuffer));
    entry.receivedSize += chunkBuffer.byteLength;

    document.getElementById("progress").value =
      Math.floor((entry.receivedSize / entry.meta.size) * 100);
    return;
  }

  /* ---------- FILE END ---------- */
  if (msg.type === "FILE_END") {
    const entry = incomingFiles.get(msg.fileId);
    if (!entry) {
      console.warn("⚠️ FILE_END without META, ignored");
      return;
    }

    // File received - don't create download link here, let React UI handle it
    // The browserAdapter will handle the UI update
    log(`✅ File received: ${entry.meta.name} (handled by React UI)`);
    
    // Store the blob URL in the entry for React to use
    const blob = new Blob(entry.chunks, { type: entry.meta.mime });
    entry.downloadUrl = URL.createObjectURL(blob);
    entry.downloadReady = true;
    // Mark for cleanup but don't delete yet - React needs to get the downloadUrl first
    entry.completed = true;
    entry.completedTime = Date.now(); // Track when file was completed for cleanup scheduling

    document.getElementById("progress").value = 0;
    // Don't delete immediately - let React retrieve the downloadUrl first
    // Cleanup will happen automatically in the interval cleanup function after 10 seconds
    return;
  }
}

// Expose functions to window for React adapter
if (typeof window !== 'undefined') {
  window.handleDecryptedMessage = handleDecryptedMessage;
  window.handleChatMessage = handleChatMessage;
}

// Send encrypted data to a specific peer
async function sendToPeer(peerId, data) {
  const keyData = peerKeys.get(peerId);
  if (!keyData || !keyData.keyExchanged) {
    console.log(`🔓 No key for ${peerId}, storing for later`);
    // Store for later
    const stored = JSON.parse(localStorage.getItem("pending_" + peerId) || "[]");
    stored.push(data);
    localStorage.setItem("pending_" + peerId, JSON.stringify(stored));
    return;
  }

  const encrypted = await encryptData(data, keyData.sharedKey);
  console.log(`🔒 Encrypted message for ${peerId}`);
  const channel = connections.get(peerId)?.channel;
  if (channel && channel.readyState === "open") {
    channel.send(JSON.stringify({
      type: "ENCRYPTED",
      from: myId,
      ...encrypted
    }));
    console.log(`📤 Sent encrypted message to ${peerId}`);
  } else {
    // Store for later
    storeForLater(peerId, { type: "ENCRYPTED", from: myId, ...encrypted });
  }
}

/* ========= CHAT ========= */
function handleChatMessage(msg) {
  if (seenMessages.has(msg.id)) return;
  seenMessages.add(msg.id);

  const time = new Date(msg.time).toLocaleTimeString();
  const name = peerIdentities.get(msg.from)?.username || msg.from;
  log(`[${time}] ${name}: ${msg.text}`);
  console.log(`📨 Received message from ${msg.from}: ${msg.text}`);

  forwardMessage(msg);
}

function forwardMessage(msg) {
  // In disaster mode, queue if offline
  if (disasterModeEnabled && !isOnline) {
    console.log('💾 Offline - queuing message:', msg.id);
    offlineQueue.messages.push(msg);
    return;
  }

  const data = JSON.stringify(msg);
  for (const peerId of peers.keys()) {
    if (peerId === msg.from) continue;
    sendToPeer(peerId, data);
  }
}

/* ========= STORE & FORWARD ========= */
function storeForLater(peerId, msg) {
  if (!pendingMessages.has(peerId)) {
    pendingMessages.set(peerId, []);
  }
  pendingMessages.get(peerId).push(msg);
}

async function flushPending(peerId) {
  // Load stored messages from localStorage
  const stored = JSON.parse(localStorage.getItem("pending_" + peerId) || "[]");
  if (stored.length > 0) {
    console.log(`📤 Sending ${stored.length} stored messages to ${peerId}`);
    for (const data of stored) {
      await sendToPeer(peerId, data);
    }
    localStorage.removeItem("pending_" + peerId);
  }

  // Also flush in-memory pending
  const queue = pendingMessages.get(peerId);
  const channel = connections.get(peerId)?.channel;
  if (!queue || !channel || channel.readyState !== "open") return;

  for (const m of queue) {
    if (m.type === 'raw_data') {
      // Should not happen now
    } else {
      // Already encrypted
      channel.send(JSON.stringify(m));
    }
  }
  pendingMessages.delete(peerId);
  log(`📤 Delivered stored messages to ${peerId}`);
}

/* ========= SEND CHAT ========= */
document.getElementById("send").onclick = () => {
  const text = document.getElementById("msg").value;
  const msg = {
    type: "CHAT",
    id: crypto.randomUUID(),
    from: myId,
    time: Date.now(),
    text
  };
  seenMessages.add(msg.id);
  forwardMessage(msg);
  log(`[${new Date(msg.time).toLocaleTimeString()}] You: ${text}`);
};

/* ========= FILE SEND ========= */
// document.getElementById("fileInput").onchange = async (e) => {
//   const file = e.target.files[0];
//   if (!file || file.size > 20 * 1024 * 1024) {
//     alert("File too large (max 20 MB)");
//     return;
//   }

//   const buffer = await file.arrayBuffer();

//   broadcast(JSON.stringify({
//     type: "FILE_META",
//     name: file.name,
//     size: file.size,
//     mime: file.type
//   }));

//   let offset = 0;
//   while (offset < buffer.byteLength) {
//     const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
//     const chunkData = arrayBufferToBase64(chunk);
//     broadcast(JSON.stringify({
//       type: "FILE_CHUNK",
//       data: chunkData
//     }));
//     offset += CHUNK_SIZE;
//     document.getElementById("progress").value =
//       Math.floor((offset / buffer.byteLength) * 100);
//     await new Promise(r => setTimeout(r, 1));
//   }

//   broadcast(JSON.stringify({ type: "FILE_END" }));
// };

document.getElementById("fileInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || file.size > 20 * 1024 * 1024) {
    alert("File too large (max 20 MB)");
    return;
  }

  const buffer = await file.arrayBuffer();
  const fileId = crypto.randomUUID();
  const startTime = Date.now();

  // Send META first
  broadcast(JSON.stringify({
    type: "FILE_META",
    fileId,
    name: file.name,
    size: file.size,
    mime: file.type
  }));

  let offset = 0;
  let chunksSent = 0;
  
  while (offset < buffer.byteLength) {
    const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
    const chunkTime = Date.now();

    broadcast(JSON.stringify({
      type: "FILE_CHUNK",
      fileId,
      data: arrayBufferToBase64(chunk)
    }));

    offset += CHUNK_SIZE;
    chunksSent++;
    
    document.getElementById("progress").value =
      Math.floor((offset / buffer.byteLength) * 100);

    // Update chunk size based on transfer speed
    const elapsed = Date.now() - chunkTime;
    if (elapsed > 0) {
      updateChunkSize(elapsed, chunk.byteLength);
    }

    await new Promise(r => setTimeout(r, 1));
  }

  broadcast(JSON.stringify({
    type: "FILE_END",
    fileId
  }));

  const totalTime = Date.now() - startTime;
  const avgSpeed = (file.size / (totalTime || 1)) * 1000; // bytes per second
  log(`📤 File sent: ${file.name} (${file.size} bytes in ${Math.floor(totalTime / 1000)}s, ${Math.floor(avgSpeed / 1024)}KB/s)`);

  document.getElementById("progress").value = 0;
};

function broadcast(data) {
  // For regular messages (CHAT), use batching for better performance
  const msg = JSON.parse(data);
  
  if (msg.type === "CHAT") {
    // Use message batching
    for (const peerId of peers.keys()) {
      queueMessage(peerId, msg);
    }
  } else if (msg.type === "FILE_META" || msg.type === "FILE_CHUNK" || msg.type === "FILE_END") {
    // FILES MUST BE FORWARDED through mesh topology like messages
    // First, send to all directly connected peers
    for (const peerId of peers.keys()) {
      sendToPeer(peerId, data);
    }
    // Then relay through mesh: add 'from' field and forward to prevent loops
    // This enables A->C file transfer through B in mesh topology
    if (!msg.from) {
      msg.from = myId;
      forwardMessage(msg);
    }
  } else {
    // For other messages (identity, etc.), send immediately
    for (const peerId of peers.keys()) {
      sendToPeer(peerId, data);
    }
  }
}

// Send via WebSocket if available
function sendViaWebSocket(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.warn("⚠️ WebSocket not connected, message queued");
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM ready, initializing WebSocket...');
    initializeWebSocket();
  });
} else {
  // DOM already loaded
  console.log('🚀 DOM already loaded, initializing WebSocket...');
  initializeWebSocket();
}
