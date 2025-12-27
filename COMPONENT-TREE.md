# MeshVault React UI - Component Tree & Data Flow

## Component Hierarchy

```
App (State Manager)
│
├── Header
│   ├── Title: "🔐 MeshVault"
│   └── ThemeToggle (🌙/☀️)
│
├── Main Layout
│   │
│   ├── Sidebar (280px)
│   │   ├── Identity
│   │   │   ├── Username Input
│   │   │   ├── Save Button
│   │   │   └── Peer ID Display
│   │   │
│   │   └── PeerList
│   │       ├── Header: "Peers (N)"
│   │       └── Peer Items
│   │           ├── Status Badge (●/○)
│   │           ├── Username
│   │           └── "You" Label (if own peer)
│   │
│   ├── Chat Area (flex: 1)
│   │   ├── ChatWindow
│   │   │   ├── Empty State (if no peer selected)
│   │   │   └── Message Bubbles
│   │   │       ├── Message Header
│   │   │       │   ├── Username
│   │   │       │   └── Timestamp
│   │   │       └── Message Text
│   │   │
│   │   └── MessageInput
│   │       ├── Text Input
│   │       └── Send Button
│   │
│   └── File Panel (300px)
│       └── FileTransfer
│           ├── Header: "File Transfer"
│           ├── Incoming File (if receiving)
│           │   ├── File Icon
│           │   ├── File Name & Size
│           │   └── Progress Bar
│           ├── Outgoing File (if sending)
│           │   ├── File Icon
│           │   ├── File Name & Size
│           │   └── Progress Bar
│           └── File Picker (if idle)
│               ├── Upload Icon
│               ├── "Choose file" Text
│               └── File Input (hidden)
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    browser.js (Networking)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  peers   │  │messages  │  │connections│  │  files   │   │
│  │   Map    │  │  Set     │  │    Map    │  │  state   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕ (reads/writes)
┌─────────────────────────────────────────────────────────────┐
│              browserAdapter.js (Adapter Layer)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  State: { peers, messages, selectedPeer, ... }       │   │
│  │                                                       │   │
│  │  Methods:                                            │   │
│  │  - sendMessage(text)                                 │   │
│  │  - sendFile(file)                                    │   │
│  │  - selectPeer(peerId)                                │   │
│  │  - setUsername(username)                             │   │
│  │  - toggleDarkMode()                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Hooks:                                                       │
│  - Overrides window.handleChatMessage()                     │
│  - Overrides window.renderPeers()                           │
│  - Polls window.peers every 1s                              │
│  - Watches #progress element                                │
└─────────────────────────────────────────────────────────────┘
                          ↕ (state updates)
┌─────────────────────────────────────────────────────────────┐
│                    App.jsx (React Root)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  useState(state)                                    │   │
│  │  useEffect(() => {                                  │   │
│  │    browserAdapter.setStateUpdater(setState)        │   │
│  │  })                                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕ (props & callbacks)
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Identity │  │PeerList  │  │ChatWindow│  │MessageIn │   │
│  │          │  │          │  │          │  │          │   │
│  │ Props:   │  │ Props:   │  │ Props:   │  │ Props:   │   │
│  │ - username│  │ - peers  │  │ -messages│  │ -onSend  │   │
│  │ - myPeerId│ │ -selected │ │ -selected│  │ -disabled│   │
│  │          │  │ -onSelect │ │          │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              FileTransfer                            │   │
│  │  Props:                                              │   │
│  │  - onSendFile                                        │   │
│  │  - fileProgress                                      │   │
│  │  - incomingFile                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## State Flow Examples

### Example 1: User Sends Message

```
1. User types in MessageInput
   └─> MessageInput state: message = "Hello"

2. User clicks Send or presses Enter
   └─> MessageInput calls onSendMessage("Hello")

3. App.handleSendMessage("Hello")
   └─> browserAdapter.sendMessage("Hello")

4. browserAdapter.sendMessage()
   ├─> Creates message object
   ├─> Optimistically adds to state.messages
   ├─> Sets #msg input value = "Hello"
   └─> Clicks #send button

