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
const mqttClient = mqtt.connect("mqtt://localhost:"+mqttport); // Cambia si usas un broker externo

console.log("🚀 Dharana server running on:");
console.log(`   🌍 Local:   ws://localhost:${wsport}`);
console.log(`   🌍 Local:   mqtt://localhost:${mqttport}`);
console.log(`   📡 Network: ws://${localIP}:${wsport}  <-- COPY THIS TO UNITY`);
console.log(`   📡 Network: mqtt://${localIP}:${mqttport}`);

wss.on("connection", (ws) => {
  console.log("⚡ A client connected");

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const channel = parsedMessage.channel;
      const textMessage = parsedMessage.message;
      const needsAck = parsedMessage.needsAck;

      console.log(`📩 Message on [${channel}]: ${textMessage}`);

      // Si el mensaje es un log, mostrarlo en consola
      if (channel === "debug/logs") {
        console.log(`🐛 [UNITY DEBUG]: ${textMessage}`);
        return;
      }

      // Publicar mensaje en MQTT
      mqttClient.publish(channel, textMessage);

      // Si se necesita ACK
      if (needsAck) {
        setTimeout(() => {
          ws.send(JSON.stringify({ channel: "ack", message: `✅ Received on [${channel}]` }));
          console.log("📡 Sent acknowledgment to client");
        }, 2000);
      }
    } catch (error) {
      console.error("❌ Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

// Escuchar mensajes MQTT y enviarlos a clientes WebSocket
mqttClient.on("message", (topic, message) => {
  console.log(`📡 MQTT Message on [${topic}]: ${message.toString()}`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ channel: topic, message: message.toString() }));
    }
  });
});

// Suscribirse a todos los mensajes MQTT
mqttClient.subscribe("#");
