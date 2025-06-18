// Required dependencies
const { Buffer } = require("node:buffer");
const level = require("level");
const aedes = require("aedes");
const aedesPersistenceLevel = require("aedes-persistence-level");
const net = require("net");
const os = require("os");
const WebSocket = require("ws");
const { v4: uuidv4 } = require('uuid'); // Use UUID for unique client IDs

// --- Configuration ---
const verbose = true; // Enable detailed logging to see message flows
const localIP = getLocalIP();
const wsport = 3000;
const mqttport = 1883;
const DEFAULT_SWRTC_ROOM = "default_swrtc_room"; // Room for SimpleWebRTC clients

// --- Database & Persistence ---
const db = level("./mqtt-store");
const persistence = aedesPersistenceLevel(db);

// --- MQTT Broker Setup (Aedes) ---
const broker = aedes({ persistence });
const mqttServer = net.createServer(broker.handle);

// --- WebRTC Signaling State ---
const rooms = new Map(); // Map<roomId, Set<WebSocket client>> - Stores ws objects
const simpleWebRTCIdToWs = new Map(); // Map<simpleWebRTC_PeerId, WebSocket client>

// --- Utility Functions ---
// Timestamp formatter
function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Get local network IP address
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

// Truncate messages to avoid flooding console
function truncateMessage(message, maxLength = 1024) {
    const truncatedIndicator = " ...[truncated]";
    let msgStr = message;
    // Avoid stringifying large objects if already string
    if (typeof message !== "string") {
        try {
            msgStr = JSON.stringify(message);
        } catch (e) {
            msgStr = String(message); // Fallback
        }
    }
    if (!msgStr || msgStr.length <= maxLength) return msgStr;
    return msgStr.substring(0, maxLength - truncatedIndicator.length) + truncatedIndicator;
}


// --- Helper: Send JSON message to a specific client ---
function sendJsonToClient(client, message) {
    if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
}

// --- Helper: Send Raw String message to a specific client ---
function sendStringToClient(client, message) {
    if (client.readyState === WebSocket.OPEN) {
        client.send(message);
    }
}

// --- Helper: Broadcast JSON message to room members (excluding sender) ---
function broadcastJsonToRoom(roomId, senderWs, message) {
    const room = rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(message); // Stringify once for JSON

    room.forEach(client => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
             if (verbose) console.log(`[WebRTC-JSON] @ ${timestamp()} Relaying ${message.type} from ${senderWs.clientId} to ${client.clientId} in room ${roomId}`);
            client.send(messageString);
        }
    });
}

// --- Helper: Broadcast Raw String message to room members (specifically for SimpleWebRTC) ---
// Needs careful target handling based on SimpleWebRTC's protocol (targetId vs broadcast)
function broadcastStringToRoom(roomId, senderWs, messageString, targetId = "ALL") {
    const room = rooms.get(roomId);
    if (!room) return;

     if (verbose) console.log(`[WebRTC-SWRTC] @ ${timestamp()} Relaying message starting with ${messageString.split('|')[0]} from ${senderWs.simpleWebRTCId || senderWs.clientId} in room ${roomId} (Target: ${targetId})`);

    room.forEach(client => {
        // Don't send back to sender
        if (client === senderWs || client.readyState !== WebSocket.OPEN) {
            return;
        }

        // Check if the target matches or if it's a broadcast ("ALL")
        // Assumes target clients also have `simpleWebRTCId` set if applicable
        if (targetId === "ALL" || client.simpleWebRTCId === targetId) {
            if (verbose) console.log(`   -> Sending SWRTC message to ${client.simpleWebRTCId || client.clientId}`);
            sendStringToClient(client, messageString);
        }
    });
}


// --- MQTT Broker Event Handlers ---
broker.on("clientReady", (client) => {
  console.log(`[MQTT] @ ${timestamp()} Client connected: ${client?.id}`);
});

broker.on("clientDisconnect", (client) => {
  console.log(`[MQTT] @ ${timestamp()} Client disconnected: ${client?.id}`);
});

broker.on("clientError", (client, err) => {
  console.warn(`[MQTT] @ ${timestamp()} Client error: ${client?.id} ->`, err.message);
});

