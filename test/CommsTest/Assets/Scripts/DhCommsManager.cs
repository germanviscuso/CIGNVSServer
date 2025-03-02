using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using NativeWebSocket;
using Newtonsoft.Json;

public class DhCommsManager : MonoBehaviour
{
    public string serverUrl = "ws://192.168.50.30:3000"; // URL del servidor WebSocket
    private WebSocket websocket;
    private Dictionary<string, Action<string>> channelSubscriptions = new Dictionary<string, Action<string>>();
    private bool isConnected = false;
    private float reconnectInterval = 5f; // Tiempo entre reintentos de conexión

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
            Debug.Log("✅ WebSocket Connected!");
            isConnected = true;
        };

        websocket.OnError += (e) =>
        {
            Debug.LogError("🚨 WebSocket Error: " + e);
        };

        websocket.OnClose += (e) =>
        {
            Debug.LogWarning("❌ WebSocket Disconnected. Retrying in " + reconnectInterval + " seconds...");
            isConnected = false;
            Invoke(nameof(RetryConnection), reconnectInterval);
        };

        websocket.OnMessage += (bytes) =>
        {
            string message = Encoding.UTF8.GetString(bytes);
            Debug.Log($"📩 Message from Server: {message}");
            HandleIncomingMessage(message);
        };

        await websocket.Connect();
    }

    void Update()
    {
#if !UNITY_WEBGL || UNITY_EDITOR
        websocket.DispatchMessageQueue();
#endif
    }

    private async void RetryConnection()
    {
        Debug.Log("🔄 Retrying WebSocket connection...");
        await ConnectToServer();
    }

    public async void SendMessageToServer(string channel, string message, bool needsAck = false)
    {
        if (websocket.State == WebSocketState.Open)
        {
            var jsonMessage = JsonConvert.SerializeObject(new
            {
                channel = channel,
                message = message,
                needsAck = needsAck
            });

            await websocket.SendText(jsonMessage);
            Debug.Log($"📤 Sent: {jsonMessage}");
        }
        else
        {
            Debug.LogWarning("⚠️ WebSocket is not connected. Message not sent.");
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
                    Debug.Log($"🔍 No handler for channel: {channel}");
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
        }
    }

    private async void OnApplicationQuit()
    {
        await websocket.Close();
    }
}
