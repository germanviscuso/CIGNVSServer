using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using NativeWebSocket;
using Newtonsoft.Json;

namespace CignvsLab
{
    public class CommsManager : MonoBehaviour
    {
        public string serverUrl = "ws://192.168.50.30:3000"; 
        
        [Tooltip("Enable or disable remote logging.")]
        public bool enableLogging = true;

        [Tooltip("Enable extended logs (includes stack trace).")]
        public bool extendedLogs = false;
        [Tooltip("Enable extended logs (includes stack trace).")]
        public string loggingChannel = "debug";

        private WebSocket websocket;
        private Dictionary<string, Action<string>> channelSubscriptions = new Dictionary<string, Action<string>>();
        private HashSet<string> requestedSubscriptions = new HashSet<string>(); // Prevent duplicate WebSocket requests
        private Queue<(string, string)> messageQueue = new Queue<(string, string)>(); // ✅ Queue for general messages
        private Queue<(string, string)> logQueue = new Queue<(string, string)>(); // ✅ Queue for debug logs

        private List<string> pendingSubscriptions = new List<string>();
        private bool isReconnecting = false;

        async void Start()
        {
            await ConnectToServer();
        }

        public bool IsConnected()
        {
            return websocket != null && websocket.State == WebSocketState.Open;
        }

        async Task ConnectToServer()
        {
            if (websocket != null)
            {
                await websocket.Close();
            }

            websocket = new WebSocket(serverUrl);

            websocket.OnOpen += () =>
            {
                Debug.Log("✅ WebSocket Connected!");

                // ✅ Initialize Remote Logging once connected
                RemoteLogHandler.Initialize(this);

                // ✅ Resubscribe to all pending topics after reconnection
                foreach (string channel in pendingSubscriptions)
                {
                    SubscribeToMQTTChannel(channel);
                }
                pendingSubscriptions.Clear();

                // ✅ Send all cached messages after reconnection
                // while (messageQueue.Count > 0)
                // {
                //     var (channel, message) = messageQueue.Dequeue();
                //     PublishToMQTT(channel, message);
                // }
                FlushQueuedMessages();  // ✅ Send stored messages after reconnection
                FlushQueuedLogs();      // ✅ Send stored logs after reconnection
            };

            websocket.OnMessage += (bytes) =>
            {
                string message = Encoding.UTF8.GetString(bytes);
                HandleIncomingMessage(message);
            };

            websocket.OnError += (e) => { Debug.LogError("🚨 WebSocket Error: " + e); };
            websocket.OnClose += async (e) =>
            {
                Debug.LogWarning("❌ WebSocket Disconnected. Attempting reconnect...");
                await AttemptReconnect();
            };

            await websocket.Connect();
        }

        async Task AttemptReconnect()
        {
            if (isReconnecting) return;
            isReconnecting = true;

            while (!IsConnected())
            {
                Debug.Log("🔄 Attempting to reconnect to WebSocket...");
                await Task.Delay(3000);
                await ConnectToServer();
            }

            isReconnecting = false;
        }

        void Update()
        {
    #if !UNITY_WEBGL || UNITY_EDITOR
            if(websocket != null) websocket.DispatchMessageQueue();
    #endif
        }

        public async void SubscribeToMQTTChannel(string channel)
        {
            if (requestedSubscriptions.Contains(channel))
            {
                Debug.Log($"⚠️ Already requested WebSocket subscription to {channel}, skipping.");
                return;
            }

            if (IsConnected())
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "subscribe",
                    channel = channel
                });

                await websocket.SendText(jsonMessage);
                Debug.Log($"✅ Successfully subscribed to: {channel}");
                requestedSubscriptions.Add(channel);
            }
            else
            {
                Debug.Log($"🔄 Caching subscription request: {channel}");
                if (!pendingSubscriptions.Contains(channel))
                {
                    pendingSubscriptions.Add(channel);
                }
            }
        }

        public async void UnsubscribeFromMQTTChannel(string channel)
        {
            if (IsConnected() && requestedSubscriptions.Contains(channel))
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "unsubscribe",
                    channel = channel
                });

                await websocket.SendText(jsonMessage);
                Debug.Log($"❌ Unsubscribed from: {channel}");
                requestedSubscriptions.Remove(channel);
            }
        }

        public void PublishToChannel(string channel, object message)
        {
            string messageString = JsonConvert.SerializeObject(message);

            if (IsConnected())
            {
                PublishToMQTT(channel, messageString);
            }
            else
            {
                Debug.Log($"🔄 Caching message for offline send: {channel} → {messageString}");
                messageQueue.Enqueue((channel, messageString));
            }
        }

        public void LogToChannel(string channel, string jsonLogMessage)
        {
            if (IsConnected())
            {
                PublishToMQTT(channel, jsonLogMessage);
            }
            else
            {
                Debug.LogWarning($"⚠️ WebSocket offline. Queuing debug log for later: {jsonLogMessage}");
                logQueue.Enqueue((channel, jsonLogMessage));
            }
        }

        private async void PublishToMQTT(string channel, string message)
        {
            if (IsConnected())
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "publish",
                    channel = channel,
                    message = message
                });

                await websocket.SendText(jsonMessage);
                //Debug.Log($"📤 Published to {channel}: {message}");
            }
        }

        private void HandleIncomingMessage(string jsonMessage)
        {
            try
            {
                var parsedMessage = JsonConvert.DeserializeObject<Dictionary<string, object>>(jsonMessage);
                if (parsedMessage.ContainsKey("channel") && parsedMessage.ContainsKey("message"))
                {
                    string channel = parsedMessage["channel"].ToString();
                    string message = parsedMessage["message"].ToString();

                    // ✅ Ignore incoming logs from logging channel to prevent re-logging
                    if (channel.StartsWith(loggingChannel)) return;

                    if (channelSubscriptions.ContainsKey(channel))
                    {
                        channelSubscriptions[channel]?.Invoke(message);
                    }
                    else
                    {
                        Debug.Log($"🔍 No handler for MQTT channel: {channel}");
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogError("❌ Error parsing message: " + e.Message);
            }
        }

        public void SubscribeToChannel(string channel, Action<string> callback)
        {
            if (channelSubscriptions.ContainsKey(channel))
            {
                Debug.Log($"⚠️ Already locally subscribed to {channel}, skipping duplicate.");
                return;
            }

            channelSubscriptions[channel] = callback;
            SubscribeToMQTTChannel(channel);
        }

        public void UnsubscribeFromChannel(string channel)
        {
            if (channelSubscriptions.ContainsKey(channel))
            {
                channelSubscriptions.Remove(channel);
                UnsubscribeFromMQTTChannel(channel);
            }
        }

        private void FlushQueuedMessages()
        {
            while (messageQueue.Count > 0)
            {
                var (channel, queuedMessage) = messageQueue.Dequeue();
                PublishToMQTT(channel, queuedMessage);
            }
        }

        private void FlushQueuedLogs()
        {
            while (logQueue.Count > 0)
            {
                var (channel, queuedLog) = logQueue.Dequeue();
                PublishToMQTT(channel, queuedLog);
            }
        }
    }
}