5. browser.js #send onclick handler
   ├─> Creates CHAT message
   ├─> Calls forwardMessage()
   └─> Sends to all peers via WebRTC

6. React re-renders ChatWindow
   └─> Shows new message bubble immediately
```

### Example 2: Peer Discovered

```
1. browser.js receives HELLO message
   └─> peers.set(peerId, Date.now())

2. browserAdapter.updatePeerList() (polled every 1s)
   ├─> Reads window.peers
   ├─> Reads window.peerIdentities
   ├─> Reads window.connections
   ├─> Calculates status for each peer
   └─> Updates state.peers

3. browserAdapter.notifyUpdate()
   └─> Calls App.setState(newState)

4. React re-renders PeerList
   └─> Shows new peer with status badge
```

### Example 3: Message Received

```
1. browser.js receives encrypted message
   ├─> Decrypts message
   └─> Calls handleChatMessage(msg)

2. browserAdapter.handleChatMessage() (override)
   ├─> Calls original handleChatMessage()
   └─> Calls this.handleMessage(msg)

3. browserAdapter.handleMessage()
   ├─> Checks if message already exists
   ├─> Creates message object
   ├─> Adds to state.messages
   └─> Calls notifyUpdate()

4. React re-renders ChatWindow
   └─> Shows new message bubble
   └─> Auto-scrolls to bottom
```

### Example 4: File Transfer

```
1. User selects file in FileTransfer
   └─> FileTransfer calls onSendFile(file)

2. App.handleSendFile(file)
   └─> browserAdapter.sendFile(file)

3. browserAdapter.sendFile()
   ├─> Creates DataTransfer
   ├─> Sets #fileInput.files
   └─> Dispatches 'change' event

4. browser.js #fileInput onchange handler
   ├─> Reads file buffer
   ├─> Sends FILE_META message
   ├─> Sends FILE_CHUNK messages
   └─> Updates #progress element

5. browserAdapter.watchFileProgress()
   ├─> Polls #progress element
   ├─> Updates state.fileProgress
   └─> Calls notifyUpdate()

6. React re-renders FileTransfer
   └─> Shows progress bar updating
```

## Props Flow

### Downward (Parent → Child)

```
App
├─> Identity
│   ├─ username: string
│   ├─ myPeerId: string
│   └─ onUsernameChange: (username) => void
│
├─> PeerList
│   ├─ peers: Map<peerId, PeerInfo>
│   ├─ selectedPeer: string | null
│   ├─ onPeerSelect: (peerId) => void
│   └─ myPeerId: string
│
├─> ChatWindow
│   ├─ messages: Array<Message>
│   ├─ selectedPeer: string | null
│   └─ username: string
│
├─> MessageInput
│   ├─ onSendMessage: (text) => void
│   └─ disabled: boolean
│
└─> FileTransfer
    ├─ onSendFile: (file) => void
    ├─ fileProgress: number
    └─ incomingFile: FileInfo | null
```

### Upward (Child → Parent)

```
User Action → Component → Callback → App → browserAdapter → browser.js

Example:
Click Send → MessageInput → onSendMessage("Hello")
  → App.handleSendMessage("Hello")
    → browserAdapter.sendMessage("Hello")
      → Sets #msg value & clicks #send
        → browser.js handles message
```

## Key Integration Points

1. **State Synchronization**: Adapter polls browser.js state every 1 second
2. **Event Capture**: Adapter overrides key functions to capture events
3. **DOM Watching**: Adapter watches DOM elements for updates (progress bar)
4. **Action Triggering**: Adapter manipulates DOM to trigger browser.js handlers
5. **Optimistic Updates**: UI updates immediately, syncs with browser.js

## Component Responsibilities

| Component | Responsibility | State | Side Effects |
|-----------|---------------|-------|--------------|
| **App** | State management, orchestration | All app state | None |
| **Identity** | Username input/display | Local input state | Calls `onUsernameChange` |
| **PeerList** | Display peers, selection | None | Calls `onPeerSelect` |
| **ChatWindow** | Display messages | None | Auto-scrolls |
| **MessageInput** | Text input | Local input state | Calls `onSendMessage` |
| **FileTransfer** | File picker, progress | Local file state | Calls `onSendFile` |

