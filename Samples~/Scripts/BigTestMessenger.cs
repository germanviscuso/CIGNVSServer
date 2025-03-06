using System;
using UnityEngine;
using Newtonsoft.Json;
using System.Collections;

namespace CignvsLab
{
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

            // ✅ Subscribe immediately (CommsManager queues if not connected)
            commsManager.SubscribeToChannel(testTopic, OnMessageReceived);

            // ✅ Wait 3 seconds and then send a test message
            Invoke(nameof(SendTestMessage), 3f);
        }

        private void SendTestMessage()
        {
            Debug.Log($"📤 Sending large message as JSON");

            var largePayload = new
            {
                message = new string('A', 50000) // (~50 KB of 'A's)
            };

            string jsonMessage = JsonConvert.SerializeObject(largePayload);

            commsManager.PublishToChannel(testTopic, jsonMessage);
        }

        private void OnMessageReceived(string message)
        {
            Debug.Log($"📩 Received large message echo: {message}");
        }
    }
}
