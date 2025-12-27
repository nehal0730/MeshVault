/* ========= UTIL ========= */
const log = (msg) => {
  document.getElementById("log").textContent += msg + "\n";
};

const CHUNK_SIZE = 16 * 1024;
const PEER_TIMEOUT = 7000;

// Fixed key for testing (not E2EE)
const fixedKeyData = new Uint8Array(32);
for (let i = 0; i < 32; i++) fixedKeyData[i] = i % 256;

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
// Prompt for port immediately when script loads - always ask (don't cache)
const wsPort = prompt("Enter WS port:");
if (!wsPort) {
  console.error("No WebSocket port provided. Connection will fail.");
  throw new Error("WebSocket port required");
}
const ws = new WebSocket(`ws://localhost:${wsPort}`);

ws.onopen = () => {
  log("🌐 Connected to signaling node");
  setInterval(() => {
    ws.send(JSON.stringify({ type: "HELLO", from: myId }));
  }, 3000);
};

/* ========= STATE ========= */
const peers = new Map();       // peerId -> lastSeen
const connections = new Map(); // peerId -> { pc, channel }
const offlinePeers = new Set();
const seenMessages = new Set();
const pendingMessages = new Map();

// Expose to window for React adapter (non-invasive, just makes variables accessible)
if (typeof window !== 'undefined') {
  window.__meshVaultPeers = peers;
  window.__meshVaultPeerIdentities = peerIdentities;
  window.__meshVaultConnections = connections;
  window.__meshVaultMyId = myId;
}

const peerList = document.getElementById("peers");

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
setInterval(() => {
  const now = Date.now();
  for (const [peerId, lastSeen] of peers.entries()) {
    if (now - lastSeen > PEER_TIMEOUT && !offlinePeers.has(peerId)) {
      offlinePeers.add(peerId);
      closeConnection(peerId);
      log(`🔴 Peer offline: ${peerId}`);
    }
  }
}, 3000);

/* ========= WEBRTC ========= */
function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection();

  pc.onicecandidate = (e) => {
    if (e.candidate) {
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
    channel.onmessage = onMessage;
    channel.onopen = async () => {
      log(`✅ Channel open with ${peerId}`);
      await sendIdentity(channel);
      // Send public key for key exchange
      const keyData = peerKeys.get(peerId);
      if (keyData) {
        const exported = await crypto.subtle.exportKey("spki", keyData.keyPair.publicKey);
        channel.send(JSON.stringify({ type: "KEY_EXCHANGE", from: myId, publicKey: arrayBufferToBase64(exported) }));
      }
      channel.send(JSON.stringify({ type: "SYNC_REQUEST", from: myId }));
    };
    connections.get(peerId).channel = channel;
  };

  return pc;
}

async function connectToPeer(peerId) {
  if (connections.has(peerId)) return;

  log(`🔗 Connecting to ${peerId}`);

  // Generate ECDH key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
  peerKeys.set(peerId, { keyPair, keyExchanged: false });

  const pc = createPeerConnection(peerId);
  const channel = pc.createDataChannel("chat");

  channel.onmessage = onMessage;
  channel.onopen = async () => {
    log(`✅ Channel open with ${peerId}`);
    await sendIdentity(channel);
    // Send public key for key exchange
    const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    channel.send(JSON.stringify({ type: "KEY_EXCHANGE", from: myId, publicKey: arrayBufferToBase64(exported) }));
    channel.send(JSON.stringify({ type: "SYNC_REQUEST", from: myId }));
  };

  connections.set(peerId, { pc, channel });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: "OFFER",
    from: myId,
    to: peerId,
    data: offer
  }));
}

function closeConnection(peerId) {
  const conn = connections.get(peerId);
  if (conn) {
    conn.pc.close();
    connections.delete(peerId);
  }
}

/* ========= SIGNAL HANDLING ========= */
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

      ws.send(JSON.stringify({
        type: "ANSWER",
        from: myId,
        to: msg.from,
        data: answer
      }));
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
    return;
  }

  // No binary handling, all data is encrypted strings
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

    document.getElementById("progress").value = 0;
    // Don't delete immediately - let React retrieve the downloadUrl first
    // Clean up after a delay to allow React to fetch it
    setTimeout(() => {
      const entryToDelete = incomingFiles.get(msg.fileId);
      if (entryToDelete && entryToDelete.completed) {
        incomingFiles.delete(msg.fileId);
      }
    }, 5000);
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

  // Send META first
  broadcast(JSON.stringify({
    type: "FILE_META",
    fileId,
    name: file.name,
    size: file.size,
    mime: file.type
  }));

  let offset = 0;
  while (offset < buffer.byteLength) {
    const chunk = buffer.slice(offset, offset + CHUNK_SIZE);

    broadcast(JSON.stringify({
      type: "FILE_CHUNK",
      fileId,
      data: arrayBufferToBase64(chunk)
    }));

    offset += CHUNK_SIZE;
    document.getElementById("progress").value =
      Math.floor((offset / buffer.byteLength) * 100);

    await new Promise(r => setTimeout(r, 1));
  }

  broadcast(JSON.stringify({
    type: "FILE_END",
    fileId
  }));

  document.getElementById("progress").value = 0;
};

function broadcast(data) {
  for (const peerId of peers.keys()) {
    sendToPeer(peerId, data);
  }
}
