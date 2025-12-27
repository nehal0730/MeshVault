# Exact Steps to Run MeshVault

## Prerequisites
- Node.js installed
- Dependencies installed: `npm install`

## Step-by-Step Instructions

### Step 1: Start the Signaling Node (Terminal 1)

Open PowerShell/Command Prompt and run:

```bash
cd c:\Users\Admin\Desktop\meshVault
node node-peer.js 9001
```

**Expected output:**
```
📡 UDP signaling on 55555
🌐 Browser connected on WS 9001
```

**Keep this terminal open!** The signaling node must stay running.

### Step 2: Start the React Dev Server (Terminal 2)

Open a **NEW** PowerShell/Command Prompt window and run:

```bash
cd c:\Users\Admin\Desktop\meshVault
npm run dev
```

**Expected output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

**Keep this terminal open!**

### Step 3: Open Browser

1. Open your browser (Chrome/Edge/Firefox)
2. Navigate to: `http://localhost:3000`
3. **You will see a prompt**: "Enter WS port:"
4. **Enter**: `9001` (the port you used in Step 1)
5. Click OK

### Step 4: Set Your Username

1. In the React UI, find the **Identity** section (top left)
2. Enter your username in the input field
3. Click **Save**

### Step 5: Test with Multiple Peers

1. Open a **second browser tab** (or another browser)
2. Navigate to: `http://localhost:3000`
3. Enter WS port: `9001` again
4. Set a different username
5. Both peers should appear in each other's peer list!

## Troubleshooting

### Blank White Page

**Check browser console (F12):**
- Look for JavaScript errors
- Check if React is loading: Should see "Initializing MeshVault..." briefly

**Common fixes:**
1. **Hard refresh**: `Ctrl + Shift + R` or `Ctrl + F5`
2. **Check terminal**: Make sure `npm run dev` is running
3. **Check port**: Make sure port 3000 is not in use
4. **Clear cache**: Clear browser cache and reload

### "Cannot connect to WebSocket"

- Make sure `node-peer.js` is running on port 9001
- Check firewall settings
- Try a different port (e.g., 9002, 9003)

### Peers Not Showing

- Make sure both browser windows have entered the WS port
- Check browser console for errors
- Wait a few seconds (peer discovery happens every 3 seconds)

### React Not Loading

**Check:**
1. `index.html` has: `<script type="module" src="/src/index.jsx"></script>`
2. `src/index.jsx` exists
3. `src/App.jsx` exists
4. All component files exist in `src/components/`

**Verify file structure:**
```
meshVault/
├── index.html          ✓
├── browser.js          ✓
├── node-peer.js        ✓
├── src/
│   ├── index.jsx      ✓
│   ├── App.jsx        ✓
│   ├── browserAdapter.js ✓
│   └── components/    ✓
```

## Quick Verification Checklist

- [ ] `node-peer.js` running (Terminal 1)
- [ ] `npm run dev` running (Terminal 2)
- [ ] Browser at `http://localhost:3000`
- [ ] Entered WS port in prompt
- [ ] React UI visible (not blank)
- [ ] Username set
- [ ] Second browser tab opened
- [ ] Peers appearing in list

## What You Should See

When working correctly:

1. **Header**: "🔐 MeshVault" with theme toggle (🌙/☀️)
2. **Left Sidebar**: 
   - Identity section with username input
   - Peer list below
3. **Center**: Chat window (empty until peer selected)
4. **Bottom**: Message input field
5. **Right Sidebar**: File transfer panel

## Next Steps After Setup

1. **Select a peer** from the peer list (click on it)
2. **Send a message** using the input at the bottom
3. **Send a file** using the file picker on the right
4. **Toggle dark mode** using the 🌙/☀️ button in header

