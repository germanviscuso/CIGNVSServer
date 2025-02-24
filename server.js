const WebSocket = require("ws");
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
const port = 3000;

const wss = new WebSocket.Server({ port });

console.log("🚀 Dharana server running on:");
console.log(`   🌍 Local:   ws://localhost:${port}`);
console.log(`   📡 Network: ws://${localIP}:${port}  <-- COPY THIS TO UNITY`);

wss.on("connection", (ws) => {
  console.log("⚡ A client connected");

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const textMessage = parsedMessage.message;
      const needsAck = parsedMessage.needsAck;

      if (textMessage.startsWith("debug:")) {
        console.log("🐛 [UNITY DEBUG]:", textMessage.replace("debug:", ""));
        return;
      }

      console.log("📩 Message from client:", textMessage);

      // Only send acknowledgment if explicitly requested
      if (needsAck) {
        setTimeout(() => {
          ws.send(JSON.stringify({ ack: `✅ Server received: ${textMessage}` }));
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
