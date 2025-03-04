using System;
using UnityEngine;
using Newtonsoft.Json;
using System.Collections;

namespace CignvsLab
{
    // Script to drop in Unity objects that want to do comms via CommsManager
    public class TestMessenger : MonoBehaviour
    {
        private CommsManager commsManager;
        private string testTopic = "test/topic";

        void Start()
        {
            commsManager = FindObjectOfType<CommsManager>();

            if (commsManager == null)
            {
                Debug.LogError("❌ CommsManager not found in scene!");
                return;
            }

            StartCoroutine(WaitForWebSocketAndSubscribe());

            Invoke(nameof(SendTestMessage), 3f);
        }

        IEnumerator WaitForWebSocketAndSubscribe()
        {
            Debug.Log("⏳ Waiting for WebSocket connection before subscribing...");

            while (commsManager == null || !commsManager.IsConnected())
            {
                yield return new WaitForSeconds(1f);
            }

            Debug.Log($"✅ Subscribing to MQTT topic: {testTopic}");
            commsManager.SubscribeToChannel(testTopic, OnMessageReceived);
        }

        private void SendTestMessage()
        {
            string message = $"Hello from Unity! {DateTime.Now.ToLongTimeString()}";
            Debug.Log($"📤 Sending: {message}");

            commsManager.PublishToMQTT(testTopic, message);
        }

        private void OnMessageReceived(string message)
        {
            Debug.Log($"📩 Received: {message}");
        }
    }
}
