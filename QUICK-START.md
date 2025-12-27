# MeshVault React UI - Quick Start Guide

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:3000` with hot reload.

### Production Build

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
meshVault/
├── src/
│   ├── browserAdapter.js      # Bridge: browser.js ↔ React
│   ├── App.jsx                 # Main React component
│   ├── App.css                 # Global styles + theme
│   ├── index.jsx               # React entry point
│   └── components/
│       ├── Identity.jsx        # Username & peer ID
│       ├── PeerList.jsx        # Peer discovery list
│       ├── ChatWindow.jsx      # Message display
│       ├── MessageInput.jsx   # Message input
│       └── FileTransfer.jsx   # File transfer UI
├── browser.js                  # Networking logic (unchanged)
├── index.html                  # HTML entry point
└── vite.config.js              # Vite configuration
```

## 🎨 Features

- ✅ **Modern UI**: Clean, professional design
- ✅ **Dark/Light Mode**: Toggle theme preference
- ✅ **Responsive**: Works on desktop, tablet, mobile
- ✅ **Real-time**: Live peer discovery and messaging
- ✅ **File Transfer**: Progress tracking for file transfers
- ✅ **Non-invasive**: Zero changes to browser.js

## 🔌 How It Works

### The Adapter Pattern

```
browser.js (Networking)
    ↕
browserAdapter.js (Bridge)
    ↕
React Components (UI)
```

**browserAdapter.js** is the critical bridge:
- Reads state from `browser.js` (peers, messages, connections)
- Exposes React-friendly API (sendMessage, sendFile, etc.)
- Updates React state when browser.js state changes
- Triggers browser.js actions from React callbacks

### Key Integration Points

1. **Peer Discovery**: Adapter polls `window.peers` every 1 second
2. **Messages**: Adapter overrides `window.handleChatMessage()` to capture messages
3. **Files**: Adapter watches `#progress` element for transfer updates
4. **Actions**: Adapter manipulates DOM to trigger browser.js handlers

## 📖 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Detailed architecture explanation
- **[INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)**: Integration details
- **[COMPONENT-TREE.md](./COMPONENT-TREE.md)**: Component structure & data flow
- **[README-REACT.md](./README-REACT.md)**: Setup & usage

## 🎯 Component Overview

### Identity
- Username input
- Peer ID display
- Save functionality

### PeerList
- Discovered peers
- Status badges (connected/connecting/discovered/offline)
- Click to select peer

### ChatWindow
- Message bubbles
- Timestamps
- Auto-scroll

### MessageInput
- Text input
- Send button
- Enter key support

### FileTransfer
- File picker
- Progress bar
- Incoming/outgoing file display

## 🔧 API Reference

### browserAdapter Methods

```javascript
// Send message
await browserAdapter.sendMessage(text)

// Send file
await browserAdapter.sendFile(file)

// Select peer
browserAdapter.selectPeer(peerId)

// Set username
browserAdapter.setUsername(username)

// Toggle theme
browserAdapter.toggleDarkMode()

// Get state
const state = browserAdapter.getState()
```

## 🎨 Theme System

Uses CSS variables with `data-theme` attribute:

```css
:root { /* Light theme */ }
[data-theme="dark"] { /* Dark theme */ }
```

Theme preference stored in `localStorage`.

## 📱 Responsive Breakpoints

- **Desktop (>1024px)**: 3-column layout
- **Tablet (768-1024px)**: 2-column layout
- **Mobile (<640px)**: Stacked layout

## 🐛 Troubleshooting

### Peers not showing
- Check `window.peers` exists in console
- Verify adapter initialization
- Check polling interval (1s)

### Messages not appearing
- Verify `handleChatMessage` override
- Check message format (needs `id` and `text`)
- Check state updates

### Files not transferring
- Verify `#fileInput` exists
- Check `#progress` element updates
- Verify event listeners

## 🚦 Next Steps

1. **Install dependencies**: `npm install`
2. **Start dev server**: `npm run dev`
3. **Open browser**: Navigate to `http://localhost:3000`
4. **Start signaling node**: `node node-peer.js <port>`
5. **Test**: Open multiple browser tabs to test peer discovery

## 📝 Notes

- **browser.js is unchanged**: All networking logic remains intact
- **Adapter pattern**: All communication goes through browserAdapter
- **Polling + Events**: Uses both polling and function overrides
- **Optimistic updates**: UI updates immediately, syncs with browser.js

## 🎓 Learning Resources

- React: https://react.dev
- Vite: https://vitejs.dev
- WebRTC: https://webrtc.org
- CSS Variables: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties

