# MeshVault React UI Setup

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Mode

```bash
npm run dev
```

This will start a Vite dev server at `http://localhost:3000` with hot module replacement.

### 3. Production Build

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

### 4. Preview Production Build

```bash
npm run preview
```

## Project Structure

```
meshVault/
├── src/
│   ├── browserAdapter.js    # Bridge between browser.js and React
│   ├── App.jsx               # Main React component
│   ├── App.css               # Global styles
│   ├── index.jsx             # React entry point
│   └── components/           # React UI components
│       ├── Identity.jsx
│       ├── PeerList.jsx
│       ├── ChatWindow.jsx
│       ├── MessageInput.jsx
│       └── FileTransfer.jsx
├── browser.js                # Existing networking logic (unchanged)
├── index.html                # HTML entry point
└── package.json              # Dependencies
```

## How It Works

1. **browser.js** loads first and initializes all networking logic
2. **browserAdapter.js** hooks into browser.js functions and exposes React-friendly API
3. **React components** consume state from browserAdapter and trigger actions via callbacks
4. **State flows**: browser.js → browserAdapter → React → User Actions → browserAdapter → browser.js

## Key Features

- ✅ Clean, modern UI with dark/light mode
- ✅ Responsive design (desktop, tablet, mobile)
- ✅ Real-time peer discovery and status
- ✅ Chat with message bubbles
- ✅ File transfer with progress
- ✅ Non-invasive integration (browser.js unchanged)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation of:
- Component tree
- State flow
- Integration points
- Function hooks

## Notes

- The React UI is a **pure UI layer** - all networking logic remains in `browser.js`
- The adapter layer (`browserAdapter.js`) bridges React and browser.js without modifying core logic
- All WebRTC, signaling, encryption, and store-and-forward functionality is unchanged