broker.on("publish", (packet, client) => {
    // MQTT -> WebSocket Forwarding Logic (JSON format)
    if (!packet.topic.startsWith("$SYS") && packet.payload) {
        const topic = packet.topic;
        const message = packet.payload.toString();
        // Check if any WebSocket client is subscribed *using the JSON protocol*
        const hasJsonSubs = Array.from(clientSubscriptions.values()).some((subs) => subs.has(topic));
        if (!hasJsonSubs) return;

        wss.clients.forEach((wsClient) => {
            if (wsClient.readyState === WebSocket.OPEN && clientSubscriptions.get(wsClient)?.has(topic)) {
                console.log(`[MQTT->WS] @ ${timestamp()} Forwarding [${topic}] -> Client ${wsClient.clientId} (${message.length} bytes)`);
                sendJsonToClient(wsClient, { type: "mqtt", channel: topic, message });
            }
        });
    }
});

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ port: wsport });
const clientSubscriptions = new Map(); // Track MQTT topic subscriptions per WebSocket client (JSON protocol)

wss.on("connection", (ws) => {
  // Assign unique server-side ID AND initialize SimpleWebRTC ID placeholder
  ws.clientId = uuidv4(); // Server's internal ID
  ws.simpleWebRTCId = null; // ID provided by SimpleWebRTC client (e.g., "AzM-PeerId")
  ws.roomId = null; // Room client is currently in
  clientSubscriptions.set(ws, new Set()); // Initialize MQTT subscription set

  console.log(`[WS] @ ${timestamp()} Client connected: ${ws.clientId}`);

  // Send the client its server-assigned unique ID (for JSON protocol clients)
  sendJsonToClient(ws, { type: 'assign_id', clientId: ws.clientId });

  ws.on("message", (message) => {
    const messageString = message.toString(); // Work with the string form
	// This will log EVERY message that arrives, before any parsing.
    // This is our foolproof catch-all.
    console.log(`[RAW_INCOMING] @ ${timestamp()} from Client ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'}):`, truncateMessage(messageString));
    // --- Try parsing as JSON first ---
    let isJson = false;
    if (messageString.startsWith('{') && messageString.endsWith('}')) {
      try {
        const parsed = JSON.parse(messageString);
        isJson = true;
        if (verbose) console.log(`[WS-JSON] @ ${timestamp()} Received from ${ws.clientId}:`, truncateMessage(parsed));

        // --- JSON Command Handling ---
        const { command, channel, message: mqttMessage, timestamp: msgTs, stackTrace, /* WebRTC fields */ type, roomId, payload, targetClientId } = parsed;

        // --- MQTT Bridging Commands ---
        if (command === "subscribe") {
          if (!clientSubscriptions.get(ws).has(channel)) {
            clientSubscriptions.get(ws).add(channel);
            console.log(`[MQTT] @ ${timestamp()} Client ${ws.clientId} subscribed to [${channel}]`);
          }
        } else if (command === "publish") {
          let payloadToSend = (typeof mqttMessage === "object") ? JSON.stringify(mqttMessage) : mqttMessage;
          console.log(`[WS->MQTT] @ ${timestamp()} Client ${ws.clientId} publishing to [${channel}] -> ${truncateMessage(payloadToSend)}`);
          broker.publish({ topic: channel, payload: payloadToSend, qos: 0, retain: true });
        } else if (command === "unsubscribe") {
          if (clientSubscriptions.get(ws).has(channel)) {
               console.log(`[MQTT] @ ${timestamp()} Client ${ws.clientId} unsubscribed from [${channel}]`);
               clientSubscriptions.get(ws).delete(channel);
          }
        } else if (command === "debug_log") {
          const logTopic = channel || "debug/logs";
          let logPayload;
          try { logPayload = JSON.parse(mqttMessage); } catch { logPayload = { message: mqttMessage }; }
          logPayload.timestamp = msgTs || new Date().toISOString();
          logPayload.stackTrace = stackTrace || null;
          logPayload.clientId = ws.clientId;
          console.log(`[${logTopic}] @ ${logPayload.timestamp} (from ${ws.clientId}): ${truncateMessage(logPayload.message)}`);
          if (logPayload.stackTrace) console.log(`   Stack Trace:\n${truncateMessage(logPayload.stackTrace)}`);
          broker.publish({ topic: logTopic, payload: JSON.stringify(logPayload), qos: 0, retain: false });
        }
        // --- WebRTC Signaling Commands (JSON Protocol) ---
        else if (type === 'join_room') {
            handleJoinRoom(ws, roomId || "default_json_room"); // Use specified or default JSON room
        } else if (type === 'leave_room') {
            handleLeaveRoom(ws);
        } else if (type === 'offer' || type === 'answer' || type === 'ice_candidate') {
          if (!ws.roomId) {
               console.warn(`[WebRTC-JSON] @ ${timestamp()} Client ${ws.clientId} sent ${type} without being in a room.`);
               return;
          }
          if (!payload) {
               console.warn(`[WebRTC-JSON] @ ${timestamp()} Client ${ws.clientId} sent ${type} without payload.`);
               return;
          }
          broadcastJsonToRoom(ws.roomId, ws, { type: type, senderId: ws.clientId, payload: payload });
        } else {
          console.warn(`[WS-JSON] @ ${timestamp()} Received unknown JSON message type/command from ${ws.clientId}:`, truncateMessage(parsed));
        }

      } catch (err) {
        console.error(`[WS] @ ${timestamp()} Error processing JSON message from ${ws.clientId}:`, err);
        console.error("   Original Message:", truncateMessage(messageString)); // Log raw message on error
      }
    }

    // --- If not JSON, try parsing as SimpleWebRTC pipe-delimited format ---
    if (!isJson) {
        //if (verbose) console.log(`[WS-SWRTC] @ ${timestamp()} Received Raw from ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'}):`, truncateMessage(messageString));
        handleSimpleWebRTCMessage(ws, messageString);
    }
  }); // End ws.on('message')

  ws.on("close", () => {
    console.log(`[WS] @ ${timestamp()} Client disconnected: ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'})`);
    handleLeaveRoom(ws); // Clean up room membership regardless of protocol
    clientSubscriptions.delete(ws); // Clean up MQTT subscriptions (if any)
    if(ws.simpleWebRTCId) {
        simpleWebRTCIdToWs.delete(ws.simpleWebRTCId); // Clean up SWRTC ID mapping
    }
  });

  ws.on("error", (error) => {
      console.error(`[WS] @ ${timestamp()} Error for client ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'}):`, error);
      // Ensure cleanup on error as well
      handleLeaveRoom(ws);
      clientSubscriptions.delete(ws);
      if(ws.simpleWebRTCId) {
          simpleWebRTCIdToWs.delete(ws.simpleWebRTCId);
      }
  });
}); // End wss.on('connection')


