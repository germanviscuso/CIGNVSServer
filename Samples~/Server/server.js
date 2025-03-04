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

const verbose = false;
const localIP = getLocalIP();
const wsport = 3000;
const mqttport = 1883;

const wss = new WebSocket.Server({ port: wsport });
const mqttClient = mqtt.connect("mqtt://localhost:" + mqttport, {
  reconnectPeriod: 1000, // Try reconnecting every 1 second
  connectTimeout: 30 * 1000, // Allow 30 seconds for connection
  clean: false, // Keep session open (ensures subscriptions persist)
  clientId: localIP // anonymous not allowed without auth
});

console.log("🚀 CignvsLab server running on:");
console.log(`   🌍 Local:   ws://localhost:${wsport}`);
console.log(`   🌍 Local:   mqtt://localhost:${mqttport}`);
console.log(`   📡 Network: ws://${localIP}:${wsport}  <-- COPY THIS TO UNITY`);
console.log(`   📡 Network: mqtt://${localIP}:${mqttport}`);

const clientSubscriptions = new Map();

wss.on("connection", (ws) => {
  console.log("⚡ A client connected");

  if (!clientSubscriptions.has(ws)) {
    clientSubscriptions.set(ws, new Set());
  }

  ws.on("message", (message) => {
    try {
      if (verbose) console.log(`📩 [server] Received WebSocket message of size: ${Buffer.byteLength(message, 'utf8')} bytes`);

      const parsedMessage = JSON.parse(message);
      const command = parsedMessage.command;
      const channel = parsedMessage.channel;
      const mqttMessage = parsedMessage.message;
      const timestamp = parsedMessage.timestamp;
      const stackTrace = parsedMessage.stackTrace;

      // 🛠 Detect if message is already an object and convert if necessary
      if (typeof mqttMessage === "object") {
        mqttMessage = JSON.stringify(mqttMessage);
      }

      // if (command === "subscribe") {
      //   console.log(`🔗 Unity requested subscription to [${channel}]`);
      //   clientSubscriptions.get(ws).add(channel);
    
      //   mqttClient.subscribe(channel, (err, granted) => {
      //       if (err) {
      //           console.error(`❌ Failed to subscribe to [${channel}]:`, err);
      //       } else {
      //           console.log(`✅ Successfully subscribed to: ${granted.map(g => g.topic).join(", ")}`);
      //       }
      //   });
      // }
      if (command === "subscribe") {
          if (!clientSubscriptions.get(ws).has(channel)) {
              console.log(`🔗 [server] Unity requested subscription to [${channel}]`);
              clientSubscriptions.get(ws).add(channel);
              mqttClient.subscribe(channel, (err) => {
                  if (!err) {
                      console.log(`✅ [server] Successfully subscribed to: ${channel}`);
                  } else {
                      console.error(`❌ [server] Failed to subscribe to [${channel}]:`, err);
                  }
              });
          } else {
              console.log(`⚠️ [server] Already subscribed to ${channel}, skipping duplicate.`);
          }
      } 
      else if (command === "publish") {
          console.log(`📤 [server] Publishing to MQTT: [${channel}] → ${mqttMessage}`);
          mqttClient.publish(channel, mqttMessage);
      } 
      else if (command === "unsubscribe") {
        console.log(`🔗 [server] Unity requested to unsubscribe from [${channel}]`);
        clientSubscriptions.get(ws).delete(channel);
        
        // Check if no WebSocket clients are subscribed before unsubscribing from MQTT
        const isTopicStillUsed = Array.from(clientSubscriptions.values()).some(subs => subs.has(channel));
        if (!isTopicStillUsed) {
          mqttClient.unsubscribe(channel);
        }
      } 
      else if (command === "publish") {
        console.log(`📤 [server] Publishing to MQTT: [${channel}] → ${mqttMessage}`);
        mqttClient.publish(channel, mqttMessage);
      } 
      // else if (command === "debug_log") {
      //   const logTopic = channel || "debug/logs"; // Defaults to "debug/logs" if no channel is provided
        
      //   // 🔥 Print full log details
      //   if(timestamp){
      //     console.log(`🐛 [${logTopic}] @ ${timestamp}: ${mqttMessage}`);
      //   } else {
      //     console.log(`🐛 [${logTopic}]: ${mqttMessage}`);
      //   }
      //   if (stackTrace) {
      //     console.log(`🔍 Stack Trace:\n${stackTrace}`);
      //   }

      //   // 🔥 Publish full log to MQTT
      //   mqttClient.publish(logTopic, JSON.stringify({
      //     message: mqttMessage,
      //     timestamp: timestamp,
      //     stackTrace: stackTrace
      //   }));
      // }
      else if (command === "debug_log") {
          const logTopic = channel || "debug/logs"; // Defaults to "debug/logs" if no channel is provided
      
          // 🛠 Attempt to parse `mqttMessage` (it is always a string at this point)
          let logMessage;
          try {
              logMessage = JSON.parse(mqttMessage); // Convert to object
          } catch (e) {
              logMessage = { message: mqttMessage }; // Keep as raw text if JSON parsing fails
          }
      
          // ✅ Ensure timestamp and stack trace exist in log object
          logMessage.timestamp = timestamp || new Date().toISOString();
          logMessage.stackTrace = stackTrace || null;
      
          // 🔥 Print full log details to console
          console.log(`🐛 [${logTopic}] @ ${logMessage.timestamp}: ${logMessage.message}`);
          if (logMessage.stackTrace) {
              console.log(`🔍 Stack Trace:\n${logMessage.stackTrace}`);
          }
      
          // 🔥 Publish full log to MQTT as proper JSON
          mqttClient.publish(logTopic, JSON.stringify(logMessage));
      }    
    } catch (error) {
      console.error("❌ [server] Error parsing WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    console.log("❌ [server] Client disconnected");
    clientSubscriptions.delete(ws);
  });
});

mqttClient.on("connect", () => {
  console.log("✅ [server] Connected to MQTT broker");
});

mqttClient.on("error", (err) => {
  console.error("❌ [server] MQTT Error:", err.message);
});

mqttClient.on("close", () => {
  console.warn("⚠️ [server] MQTT Connection closed, attempting to reconnect...");
});

// 🔥 Forward MQTT Messages to Subscribed WebSocket Clients
mqttClient.on("message", (topic, message) => {
  console.log(`📡 [server] Received MQTT Message on [${topic}]: ${message.toString()}`);

  wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && clientSubscriptions.get(client)?.has(topic)) {
          console.log(`📡 [server] Forwarding MQTT → WebSocket: ${topic} → ${message}`);
          client.send(JSON.stringify({ channel: topic, message: message.toString() }));
      } else {
          console.log(`⚠️ [server] No WebSocket clients subscribed to [${topic}]`);
      }
  });
});
