# MeshVault React UI - Integration Guide

## Overview

This guide explains how the React UI integrates with the existing `browser.js` networking layer without modifying any core functionality.

## Component Overview

### 1. **Identity Component** (`src/components/Identity.jsx`)
- **Purpose**: Username input and peer ID display
- **Props**: `username`, `myPeerId`, `onUsernameChange`
- **Features**: 
  - Username input with save button
  - Peer ID display (truncated)
  - Enter key to save

### 2. **PeerList Component** (`src/components/PeerList.jsx`)
- **Purpose**: Display discovered peers with status indicators
- **Props**: `peers`, `selectedPeer`, `onPeerSelect`, `myPeerId`
- **Features**:
  - Status badges (connected, connecting, discovered, offline)
  - Click to select peer for chat
  - Highlights selected peer
  - Shows "You" label for own peer

### 3. **ChatWindow Component** (`src/components/ChatWindow.jsx`)
- **Purpose**: Display chat messages in bubbles
- **Props**: `messages`, `selectedPeer`, `username`
- **Features**:
  - Message bubbles (own vs others)
  - Timestamps with relative time
  - Auto-scroll to bottom
  - Empty state when no peer selected

### 4. **MessageInput Component** (`src/components/MessageInput.jsx`)
- **Purpose**: Text input for sending messages
- **Props**: `onSendMessage`, `disabled`
- **Features**:
  - Enter key to send
  - Send button with icon
  - Disabled when no peer selected

### 5. **FileTransfer Component** (`src/components/FileTransfer.jsx`)
- **Purpose**: File picker and transfer progress
- **Props**: `onSendFile`, `fileProgress`, `incomingFile`
- **Features**:
  - Drag-and-drop file picker
  - Progress bar for transfers
  - Incoming/outgoing file display
  - File size formatting

## State Flow

### React → Browser.js (Actions)

```javascript
// User clicks send message
MessageInput → onSendMessage(text)
  → App.handleSendMessage(text)
    → browserAdapter.sendMessage(text)
      → Sets #msg input value
      → Clicks #send button
        → browser.js handles via existing onclick handler
```

```javascript
// User selects file
FileTransfer → onSendFile(file)
  → App.handleSendFile(file)
    → browserAdapter.sendFile(file)
      → Creates DataTransfer
      → Sets #fileInput.files
      → Dispatches 'change' event
        → browser.js handles via existing onchange handler
```

### Browser.js → React (State Updates)

```javascript
// Peer discovered/updated
browser.js: peers.set(peerId, timestamp)
  → browserAdapter.updatePeerList() (polled every 1s)
    → Reads window.peers, window.peerIdentities, window.connections
    → Updates adapter.state.peers
      → Calls notifyUpdate()
        → App.setState(newState)
          → Components re-render with new peer list
```

```javascript
// Message received
browser.js: handleChatMessage(msg)
  → browserAdapter.handleMessage(msg) (via override)
    → Adds to adapter.state.messages
      → Calls notifyUpdate()
        → App.setState(newState)
          → ChatWindow re-renders with new message
```

## Adapter Layer API

### Methods Available to React Components

```javascript
// Select a peer for chat
browserAdapter.selectPeer(peerId)

// Send a chat message
await browserAdapter.sendMessage(text)

// Send a file
await browserAdapter.sendFile(file)

// Set username
browserAdapter.setUsername(username)

// Toggle dark/light mode
browserAdapter.toggleDarkMode()

// Get current state snapshot
const state = browserAdapter.getState()
```

### State Structure

```javascript
{
  peers: Map<peerId, {
    peerId: string,
    username: string,
    lastSeen: number,
    status: 'connected' | 'connecting' | 'discovered' | 'offline'
  }>,
  messages: Array<{
    id: string,
    from: string,
    text: string,
    time: number,
    username: string,
    isOwn: boolean
  }>,
  selectedPeer: string | null,
  fileProgress: number, // 0-100
  incomingFile: {
    name: string,
    size: number,
    mime: string,
    from: string
  } | null,
  username: string,
  myPeerId: string,
  isDarkMode: boolean
}
```

## Integration Points

### 1. Peer Discovery
- **Browser.js**: Updates `window.peers` Map
- **Adapter**: Polls every 1 second via `updatePeerList()`
- **React**: Receives updated peer list via state

### 2. Chat Messages
- **Browser.js**: Calls `handleChatMessage(msg)` for each message
- **Adapter**: Overrides `window.handleChatMessage` to capture messages
- **React**: Receives messages via state updates

### 3. File Transfers
- **Browser.js**: Updates `#progress` element value
- **Adapter**: Watches progress element via `watchFileProgress()`
- **React**: Receives progress updates via state

### 4. Username Changes
- **React**: Calls `browserAdapter.setUsername(username)`
- **Adapter**: Updates localStorage and triggers `#saveIdentity` click
- **Browser.js**: Handles via existing onclick handler

## Theme System

The theme system uses CSS variables and the `data-theme` attribute:

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

Theme preference is stored in `localStorage` and applied on page load.

## Responsive Breakpoints

- **Desktop (>1024px)**: Three-column layout
- **Tablet (768-1024px)**: Two-column layout (hides file panel)
- **Mobile (<640px)**: Stacked layout

## Testing the Integration

1. **Start the app**: `npm run dev`
2. **Open browser console**: Check for adapter initialization
3. **Verify hooks**: Look for "BrowserAdapter initialized" log
4. **Test peer discovery**: Start multiple instances
5. **Test messaging**: Send messages between peers
6. **Test file transfer**: Send files and verify progress

## Troubleshooting

### Peers not showing up
- Check browser.js is loaded: `window.peers` should exist
- Check adapter initialization: Look for errors in console
- Verify polling: `browserAdapter.updatePeerList()` should run every 1s

### Messages not appearing
- Check `handleChatMessage` override: `window.handleChatMessage` should be wrapped
- Verify message format: Messages need `id` and `text` fields
- Check state updates: `browserAdapter.notifyUpdate()` should be called

### File transfer not working
- Verify file input exists: `document.getElementById("fileInput")`
- Check progress element: `document.getElementById("progress")` should update
- Verify event listeners: File input should have change listener

## Key Design Principles

1. **Non-invasive**: Never modify browser.js directly
2. **Adapter pattern**: All communication goes through browserAdapter
3. **Polling + Events**: Use both polling and function overrides
4. **Optimistic updates**: Update UI immediately, sync with browser.js
5. **Separation of concerns**: UI logic separate from networking logic