// --- SimpleWebRTC Message Handler ---
function handleSimpleWebRTCMessage(ws, messageString) {
    // Ignore test messages explicitly if they follow a known pattern
    if (messageString.startsWith("TEST!")) {
        console.log(`[WS-SWRTC] @ ${timestamp()} Received TEST message from ${ws.clientId}, ignoring.`);
        return;
    }

    const parts = messageString.split('|');
    if (parts.length < 3) { // Need at least COMMAND|SenderId|TargetId
        console.warn(`[WS-SWRTC] @ ${timestamp()} Received malformed message from ${ws.clientId}: Not enough parts. Msg: ${truncateMessage(messageString)}`);
        return;
    }

    const command = parts[0];
    const senderId = parts[1]; // This is the ID SimpleWebRTC uses (e.g., "AzM-PeerId")
    const targetId = parts[2]; // "ALL" or a specific simpleWebRTCId
    // const payload = parts.slice(3).join('|'); // Re-join remaining parts for payload if needed

    // Associate the SimpleWebRTC ID with the WebSocket connection if not already done
    // Usually happens on the first message like NEWPEER
    if (!ws.simpleWebRTCId && senderId) {
         // Avoid mapping if senderId looks like a server UUID - might indicate client error
         if (!senderId.includes('-') || senderId.length < 30) {
            console.log(`[WS-SWRTC] @ ${timestamp()} Associating SWRTC ID "${senderId}" with WS Client ${ws.clientId}`);
            ws.simpleWebRTCId = senderId;
            simpleWebRTCIdToWs.set(senderId, ws);
         } else {
             console.warn(`[WS-SWRTC] @ ${timestamp()} Received message with potential UUID as senderId (${senderId}) from unmapped client ${ws.clientId}. Ignoring mapping.`);
         }
    } else if (ws.simpleWebRTCId && ws.simpleWebRTCId !== senderId) {
        // Safety check: If the client sends messages with *different* sender IDs on the same connection
        console.warn(`[WS-SWRTC] @ ${timestamp()} Client ${ws.clientId} sent message with conflicting senderId "${senderId}" (expected "${ws.simpleWebRTCId}"). Ignoring.`);
        return; // Or handle as an error case?
    }


    switch (command) {
        case "NEWPEER":
            console.log(`[WebRTC-SWRTC] @ ${timestamp()} Handling NEWPEER for ${senderId}`);
            handleJoinRoom(ws, DEFAULT_SWRTC_ROOM); // Join the default SWRTC room

            // SimpleWebRTC expects the server to relay the NEWPEER message
            // so other clients know about this new peer.
            broadcastStringToRoom(DEFAULT_SWRTC_ROOM, ws, messageString, "ALL");
            break;

        case "NEWPEERACK":
            console.log(`[WebRTC-SWRTC] @ ${timestamp()} Handling NEWPEERACK from ${senderId}`);
            if (!ws.roomId) {
                console.warn(`[WebRTC-SWRTC] @ ${timestamp()} Client ${ws.simpleWebRTCId || ws.clientId} sent ${command} without being in a room.`);
                return;
            }
            // Relay the ACK message according to the targetId
            broadcastStringToRoom(ws.roomId, ws, messageString, targetId);
            break;

        case "DISPOSE":
            console.log(`[WebRTC-SWRTC] @ ${timestamp()} Handling DISPOSE for ${senderId}`);
            // Relay the dispose message first so peers can clean up
            broadcastStringToRoom(ws.roomId || DEFAULT_SWRTC_ROOM, ws, messageString, "ALL");
            // Then handle server-side cleanup
            handleLeaveRoom(ws);
            break;

        case "OFFER":
        case "ANSWER": // Added anticipation for ANSWER
        case "CANDIDATE":
            console.log(`[WebRTC-SWRTC] @ ${timestamp()} Handling ${command} from ${senderId} targeting ${targetId}`);
            if (!ws.roomId) {
                 console.warn(`[WebRTC-SWRTC] @ ${timestamp()} Client ${ws.simpleWebRTCId || ws.clientId} sent ${command} without being in a room.`);
                 return;
            }
             if (!targetId || targetId === "ALL") {
                 console.warn(`[WebRTC-SWRTC] @ ${timestamp()} Client ${ws.simpleWebRTCId || ws.clientId} sent ${command} without a specific targetId (or target=ALL, which is unusual for OFFER/ANSWER/CANDIDATE). Relaying anyway based on targetId field: ${targetId}`);
                 // Decide if you want to prevent broadcast for these types or allow it based on targetId="ALL"
            }
            // Relay the raw message string to the specific target client(s)
            // broadcastStringToRoom handles targeting based on targetId
            broadcastStringToRoom(ws.roomId, ws, messageString, targetId);
            break;
        case "DATA":
        case "COMPLETE":
            console.log(`[WebRTC-SWRTC] @ ${timestamp()} Handling ${command} from ${senderId} targeting ${targetId}`);
            if (!ws.roomId) {
                 console.warn(`[WebRTC-SWRTC] @ ${timestamp()} Client ${ws.simpleWebRTCId || ws.clientId} sent ${command} without being in a room.`);
                 return;
            }
            // Relay the raw message string to the specific target client(s)
            broadcastStringToRoom(ws.roomId, ws, messageString, targetId);
            break;

        default:
            console.warn(`[WS-SWRTC] @ ${timestamp()} Received unknown SWRTC command "${command}" from ${ws.simpleWebRTCId || ws.clientId}: ${truncateMessage(messageString)}`);
    }
}

