using System;
using UnityEngine;
using Newtonsoft.Json;
using System.Collections;

namespace CignvsLab
{
    // Script to drop in Unity objects that want to do comms via CommsManager
    public class BigTestMessenger : MonoBehaviour
    {
        private CommsManager commsManager;
        private string testTopic = "test/large";

        [Obsolete]
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
            Debug.Log($"📤 Sending large message as JSON");

            var largePayload = new
            {
                message = new string('A', 10000) // 10,000 characters (~10 KB)
            };

            string jsonMessage = JsonConvert.SerializeObject(largePayload);

            commsManager.PublishToMQTT(testTopic, jsonMessage);
        }

        private void OnMessageReceived(string message)
        {
            Debug.Log($"📩 Received large message eco: {message}");
        }
    }
}
