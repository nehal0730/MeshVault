const dgram = require("dgram");
const WebSocket = require("ws");

const SIGNALING_PORT = 55555;
const WS_PORT = Number(process.argv[2]);

if (!WS_PORT) {
  console.log("Usage: node node-peer.js <ws-port>");
  process.exit(1);
}

const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
let ws = null;

udp.on("message", (msg) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg.toString());
  }
});

udp.bind(SIGNALING_PORT, () => {
  udp.setBroadcast(true);
  console.log(`📡 UDP signaling on ${SIGNALING_PORT}`);
});

const wss = new WebSocket.Server({ port: WS_PORT });

wss.on("connection", (socket) => {
  ws = socket;
  console.log(`🌐 Browser connected on WS ${WS_PORT}`);

  socket.on("message", (data) => {
    udp.send(
      Buffer.from(data.toString()),
      SIGNALING_PORT,
      "255.255.255.255"
    );
  });
});