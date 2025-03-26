const WebSocket = require("ws");
const aedes = require("aedes")();
const net = require("net");
const os = require("os");

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

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

function truncateMessage(message, maxLength = 2048) {
  const truncatedIndicator = " ...[truncated]";
  if (typeof message !== "string") {
    message = JSON.stringify(message);
  }
  if (!message || message.length <= maxLength) return message;
  return message.substring(0, maxLength - truncatedIndicator.length) + truncatedIndicator;
}

const verbose = false;
const localIP = getLocalIP();
const wsport = 3000;
const mqttport = 1883;

const wss = new WebSocket.Server({ port: wsport });
const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(mqttport, () => {
  console.log(`✅ [server] @ ${timestamp()} Aedes MQTT broker listening on port ${mqttport}`);
});

console.log("\n🚀 CignvsLab server running on:");
console.log(`   🌍 Local:   ws://localhost:${wsport}`);
console.log(`   🌍 Local:   mqtt://localhost:${mqttport}`);
console.log(`   📡 Network: ws://${localIP}:${wsport}  <-- COPY THIS TO UNITY`);
console.log(`   📡 Network: mqtt://${localIP}:${mqttport}`);

const clientSubscriptions = new Map();

wss.on("connection", (ws) => {
  console.log(`⚡ [server] @ ${timestamp()} A client connected`);
  if (!clientSubscriptions.has(ws)) {
    clientSubscriptions.set(ws, new Set());
  }

  ws.on("message", (message) => {
    try {
      if (verbose) console.log(`📩 Received WS message: ${Buffer.byteLength(message, "utf8")} bytes`);
      const parsed = JSON.parse(message);
      let { command, channel, message: mqttMessage, timestamp: msgTs, stackTrace } = parsed;

      if (typeof mqttMessage === "object") mqttMessage = JSON.stringify(mqttMessage);

      if (command === "subscribe") {
        if (!clientSubscriptions.get(ws).has(channel)) {
          clientSubscriptions.get(ws).add(channel);
          console.log(`🔗 Subscribing to [${channel}]`);
          aedes.subscribe(channel, () => {}); // optional, retained messages will still flow
        }
      } else if (command === "publish") {
        console.log(`📤 Publishing to [${channel}] → ${truncateMessage(mqttMessage)}`);
        aedes.publish({ topic: channel, payload: mqttMessage });
      } else if (command === "unsubscribe") {
        console.log(`🔗 Unsubscribing from [${channel}]`);
        clientSubscriptions.get(ws).delete(channel);
      } else if (command === "debug_log") {
        const logTopic = channel || "debug/logs";
        let logPayload;
        try { logPayload = JSON.parse(mqttMessage); } catch { logPayload = { message: mqttMessage }; }
        logPayload.timestamp = msgTs || new Date().toISOString();
        logPayload.stackTrace = stackTrace || null;
        console.log(`🐛 [${logTopic}] @ ${logPayload.timestamp}: ${truncateMessage(logPayload.message)}`);
        if (logPayload.stackTrace) console.log(`🔍 Stack Trace:\n${truncateMessage(logPayload.stackTrace)}`);
        aedes.publish({ topic: logTopic, payload: JSON.stringify(logPayload) });
      }
    } catch (err) {
      console.error(`❌ Error parsing WS message:`, err);
    }
  });

  ws.on("close", () => {
    console.log(`❌ Client disconnected`);
    clientSubscriptions.delete(ws);
  });
});

aedes.on("publish", (packet, client) => {
  if (!packet.topic.startsWith("$SYS") && packet.payload) {
    const topic = packet.topic;
    const message = packet.payload.toString();
    const hasSubs = Array.from(clientSubscriptions.values()).some((subs) => subs.has(topic));
    if (!hasSubs) return;

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && clientSubscriptions.get(client)?.has(topic)) {
        console.log(`📡 MQTT → WS: ${topic} → ${message.length} bytes`);
        client.send(JSON.stringify({ channel: topic, message }));
      }
    });
  }
});
