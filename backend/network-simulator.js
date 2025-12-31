/**
 * Network Simulator for Testing MeshVault
 * Simulates 3-5 devices, network disconnections, and hotspot switching
 * 
 * Usage:
 *   node network-simulator.js <wsPort> <numDevices>
 *   Example: node network-simulator.js 8080 4
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const SIMULATION_DURATION = 5 * 60 * 1000; // 5 minutes
const HOTSPOT_SWITCH_INTERVAL = 30 * 1000; // Switch hotspot every 30 seconds
const RECONNECT_DELAY = 2000; // Delay before reconnecting after disconnect
const CRASH_PROBABILITY = 0.05; // 5% chance of unexpected disconnect

class VirtualDevice {
  constructor(deviceId, wsUrl) {
    this.deviceId = deviceId;
    this.wsUrl = wsUrl;
    this.peerId = `peer-${deviceId}`;
    this.username = `Device${deviceId}`;
    this.ws = null;
    this.isConnected = false;
    this.connectionStartTime = null;
    this.totalMessagesReceived = 0;
    this.totalMessagesSent = 0;
    this.hotspotId = Math.floor(Math.random() * 2); // 0 or 1 for 2 hotspots
    this.connectionAttempts = 0;
    this.stats = {
      connections: 0,
      disconnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      fileTransfersInitiated: 0,
      fileTransfersReceived: 0,
      hotswitches: 0,
      errors: 0
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.connectionAttempts++;
        
        const ws = new WebSocket(this.wsUrl);

        ws.onopen = () => {
          this.ws = ws;
          this.isConnected = true;
          this.connectionStartTime = Date.now();
          this.stats.connections++;
          console.log(`✅ [${this.deviceId}] Connected (attempt #${this.connectionAttempts})`);
          
          // Start sending HELLO messages
          this.helloInterval = setInterval(() => {
            if (this.isConnected && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "HELLO",
                from: this.peerId,
                username: this.username
              }));
            }
          }, 3000);

          // Simulate random messages
          this.startSendingMessages();

          // Simulate random disconnects (network instability)
          this.scheduleRandomDisconnect();

          resolve();
        };

        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          this.totalMessagesReceived++;
          this.stats.messagesReceived++;

          // Log received messages (sample)
          if (msg.from && msg.type === "HELLO") {
            console.log(`  📨 [${this.deviceId}] Received HELLO from ${msg.from}`);
          }
        };

        ws.onerror = (error) => {
          this.stats.errors++;
          console.error(`❌ [${this.deviceId}] WebSocket error:`, error.message);
          reject(error);
        };

        ws.onclose = () => {
          this.isConnected = false;
          this.stats.disconnections++;
          const duration = Date.now() - this.connectionStartTime;
          console.log(`🔌 [${this.deviceId}] Disconnected (duration: ${Math.floor(duration / 1000)}s)`);
          
          if (this.helloInterval) {
            clearInterval(this.helloInterval);
          }
          if (this.messageInterval) {
            clearInterval(this.messageInterval);
          }
        };
      } catch (error) {
        this.stats.errors++;
        reject(error);
      }
    });
  }

  startSendingMessages() {
    this.messageInterval = setInterval(() => {
      if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) return;

      // Random chance to send a message
      if (Math.random() < 0.3) { // 30% chance every interval
        const messages = [
          "Hello from device!",
          "Testing mesh network...",
          "Is anyone there?",
          "MeshVault is working!",
          "Peer-to-peer communication test"
        ];
        
        const msg = {
          type: "CHAT_MESSAGE",
          from: this.peerId,
          username: this.username,
          text: messages[Math.floor(Math.random() * messages.length)],
          time: Date.now()
        };

        this.ws.send(JSON.stringify(msg));
        this.totalMessagesSent++;
        this.stats.messagesSent++;
        console.log(`  📤 [${this.deviceId}] Sent message`);
      }

      // Random chance to initiate file transfer
      if (Math.random() < 0.05) { // 5% chance
        const fileMsg = {
          type: "FILE_META",
          from: this.peerId,
          fileId: `file-${this.peerId}-${Date.now()}`,
          name: `test-file-${Math.floor(Math.random() * 100)}.txt`,
          size: Math.floor(Math.random() * 1000000) + 1000, // 1KB - 1MB
          mime: "text/plain"
        };

        this.ws.send(JSON.stringify(fileMsg));
        this.stats.fileTransfersInitiated++;
        console.log(`  📁 [${this.deviceId}] Initiated file transfer: ${fileMsg.name}`);
      }
    }, 5000); // Check every 5 seconds
  }

  scheduleRandomDisconnect() {
    const disconnectDelay = Math.floor(Math.random() * 45000) + 15000; // 15-60 seconds
    
    setTimeout(() => {
      if (!this.isConnected) return;

      if (Math.random() < CRASH_PROBABILITY) {
        // Simulate unexpected crash/disconnect
        console.log(`  💥 [${this.deviceId}] Simulating unexpected disconnect...`);
        if (this.ws) {
          this.ws.close();
        }
        
        // Attempt reconnect after delay
        setTimeout(() => {
          if (!this.isConnected) {
            this.connect().catch(err => {
              console.error(`Failed to reconnect device ${this.deviceId}:`, err.message);
            });
          }
        }, RECONNECT_DELAY);
      } else {
        // Schedule next potential disconnect
        this.scheduleRandomDisconnect();
      }
    }, disconnectDelay);
  }

  switchHotspot() {
    const oldHotspot = this.hotspotId;
    this.hotspotId = 1 - this.hotspotId; // Toggle between 0 and 1
    this.stats.hotswitches++;
    
    console.log(`  🔄 [${this.deviceId}] Switched hotspot: ${oldHotspot} → ${this.hotspotId}`);
    
    // In a real scenario, this would disconnect and reconnect to a different network
    // For simulation, we just log it
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.helloInterval) {
      clearInterval(this.helloInterval);
    }
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
    }
  }

  printStats() {
    console.log(`\n📊 Device ${this.deviceId} Stats:`);
    console.log(`   Connections: ${this.stats.connections}`);
    console.log(`   Disconnections: ${this.stats.disconnections}`);
    console.log(`   Messages Sent: ${this.stats.messagesSent}`);
    console.log(`   Messages Received: ${this.stats.messagesReceived}`);
    console.log(`   File Transfers: ${this.stats.fileTransfersInitiated}`);
    console.log(`   Hotspot Switches: ${this.stats.hotswitches}`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log(`   Status: ${this.isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
  }
}

async function runNetworkSimulation(wsPort, numDevices) {
  console.log('\n🌐 Network Simulator Starting');
  console.log(`   WebSocket Port: ${wsPort}`);
  console.log(`   Simulated Devices: ${numDevices}`);
  console.log(`   Duration: ${SIMULATION_DURATION / 1000} seconds\n`);

  const wsUrl = `ws://localhost:${wsPort}`;
  const devices = [];

  // Create and connect devices
  for (let i = 0; i < numDevices; i++) {
    const device = new VirtualDevice(i + 1, wsUrl);
    devices.push(device);

    try {
      await device.connect();
      console.log(`✨ Device ${i + 1} connected\n`);
      
      // Stagger connections slightly
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`Failed to connect device ${i + 1}:`, error.message);
    }
  }

  // Simulate hotspot switching
  const hotswitchInterval = setInterval(() => {
    const randomDevice = devices[Math.floor(Math.random() * devices.length)];
    randomDevice.switchHotspot();
  }, HOTSPOT_SWITCH_INTERVAL);

  // Run simulation for specified duration
  console.log('🚀 Simulation running... (Press Ctrl+C to stop)\n');

  const simulationEndTime = Date.now() + SIMULATION_DURATION;

  const statusInterval = setInterval(() => {
    const connectedCount = devices.filter(d => d.isConnected).length;
    console.log(`📈 Status Update: ${connectedCount}/${devices.length} devices connected`);
  }, 30000); // Every 30 seconds

  // Cleanup on exit
  const cleanup = () => {
    console.log('\n\n🛑 Simulation stopping...\n');
    
    clearInterval(hotswitchInterval);
    clearInterval(statusInterval);

    devices.forEach(device => device.disconnect());

    // Print final stats
    console.log('\n═══════════════════════════════════════════');
    console.log('📋 SIMULATION RESULTS');
    console.log('═══════════════════════════════════════════\n');

    let totalMessages = 0;
    let totalFiles = 0;
    let totalErrors = 0;
    let totalHotswitches = 0;

    devices.forEach(device => {
      device.printStats();
      totalMessages += device.stats.messagesSent;
      totalFiles += device.stats.fileTransfersInitiated;
      totalErrors += device.stats.errors;
      totalHotswitches += device.stats.hotswitches;
    });

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 NETWORK STATISTICS');
    console.log('═══════════════════════════════════════════');
    console.log(`Total Messages Sent: ${totalMessages}`);
    console.log(`Total File Transfers: ${totalFiles}`);
    console.log(`Total Hotspot Switches: ${totalHotswitches}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Average Messages per Device: ${Math.floor(totalMessages / devices.length)}`);
    console.log('\n✅ Simulation Complete!\n');

    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Auto-exit after simulation duration
  setTimeout(cleanup, SIMULATION_DURATION);
}

// Parse command line arguments
const wsPort = process.argv[2] || '8080';
const numDevices = parseInt(process.argv[3] || '4');

if (numDevices < 3 || numDevices > 5) {
  console.error('❌ Number of devices must be between 3 and 5');
  process.exit(1);
}

runNetworkSimulation(wsPort, numDevices).catch(error => {
  console.error('❌ Simulation failed:', error);
  process.exit(1);
});
