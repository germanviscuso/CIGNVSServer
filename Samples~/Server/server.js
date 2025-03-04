const WebSocket = require("ws");
const mqtt = require("mqtt");
const os = require("os");

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

const localIP = getLocalIP();
const wsport = 3000;
const mqttport = 1883;

const wss = new WebSocket.Server({ port: wsport });
const mqttClient = mqtt.connect("mqtt://localhost:" + mqttport);

console.log("🚀 CignvsLab server running on:");
console.log(`   🌍 Local:   ws://localhost:${wsport}`);
console.log(`   🌍 Local:   mqtt://localhost:${mqttport}`);
console.log(`   📡 Network: ws://${localIP}:${wsport}  <-- COPY THIS TO UNITY`);
console.log(`   📡 Network: mqtt://${localIP}:${mqttport}`);

const clientSubscriptions = new Map();

wss.on("connection", (ws) => {
  console.log("⚡ A client connected");

  clientSubscriptions.set(ws, new Set());

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const command = parsedMessage.command;
      const channel = parsedMessage.channel;
      const textMessage = parsedMessage.message;
      const timestamp = parsedMessage.timestamp;
      const stackTrace = parsedMessage.stackTrace;

      if (command === "subscribe") {
        console.log(`🔗 Unity requested subscription to [${channel}]`);
        clientSubscriptions.get(ws).add(channel);
        mqttClient.subscribe(channel);
      } 
      else if (command === "unsubscribe") {
        console.log(`🔗 Unity requested to unsubscribe from [${channel}]`);
        clientSubscriptions.get(ws).delete(channel);
        
        // Check if no WebSocket clients are subscribed before unsubscribing from MQTT
        const isTopicStillUsed = Array.from(clientSubscriptions.values()).some(subs => subs.has(channel));
        if (!isTopicStillUsed) {
          mqttClient.unsubscribe(channel);
        }
      } 
      else if (command === "publish") {
        console.log(`📤 Publishing to MQTT: [${channel}] → ${textMessage}`);
        mqttClient.publish(channel, textMessage);
      } 
      else if (command === "debug_log") {
        const logTopic = channel || "debug/logs"; // Default to "debug/logs" if no channel is provided
        
        // 🔥 Print full log details
        if(timestamp){
          console.log(`🐛 [${logTopic}] @ ${timestamp}: ${textMessage}`);
        } else {
          console.log(`🐛 [${logTopic}]: ${textMessage}`);
        }
        if (stackTrace) {
          console.log(`🔍 Stack Trace:\n${stackTrace}`);
        }

        // 🔥 Publish full log to MQTT
        mqttClient.publish(logTopic, JSON.stringify({
          message: textMessage,
          timestamp: timestamp,
          stackTrace: stackTrace
        }));
      }

    } catch (error) {
      console.error("❌ Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    clientSubscriptions.delete(ws);
  });
});

// 🔥 Forward MQTT Messages to Subscribed WebSocket Clients
mqttClient.on("message", (topic, message) => {
  console.log(`📡 MQTT Message on [${topic}]: ${message.toString()}`);

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && clientSubscriptions.get(client)?.has(topic)) {
      client.send(JSON.stringify({ channel: topic, message: message.toString() }));
    }
  });
});
