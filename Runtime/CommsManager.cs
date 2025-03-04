using System;
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
        
        private WebSocket websocket;
        private Dictionary<string, Action<string>> channelSubscriptions = new Dictionary<string, Action<string>>();

        async void Start()
        {
            await ConnectToServer();
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
                RemoteLogHandler.Initialize(websocket, enableLogging, extendedLogs);
                Debug.Log("✅ WebSocket Connected!");
            };

            websocket.OnMessage += (bytes) =>
            {
                string message = Encoding.UTF8.GetString(bytes);
                HandleIncomingMessage(message);
            };

            websocket.OnError += (e) => { Debug.LogError("🚨 WebSocket Error: " + e); };
            websocket.OnClose += (e) => { Debug.LogWarning("❌ WebSocket Disconnected."); };

            await websocket.Connect();
        }

        void Update()
        {
    #if !UNITY_WEBGL || UNITY_EDITOR
            websocket.DispatchMessageQueue();
    #endif
        }

        public async void SubscribeToMQTTChannel(string channel)
        {
            if (websocket.State == WebSocketState.Open)
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "subscribe",
                    channel = channel
                });

                await websocket.SendText(jsonMessage);
                Debug.Log($"🔗 Subscribed to: {channel}");
            }
        }

        public async void UnsubscribeFromMQTTChannel(string channel)
        {
            if (websocket.State == WebSocketState.Open)
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "unsubscribe",
                    channel = channel
                });

                await websocket.SendText(jsonMessage);
                Debug.Log($"❌ Unsubscribed from: {channel}");
            }
        }

        public async void PublishToMQTT(string channel, string message)
        {
            if (websocket.State == WebSocketState.Open)
            {
                var jsonMessage = JsonConvert.SerializeObject(new
                {
                    command = "publish",
                    channel = channel,
                    message = message
                });

                await websocket.SendText(jsonMessage);
                Debug.Log($"📤 Published to {channel}: {message}");
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
            if (!channelSubscriptions.ContainsKey(channel))
            {
                channelSubscriptions[channel] = callback;
                SubscribeToMQTTChannel(channel);
            }
        }

        public void UnsubscribeFromChannel(string channel)
        {
            if (channelSubscriptions.ContainsKey(channel))
            {
                channelSubscriptions.Remove(channel);
                UnsubscribeFromMQTTChannel(channel);
            }
        }
    }
}