// --- Unified Join Room Handler ---
function handleJoinRoom(ws, roomId) {
    if (!roomId) {
        console.warn(`[WebRTC] @ ${timestamp()} Join attempt failed for ${ws.clientId}: No roomId provided.`);
        return;
    }
     // Leave previous room if any
    if (ws.roomId && ws.roomId !== roomId) {
         console.log(`[WebRTC] @ ${timestamp()} Client ${ws.clientId} leaving previous room ${ws.roomId} to join ${roomId}`);
        handleLeaveRoom(ws); // Leave previous room implicitly
    } else if (ws.roomId === roomId) {
        console.log(`[WebRTC] @ ${timestamp()} Client ${ws.clientId} already in room ${roomId}.`);
        return; // Already in the target room
    }

    console.log(`[WebRTC] @ ${timestamp()} Client ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'}) joining room [${roomId}]`);

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
        console.log(`[WebRTC] @ ${timestamp()} Created new room [${roomId}]`);
    }

    // Add client to the room
    rooms.get(roomId).add(ws);
    ws.roomId = roomId; // Set current room

    // Notify the joining client (JSON protocol clients expect this)
    // SimpleWebRTC clients might not need/use this specific message.
    sendJsonToClient(ws, { type: 'joined_room', roomId: roomId });

    // Notify OTHERS in the room about the new peer (JSON protocol)
    // SWRTC protocol notification is handled via relaying the 'NEWPEER' message itself
    broadcastJsonToRoom(roomId, ws, { type: 'peer_joined', peerId: ws.clientId, simpleWebRTCId: ws.simpleWebRTCId }); // Send both IDs if available

}

