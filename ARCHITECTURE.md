# MeshVault React UI Architecture

## Overview

This document explains how the React UI integrates with the existing `browser.js` networking logic without modifying the core WebRTC, signaling, encryption, or store-and-forward functionality.

## Folder Structure

```
meshVault/
├── src/
│   ├── browserAdapter.js      # Bridge between browser.js and React
│   ├── App.jsx                 # Main React application component
│   ├── App.css                 # Global styles and theme variables
│   ├── index.jsx               # React entry point
│   └── components/
│       ├── Identity.jsx        # Username and peer ID display
│       ├── Identity.css
│       ├── PeerList.jsx        # Discovered peers with status badges
│       ├── PeerList.css
│       ├── ChatWindow.jsx      # Message bubbles and chat display
│       ├── ChatWindow.css
│       ├── MessageInput.jsx   # Text input and send button
│       ├── MessageInput.css
│       ├── FileTransfer.jsx   # File picker and progress display
│       └── FileTransfer.css
├── browser.js                  # Existing networking logic (unchanged)
├── index.html                  # HTML entry point (updated for React)
└── package.json                # Dependencies
```

## Component Tree

```
App
├── Header (title + theme toggle)
└── Main Layout
    ├── Sidebar
    │   ├── Identity
    │   └── PeerList
    ├── Chat Area
    │   ├── ChatWindow
    │   └── MessageInput
    └── File Panel
        └── FileTransfer
```

## State Flow

### 1. State Management

**React State** (in `App.jsx`):
- `state.peers` - Map of peerId → { username, lastSeen, status }
- `state.messages` - Array of chat messages
- `state.selectedPeer` - Currently selected peer ID
- `state.fileProgress` - File transfer progress (0-100)
- `state.incomingFile` - Incoming file metadata
- `state.username` - Current user's username
- `state.myPeerId` - Current user's peer ID
- `state.isDarkMode` - Theme preference

**Browser.js State** (existing, unchanged):
- `window.peers` - Map of peerId → lastSeen timestamp
- `window.peerIdentities` - Map of peerId → { username }
- `window.connections` - Map of peerId → { pc, channel }
- `window.seenMessages` - Set of message IDs
- `window.incomingFile` - Incoming file state

### 2. Data Flow Diagram

```
browser.js (Networking)
    ↓ (reads/writes)
browserAdapter.js (Adapter Layer)
    ↓ (updates state)
App.jsx (React State)
    ↓ (props)
Components (UI)
    ↓ (user actions)
Callbacks → browserAdapter → browser.js
```

## How Everything Connects

### Adapter Layer (`browserAdapter.js`)

The adapter layer is the **critical bridge** between React and `browser.js`. It:

1. **Monitors browser.js state** by:
   - Polling `window.peers`, `window.peerIdentities`, `window.connections`
   - Overriding `window.renderPeers()` to detect peer updates
   - Overriding `window.handleChatMessage()` to capture messages
   - Watching DOM elements (like `#progress`) for file transfer updates

2. **Exposes React-friendly API**:
   ```javascript
   browserAdapter.sendMessage(text)      // Send chat message
   browserAdapter.sendFile(file)         // Send file
   browserAdapter.selectPeer(peerId)     // Select peer for chat
   browserAdapter.setUsername(username)  // Set username
   browserAdapter.toggleDarkMode()       // Toggle theme
   ```

3. **Notifies React of changes**:
   - Calls `updateState()` callback when state changes
   - React re-renders components with new data

### Integration Points

#### 1. Peer Discovery
```javascript
// browser.js updates window.peers
peers.set(msg.from, Date.now());

// browserAdapter polls and updates React
updatePeerList() {
  // Reads window.peers, window.peerIdentities, window.connections
  // Updates this.state.peers
  // Calls notifyUpdate()
}
```

#### 2. Chat Messages
```javascript
// browser.js handles message
handleChatMessage(msg) {
  // Original logic...
  log(`[${time}] ${name}: ${msg.text}`);
}

// browserAdapter override captures it
window.handleChatMessage = (msg) => {
  originalHandleChatMessage(msg);  // Call original
  this.handleMessage(msg);         // Update React state
}
```

