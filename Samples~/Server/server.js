// Required dependencies
const { Buffer } = require("node:buffer");
const level = require("level");
const aedes = require("aedes");
const aedesPersistenceLevel = require("aedes-persistence-level");
const net = require("net");
const os = require("os");
const WebSocket = require("ws");

// Crea la DB Level en "./mqtt-store"
const db = level("./mqtt-store");

// Instancia la persistencia con aedes-persistence-level
const persistence = aedesPersistenceLevel(db);

// Utility: Timestamp formatter
function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Utility: Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Utility: Truncate messages to avoid flooding console
function truncateMessage(message, maxLength = 2048) {
  const truncatedIndicator = " ...[truncated]";
  if (typeof message !== "string") message = JSON.stringify(message);
  if (!message || message.length <= maxLength) return message;
  return message.substring(0, maxLength - truncatedIndicator.length) + truncatedIndicator;
}

// Server configuration
const verbose = false;
const localIP = getLocalIP();
const wsport = 3000;
const mqttport = 1883;

// Setup persistence layer for Aedes using LevelDB
const broker = aedes({ persistence });

// Set up broker events
broker.on("clientReady", (client) => {
  console.log(`🔌 [server] @ ${timestamp()} MQTT client connected: ${client?.id}`);
});

broker.on("clientDisconnect", (client) => {
  console.log(`🔌 [server] @ ${timestamp()} MQTT client disconnected: ${client?.id}`);
});

broker.on("clientError", (client, err) => {
  console.warn(`⚠️ [server] @ ${timestamp()} MQTT client error: ${client?.id} →`, err.message);
});

broker.on("storePut", (packet, done) => {
  console.log(`💾 [server] @ ${timestamp()} Putting in storage:`, packet.topic);
  done();
});

broker.on("storeDel", (packet, done) => {
  console.log(`🗑 [server] @ ${timestamp()} Deleting from storage:`, packet.topic);
  done();
});

// Start MQTT broker
const mqttServer = net.createServer(broker.handle);
mqttServer.listen(mqttport, () => {
  console.log(`✅ [server] @ ${timestamp()} Aedes MQTT broker with persistence running on port ${mqttport}`);
});

// Start WebSocket server
const wss = new WebSocket.Server({ port: wsport });

// Show connection info
console.log(`🚀 [server] @ ${timestamp()} CignvsLab server running on:`);
console.log(`   🖥️  Host: `, process.arch + "/" + process.platform + "/pid:" + process.pid)
console.log(`   🖥️  Path: `, process.cwd())
console.log(`   🌍 Local:   ws://localhost:${wsport}`);
console.log(`   🌍 Local:   mqtt://localhost:${mqttport}`);
console.log(`   📡 Network: ws://${localIP}:${wsport}  <-- COPY THIS TO UNITY`);
console.log(`   📡 Network: mqtt://${localIP}:${mqttport}`);

// Track topic subscriptions per WebSocket client
const clientSubscriptions = new Map();

wss.on("connection", (ws) => {
  console.log(`⚡ [server] @ ${timestamp()} A WebSocket client connected`);
  if (!clientSubscriptions.has(ws)) {
    clientSubscriptions.set(ws, new Set());
  }

  ws.on("message", (message) => {
    try {
      if (verbose) console.log(`📩 [server] @ ${timestamp()} Received WS message: ${Buffer.byteLength(message, "utf8")} bytes`);

      const parsed = JSON.parse(message);
      let { command, channel, message: mqttMessage, timestamp: msgTs, stackTrace } = parsed;

      if (typeof mqttMessage === "object") mqttMessage = JSON.stringify(mqttMessage);

      if (command === "subscribe") {
        if (!clientSubscriptions.get(ws).has(channel)) {
          clientSubscriptions.get(ws).add(channel);
          console.log(`🔗 [server] @ ${timestamp()} Subscribing to [${channel}]`);
          // No need to call broker.subscribe manually for retained
        }
      } else if (command === "publish") {
        console.log(`📤 [server] @ ${timestamp()} Publishing to [${channel}] → ${truncateMessage(mqttMessage)}`);
        broker.publish({ topic: channel, payload: mqttMessage, qos: 0, retain: true });
      } else if (command === "unsubscribe") {
        console.log(`🔗 [server] @ ${timestamp()} Unsubscribing from [${channel}]`);
        clientSubscriptions.get(ws).delete(channel);
      } else if (command === "debug_log") {
        const logTopic = channel || "debug/logs";
        let logPayload;
        try { logPayload = JSON.parse(mqttMessage); } catch { logPayload = { message: mqttMessage }; }
        logPayload.timestamp = msgTs || new Date().toISOString();
        logPayload.stackTrace = stackTrace || null;
        console.log(`🐛 [${logTopic}] @ ${logPayload.timestamp}: ${truncateMessage(logPayload.message)}`);
        if (logPayload.stackTrace) console.log(`🔍 Stack Trace:\n${truncateMessage(logPayload.stackTrace)}`);
        broker.publish({ topic: logTopic, payload: JSON.stringify(logPayload), qos: 0, retain: true });
      }
    } catch (err) {
      console.error("❌ [server] @ ${timestamp()} Error parsing WS message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ [server] @ ${timestamp()} Client disconnected");
    clientSubscriptions.delete(ws);
  });
});

// MQTT to WebSocket forwarding
broker.on("publish", (packet) => {
  if (!packet.topic.startsWith("$SYS") && packet.payload) {
    const topic = packet.topic;
    const message = packet.payload.toString();
    const hasSubs = Array.from(clientSubscriptions.values()).some((subs) => subs.has(topic));
    if (!hasSubs) return;

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && clientSubscriptions.get(client)?.has(topic)) {
        console.log(`📡 [server] @ ${timestamp()} MQTT → WS: ${topic} → ${message.length} bytes`);
        client.send(JSON.stringify({ channel: topic, message }));
      }
    });
  }
});
