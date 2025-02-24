using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using NativeWebSocket;
using Newtonsoft.Json;
using UnityEngine.XR.Interaction.Toolkit.Interactables;
using UnityEngine.XR.Interaction.Toolkit;

public class WS_XRGrabListener : MonoBehaviour
{
    public string serverUrl = "ws://localhost:3000"; // Copy from server logs
    private WebSocket websocket;
    //private float timer = 0f;
    //private float interval = 5f; // Send every 5 seconds
    private XRGrabInteractable grabbable;

    private void Awake()
    {
        grabbable = GetComponent<XRGrabInteractable>();
        if (grabbable != null)
        {
            grabbable.selectEntered.AddListener(OnGrab); // grabbed event
            grabbable.selectExited.AddListener(OnRelease); // released event
        }
        else
        {
            Debug.LogWarning("No XRGrabInteractable found on this GameObject.");
        }
    }

    private void OnGrab(SelectEnterEventArgs arg)
    {
        //SendDebug("🟢 Sphere grabbed! Attempting to send message...");
        SendMessageToServer("🟢 Sphere grabbed!", true);
    }

    private void OnRelease(SelectExitEventArgs arg)
    {
        //SendDebug("🔴 Sphere released! Attempting to send message...");
        SendMessageToServer("🔴 Sphere released!", true);
    }

    async void Start()
    {
        websocket = new WebSocket(serverUrl);

        websocket.OnOpen += () =>
        {
            SendDebug("✅ WebSocket Connected!");
            SendMessageToServer("Test message from Unity", true);
        };

        websocket.OnError += (e) =>
        {
            SendDebug("🚨 WebSocket Error: " + e);
        };

        websocket.OnClose += (e) =>
        {
            SendDebug("❌ WebSocket Disconnected");
        };

        websocket.OnMessage += (bytes) =>
        {
            string message = Encoding.UTF8.GetString(bytes);
            SendDebug($"📩 Message from Server: {message}");
        };

        await websocket.Connect();
    }

    void Update()
    {
#if !UNITY_WEBGL || UNITY_EDITOR
        websocket.DispatchMessageQueue();
#endif

        // Timer to send the current time every 5 seconds
        // timer += Time.deltaTime;
        // if (timer >= interval)
        // {
        //     timer = 0f; // Reset timer
        //     string timeMessage = $"🕒 Current time: {DateTime.Now:HH:mm:ss}";
        //     SendMessageToServer(timeMessage, false); // No need for an ACK
        // }
    }

    public async void SendMessageToServer(string message, bool needsAck)
    {
        if (websocket.State == WebSocketState.Open)
        {
            // Create a structured JSON message
            var jsonMessage = JsonConvert.SerializeObject(new
            {
                message = message,
                needsAck = needsAck
            });

            await websocket.SendText(jsonMessage);
            SendDebug($"📤 Sent: {jsonMessage}");
        }
    }

    private async void OnApplicationQuit()
    {
        await websocket.Close();
    }

    private async void SendDebug(string message)
    {
        Debug.Log(message); // Local debug

        if (websocket.State == WebSocketState.Open)
        {
            var jsonDebugMessage = JsonConvert.SerializeObject(new
            {
                message = $"debug:{message}",
                needsAck = false // Debug messages do not need acknowledgment
            });

            await websocket.SendText(jsonDebugMessage);
        }
    }
}