// --- Unified Leave Room Handler ---
function handleLeaveRoom(ws) {
    const roomId = ws.roomId;
    if (!roomId) return; // Not in any room

    const room = rooms.get(roomId);
    let wasInRoom = false;
    if (room && room.has(ws)) {
        console.log(`[WebRTC] @ ${timestamp()} Client ${ws.clientId} (SWRTC ID: ${ws.simpleWebRTCId || 'N/A'}) leaving room [${roomId}]`);
        room.delete(ws); // Remove client from the room's set
        ws.roomId = null; // Clear the client's room state
        wasInRoom = true;

        // If room is now empty, remove it from memory
        if (room.size === 0) {
            console.log(`[WebRTC] @ ${timestamp()} Room [${roomId}] is now empty, deleting.`);
            rooms.delete(roomId);
        } else {
            // Notify remaining members (handle both protocols)
            // JSON clients get 'peer_left'
            broadcastJsonToRoom(roomId, ws, { type: 'peer_left', peerId: ws.clientId, simpleWebRTCId: ws.simpleWebRTCId });
            // SimpleWebRTC clients should have received the 'DISPOSE' message earlier via relay
            // We could potentially send it here again if needed, but relaying seems more aligned.
            // broadcastStringToRoom(roomId, ws, `DISPOSE|${ws.simpleWebRTCId || 'unknown'}|ALL|Client disconnected`, "ALL");
        }
    }

    // Clean up SWRTC ID mapping if the client is leaving
    if (ws.simpleWebRTCId && simpleWebRTCIdToWs.has(ws.simpleWebRTCId)) {
        simpleWebRTCIdToWs.delete(ws.simpleWebRTCId);
        console.log(`[WebRTC-SWRTC] @ ${timestamp()} Removed SWRTC ID mapping for ${ws.simpleWebRTCId}`);
        ws.simpleWebRTCId = null; // Clear SWRTC ID too
    }


    return wasInRoom; // Return true if the client was actually removed from a room
}


// --- Start Servers ---
mqttServer.listen(mqttport, () => {
  console.log(`[MQTT] @ ${timestamp()} Aedes broker running on port ${mqttport}`);
});

wss.on('listening', () => {
    console.log(`[WS] @ ${timestamp()} WebSocket server listening on port ${wsport}`);
});


console.log(`[Server] @ ${timestamp()} CignvsLab server running on:`);
console.log(`   Process:`, process.arch + " / " + process.platform + " / pid:" + process.pid);
console.log(`   Path:   `, process.cwd());
console.log(`   WS:      ws://${localIP}:${wsport}  <-- Unity Clients connect here`);
console.log(`   MQTT:    mqtt://${localIP}:${mqttport}`);
console.log(`   WebRTC:  enabled (JSON and plain text formats)`);