#### 3. File Transfers
```javascript
// browser.js updates progress element
document.getElementById("progress").value = progress;

// browserAdapter watches progress element
watchFileProgress() {
  const progressEl = document.getElementById("progress");
  this.state.fileProgress = parseInt(progressEl.value);
  this.notifyUpdate();
}
```

#### 4. Sending Messages
```javascript
// React component calls adapter
handleSendMessage(text) {
  browserAdapter.sendMessage(text);
}

// Adapter triggers browser.js
sendMessage(text) {
  const msg = { type: "CHAT", id: uuid(), text, ... };
  window.forwardMessage(msg);  // Calls browser.js function
}
```

#### 5. Sending Files
```javascript
// React component calls adapter
handleSendFile(file) {
  browserAdapter.sendFile(file);
}

// Adapter triggers browser.js file handler
sendFile(file) {
  const fileInput = document.getElementById("fileInput");
  fileInput.files = dataTransfer.files;  // Set file
  fileInput.dispatchEvent(new Event('change'));  // Trigger handler
}
```

## Key Design Decisions

### 1. Non-Invasive Integration
- **No modifications to browser.js**: All networking logic remains untouched
- **Adapter pattern**: BrowserAdapter acts as a facade/proxy
- **Function overriding**: Safely wraps existing functions to add React hooks

### 2. State Synchronization
- **Polling**: Adapter polls browser.js state every 1 second
- **Event hooks**: Overrides key functions to capture events immediately
- **DOM watching**: Monitors DOM elements for state changes (file progress)

### 3. Component Design
- **Controlled components**: All components receive props, emit callbacks
- **Single source of truth**: App.jsx manages all state
- **Separation of concerns**: UI logic separate from networking logic

## Example Function Hooks

### `onPeerSelect(peerId)`
```javascript
// In PeerList.jsx
<li onClick={() => onPeerSelect(peer.peerId)}>

// In App.jsx
const handlePeerSelect = (peerId) => {
  browserAdapter.selectPeer(peerId);
};

// In browserAdapter.js
selectPeer(peerId) {
  this.state.selectedPeer = peerId;
  this.notifyUpdate();
}
```

### `onSendMessage(text)`
```javascript
// In MessageInput.jsx
<form onSubmit={() => onSendMessage(message)}>

// In App.jsx
const handleSendMessage = async (text) => {
  await browserAdapter.sendMessage(text);
};

// In browserAdapter.js
sendMessage(text) {
  const msg = { type: "CHAT", id: uuid(), text, ... };
  window.forwardMessage(msg);  // Triggers browser.js
  // Optimistically update React state
  this.state.messages.push(message);
  this.notifyUpdate();
}
```

### `onSendFile(file)`
```javascript
// In FileTransfer.jsx
<input onChange={(e) => onSendFile(e.target.files[0])}>

// In App.jsx
const handleSendFile = async (file) => {
  await browserAdapter.sendFile(file);
};

// In browserAdapter.js
sendFile(file) {
  const fileInput = document.getElementById("fileInput");
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change'));
}
```

## Theme System

Dark/light mode is implemented using CSS variables:

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #212121;
  /* ... */
}

[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --text-primary: #e0e0e0;
  /* ... */
}
```

The theme is toggled via `document.documentElement.setAttribute('data-theme', 'dark')` and persisted in localStorage.

## Responsive Design

- **Desktop (>1024px)**: Three-column layout (sidebar, chat, files)
- **Tablet (768-1024px)**: Two-column layout (sidebar, chat)
- **Mobile (<640px)**: Stacked layout (sidebar, chat, files)

## Future Enhancements

Potential improvements without modifying browser.js:
1. Message search/filtering
2. Message reactions/emojis
3. Typing indicators (if browser.js exposes connection state)
4. Message read receipts (if browser.js tracks delivery)
5. Rich text formatting
6. Image previews in chat

